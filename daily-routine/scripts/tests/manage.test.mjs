import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { loadTask } from '../lib/tasks.mjs'
import { cli, routine } from './fixtures.mjs'

const load = (folder, id = 'a-task') => loadTask(join(folder, 'tasks', id))
const taskFile = (folder, id = 'a-task') => join(folder, 'tasks', id, 'TASK.md')

const SHADOWED = '---\nid: backups\ntitle: Missing backups?\nrequires: [db]\nmodel: opus\nshadow:\n  model: sonnet\n  until: 5\nend:\n  date: 2026-12-31\n---\n\nbody\n'
const ENDLESS = '---\nid: plain\ntitle: Plain check\nend:\n  condition: "3 clean runs"\n---\n\nbody\n'
const RETIRED = '---\nid: old\ntitle: Old check\nstatus: retired\n---\n\nbody\n'

function listRoutine() {
  const folder = routine({ backups: SHADOWED, plain: ENDLESS, old: RETIRED, broken: '---\nid: broken\n---\n' })
  const marker = join(folder, 'check-ran')
  writeFileSync(join(folder, 'routine.json'), JSON.stringify({
    name: 'test routine', model: 'opus',
    requirements: { db: { check: `node -e "require('fs').writeFileSync(process.argv[1],'x')" "${marker}"`, hint: 'h' } },
  }))
  writeFileSync(join(folder, 'tasks', 'backups', 'history.md'), '## 2026-10-28 12:28Z\n\nran\n')
  writeFileSync(join(folder, 'tasks', 'backups', 'shadow.md'),
    '| When | Verdict | Outcomes | Main | Shadow | Notes |\n|---|---|---|---|---|---|\n| 2026-10-28 12:28Z | match | clean | x | x | |\n')
  return { folder, marker }
}

test('list prints every task without running requirement checks', () => {
  const { folder, marker } = listRoutine()
  const r = cli(folder, 'list')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(marker), false, 'list must not run checks')
  assert.match(r.stdout, /\| Task \| Title \| Model \| Requires \| Ends \| Last run \|/)
  assert.match(r.stdout, /\| backups \| Missing backups\? \| opus \(shadow sonnet, 1 of 5\) \| db \| 2026-12-31 \| 2026-10-28 \|/)
  assert.match(r.stdout, /\| plain \| Plain check \| opus \|  \| when: 3 clean runs \| never \|/)
  assert.match(r.stdout, /Retired: old \(Old check\)/)
  assert.match(r.stdout, /Task file has a problem: broken: title is required/)
})

test('list --json gives the same rows as data', () => {
  const { folder } = listRoutine()
  const r = cli(folder, 'list', '--json')
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const backups = out.tasks.find(t => t.id === 'backups')
  assert.deepEqual(
    { model: backups.model, requires: backups.requires, end: backups.end, lastRun: backups.lastRun, shadow: backups.shadow },
    { model: 'opus', requires: ['db'], end: { date: '2026-12-31', condition: null, then: 'ask' }, lastRun: '2026-10-28', shadow: { model: 'sonnet', until: 5, scope: 'full', streak: 1, findingsInStreak: 0 } })
  assert.deepEqual(out.retired, [{ id: 'old', title: 'Old check' }])
  assert.deepEqual(out.errors, [{ id: 'broken', error: 'title is required' }])
})

test('list on a routine with no tasks says so', () => {
  const r = cli(routine({}), 'list')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /No tasks yet/)
})

test('decide unretire brings a retired task back', () => {
  const folder = routine()
  cli(folder, 'decide', 'a-task', 'retire', '--note', 'n', '--today', '2026-10-27')
  const r = cli(folder, 'decide', 'a-task', 'unretire', '--note', 'Chris: bring it back', '--today', '2026-10-28')
  assert.equal(r.status, 0, r.stderr)
  const t = load(folder)
  assert.equal(t.status, 'active')
  assert.equal(t.decisions[1], '2026-10-28: unretire - Chris: bring it back')
})

