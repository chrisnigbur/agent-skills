import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allowRules, absolutePathRule } from '../lib/rules.mjs'

const SETUP = join(dirname(fileURLToPath(import.meta.url)), '..', 'setup.mjs')
const json = file => JSON.parse(readFileSync(file, 'utf8'))
function place() {
  const root = mkdtempSync(join(tmpdir(), 'dr setup '))
  const home = join(root, 'home dir')
  mkdirSync(home)
  const memory = join(root, 'mem folder', 'MEMORY.md')
  mkdirSync(dirname(memory))
  writeFileSync(memory, '# index\n'.repeat(300))
  return { root, home, memory, folder: join(root, 'my routine') }
}
const setup = (p, ...args) => spawnSync(process.execPath, [SETUP, '--home', p.home, '--folder', p.folder, ...args], { encoding: 'utf8' })

test('rules: absolute path rules for a Windows path and a POSIX path', () => {
  assert.equal(absolutePathRule('Edit', 'C:\\src\\my routine'), 'Edit(//c/src/my routine/**)')
  assert.equal(absolutePathRule('Read', '/home/me/routine'), 'Read(//home/me/routine/**)')
  const rules = allowRules({ folder: 'C:\\r' })
  assert.ok(rules.includes('Bash(node *daily-routine*routine.mjs*)'))
  assert.ok(rules.includes('Bash(node *daily-routine*update-check.mjs*)'))
  assert.ok(rules.includes('Read(//c/r/**)') && rules.includes('Edit(//c/r/**)'))
  assert.ok(!allowRules({}).some(r => r.startsWith('Read(')))
})

test('fresh setup creates folder, files, pointer, rules', () => {
  const p = place()
  const r = setup(p, '--memory', p.memory, '--name', 'morning routine', '--model', 'opus')
  assert.equal(r.status, 0, r.stderr)
  for (const sub of ['tasks', 'runs', 'shared']) assert.ok(existsSync(join(p.folder, sub)), sub)
  assert.ok(existsSync(join(p.folder, 'shared', 'RULES.md')))
  const config = json(join(p.folder, 'routine.json'))
  assert.deepEqual(config, { name: 'morning routine', memory: p.memory, model: 'opus', maxParallel: 4, requirements: {}, schedule: null })
  assert.match(readFileSync(join(p.folder, 'CLAUDE.md'), 'utf8'), /Say "run the morning routine"/)
  assert.deepEqual(json(join(p.home, '.daily-routine.json')), { folder: p.folder })
  const allow = json(join(p.folder, '.claude', 'settings.json')).permissions.allow
  assert.ok(allow.includes('Bash(node *daily-routine*routine.mjs*)'))
  assert.match(r.stdout, /memory: ok \(\d+ KB\)/)
  assert.ok(!existsSync(join(p.home, '.claude', 'settings.json')), 'no auto-update without the flag')
})

test('re-run keeps routine.json values and adds a missing field', () => {
  const p = place()
  setup(p, '--memory', p.memory, '--model', 'opus')
  const file = join(p.folder, 'routine.json')
  const c = json(file)
  c.requirements = { vpn: { check: 'exit 0', hint: 'connect' } }
  delete c.maxParallel
  writeFileSync(file, JSON.stringify(c))
  assert.equal(setup(p).status, 0)
  const after = json(file)
  assert.equal(after.model, 'opus')
  assert.equal(after.memory, p.memory)
  assert.deepEqual(after.requirements, { vpn: { check: 'exit 0', hint: 'connect' } })
  assert.equal(after.maxParallel, 4)
})

test('--model none writes null', () => {
  const p = place()
  setup(p, '--model', 'opus')
  setup(p, '--model', 'none')
  assert.equal(json(join(p.folder, 'routine.json')).model, null)
})

test('a bad model is refused before anything is written', () => {
  const p = place()
  const r = setup(p, '--model', '--x')
  assert.equal(r.status, 1)
  assert.ok(!existsSync(p.folder))
})

test('--auto-update keeps unrelated user settings and other marketplaces', () => {
  const p = place()
  mkdirSync(join(p.home, '.claude'))
  const userFile = join(p.home, '.claude', 'settings.json')
  writeFileSync(userFile, JSON.stringify({ theme: 'dark', extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'a/b' } } } }))
  assert.equal(setup(p, '--auto-update').status, 0)
  const u = json(userFile)
  assert.equal(u.theme, 'dark')
  assert.deepEqual(u.extraKnownMarketplaces.other, { source: { source: 'github', repo: 'a/b' } })
  assert.deepEqual(u.extraKnownMarketplaces['agent-skills'], { source: { source: 'github', repo: 'chrisnigbur/agent-skills' }, autoUpdate: true })
  assert.match(setup(p, '--auto-update').stdout, /private repo: auto-update uses this machine's git login/)
})

test('rules: the Bash rule pattern covers the plugin cache path (a version folder after daily-routine)', () => {
  const rule = allowRules({})[0].slice('Bash('.length, -1)
  const re = new RegExp('^' + rule.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  assert.ok(re.test('node "C:/Users/A B/.claude/plugins/cache/agent-skills/daily-routine/0.1.0/scripts/routine.mjs" status'))
  assert.ok(re.test('node C:/src/agent-skills/daily-routine/scripts/routine.mjs status'))
  assert.ok(re.test('node "D:\\Home\\A B\\.claude\\plugins\\cache\\agent-skills\\daily-routine\\0.1.0\\scripts\\routine.mjs" status'), 'backslash path')
})

test('rules not duplicated on re-run, other folder settings kept', () => {
  const p = place()
  setup(p)
  const file = join(p.folder, '.claude', 'settings.json')
  const s = json(file)
  s.permissions.allow.push('Bash(git status)')
  s.model = 'sonnet'
  writeFileSync(file, JSON.stringify(s))
  setup(p)
  const after = json(file)
  assert.equal(after.model, 'sonnet')
  assert.equal(after.permissions.allow.filter(r => r === 'Bash(node *daily-routine*routine.mjs*)').length, 1)
  assert.ok(after.permissions.allow.includes('Bash(git status)'))
})

test('CLAUDE.md and shared/RULES.md are not overwritten', () => {
  const p = place()
  setup(p)
  writeFileSync(join(p.folder, 'CLAUDE.md'), 'mine')
  writeFileSync(join(p.folder, 'shared', 'RULES.md'), 'my rules')
  setup(p, '--name', 'other')
  assert.equal(readFileSync(join(p.folder, 'CLAUDE.md'), 'utf8'), 'mine')
  assert.equal(readFileSync(join(p.folder, 'shared', 'RULES.md'), 'utf8'), 'my rules')
})

test('--memory missing prints MISSING and exits 0', () => {
  const p = place()
  const r = setup(p, '--memory', join(p.root, 'nope', 'MEMORY.md'))
  assert.equal(r.status, 0)
  assert.match(r.stdout, /memory: MISSING /)
})

test('--folder is required', () => {
  const p = place()
  const r = spawnSync(process.execPath, [SETUP, '--home', p.home], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /--folder/)
})