test('decide unretire on an active task is refused', () => {
  const folder = routine()
  const r = cli(folder, 'decide', 'a-task', 'unretire', '--note', 'n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /not retired/)
})

function setRoutine(task = '---\nid: a-task\ntitle: A\nrequires: [vpn]   # needs the VPN\nmodel: sonnet\nroles: {}\nmemory: [m]\n---\n\nbody\n') {
  const folder = routine({ 'a-task': task })
  writeFileSync(join(folder, 'routine.json'), JSON.stringify({ name: 't', requirements: { vpn: { hint: 'h' }, db: { hint: 'h' }, aws: { hint: 'h' } } }))
  return folder
}

test('decide set --requires replaces the list and keeps other lines', () => {
  const folder = setRoutine()
  const r = cli(folder, 'decide', 'a-task', 'set', '--requires', 'db,aws', '--note', 'Chris: needs database access, not the VPN', '--today', '2026-10-28')
  assert.equal(r.status, 0, r.stderr)
  const t = load(folder)
  assert.deepEqual(t.requires, ['db', 'aws'])
  assert.deepEqual(t.memory, ['m'])
  assert.equal(t.decisions[0], '2026-10-28: set requires [db, aws] - Chris: needs database access, not the VPN')
  assert.match(readFileSync(taskFile(folder), 'utf8'), /^requires: \[db, aws\]   # needs the VPN$/m, 'comments stay, as everywhere decide writes')
  cli(folder, 'decide', 'a-task', 'set', '--requires', 'none', '--note', 'n')
  assert.deepEqual(load(folder).requires, [])
})

test('decide set --requires refuses a name routine.json does not define', () => {
  const folder = setRoutine()
  const before = readFileSync(taskFile(folder), 'utf8')
  const r = cli(folder, 'decide', 'a-task', 'set', '--requires', 'db,vnp', '--note', 'n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /unknown requirement "vnp".*aws, db, vpn/)
  assert.equal(readFileSync(taskFile(folder), 'utf8'), before)
})

test('decide set --model changes the model; none falls back to the routine default', () => {
  const folder = setRoutine()
  cli(folder, 'decide', 'a-task', 'set', '--model', 'opus', '--note', 'n', '--today', '2026-10-28')
  assert.equal(load(folder).model, 'opus')
  assert.equal(load(folder).decisions[0], '2026-10-28: set model opus - n')
  cli(folder, 'decide', 'a-task', 'set', '--model', 'none', '--note', 'n2', '--today', '2026-10-28')
  assert.equal(load(folder).model, null)
  assert.equal(load(folder).decisions[1], '2026-10-28: set model none (routine default) - n2')
})

test('decide set --shadow adds a shadow, and none removes it', () => {
  const folder = setRoutine()
  const r = cli(folder, 'decide', 'a-task', 'set', '--model', 'opus', '--shadow', 'sonnet', '--note', 'copied check: Opus main, Sonnet shadow', '--today', '2026-10-28')
  assert.equal(r.status, 0, r.stderr)
  let t = load(folder)
  assert.equal(t.model, 'opus')
  assert.deepEqual(t.shadow, { model: 'sonnet', until: 5, scope: 'full' })
  assert.equal(t.decisions[0], '2026-10-28: set model opus, shadow sonnet - copied check: Opus main, Sonnet shadow')
  cli(folder, 'decide', 'a-task', 'set', '--shadow', 'haiku', '--note', 'n')
  assert.equal(load(folder).shadow.model, 'haiku')
  cli(folder, 'decide', 'a-task', 'set', '--shadow', 'none', '--note', 'n')
  t = load(folder)
  assert.equal(t.shadow, null)
  assert.deepEqual(t.memory, ['m'])
  assert.equal(t.body, '\nbody\n')
})

test('decide set refuses no changes, bad models and a shadow equal to the model', () => {
  const folder = setRoutine()
  const before = readFileSync(taskFile(folder), 'utf8')
  assert.match(cli(folder, 'decide', 'a-task', 'set', '--note', 'n').stderr, /set needs --model, --requires or --shadow/)
  assert.equal(cli(folder, 'decide', 'a-task', 'set', '--model', '-x', '--note', 'n').status, 1)
  assert.match(cli(folder, 'decide', 'a-task', 'set', '--shadow', 'sonnet', '--note', 'n').stderr, /shadow must be a different model/)
  assert.equal(readFileSync(taskFile(folder), 'utf8'), before)
})

test('decide set keeps a CRLF file CRLF and its comments', () => {
  const folder = setRoutine('---\r\nid: a-task\r\ntitle: A\r\nrequires: [vpn]\r\nmodel: sonnet  # cheap\r\n---\r\n\r\nbody\r\n')
  assert.equal(cli(folder, 'decide', 'a-task', 'set', '--model', 'opus', '--requires', 'db', '--note', 'n').status, 0)
  const text = readFileSync(taskFile(folder), 'utf8')
  assert.match(text, /^model: opus  # cheap\r$/m)
  assert.match(text, /^requires: \[db\]\r$/m)
  assert.equal(text.replace(/\r\n/g, '').includes('\n'), false)
})

const ROUTINE_MJS = join(import.meta.dirname, '..', 'routine.mjs')
const run = (args, opts = {}) => spawnSync(process.execPath, [ROUTINE_MJS, ...args], { encoding: 'utf8', ...opts })

test('help lists every command with its flags and names the routine folder', () => {
  const folder = routine()
  const r = cli(folder, 'help')
  assert.equal(r.status, 0, r.stderr)
  for (const command of ['status', 'list', 'record', 'log', 'decide', 'new', 'shadow', 'help']) {
    assert.match(r.stdout, new RegExp(`^  ${command}\\b`, 'm'), `help lists ${command}`)
  }
  assert.match(r.stdout, /decide <task-id> set \[--model <model>\|none\] \[--requires <a,b>\|none\] \[--shadow <model>\|none\]/)
  assert.ok(r.stdout.includes(`Routine folder: ${folder}`))
  assert.equal(run(['--help', '--folder', folder]).stdout, r.stdout, '--help prints the same')
})

test('help works without a routine folder and says how to make one', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dr none '))
  const r = run(['help'], { cwd: empty, env: { ...process.env, USERPROFILE: empty, HOME: empty } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Routine folder: none yet \(run \/daily-routine:setup\)/)
})

test('an unknown command points at help', () => {
  const r = cli(routine(), 'lsit')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /unknown command "lsit": run routine\.mjs help/)
})
