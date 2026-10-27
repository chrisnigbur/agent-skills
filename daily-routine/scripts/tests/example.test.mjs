import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../lib/frontmatter.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..', '..')
const REPO = join(PLUGIN, '..')

test('example routine loads and status is sane', () => {
  const r = spawnSync(process.execPath, [join(PLUGIN, 'scripts', 'routine.mjs'), 'status', '--folder', join(PLUGIN, 'examples', 'routine'), '--today', '2026-10-27'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const s = JSON.parse(r.stdout)
  assert.deepEqual(s.tasks.map(t => [t.id, t.state, t.endDue]), [['disk-space', 'ready', true]])
})

test('plugin files exist and the skill has name and description', () => {
  for (const f of ['skills/daily-routine/SKILL.md', 'commands/setup.md', 'hooks/hooks.json', 'README.md',
    'skills/daily-routine/references/task-format.md', 'skills/daily-routine/references/report-format.md',
    'skills/daily-routine/references/subagent-brief.md', 'skills/daily-routine/references/adding-a-task.md'])
    assert.ok(existsSync(join(PLUGIN, f)), f)
  const { data } = parseFrontmatter(readFileSync(join(PLUGIN, 'skills', 'daily-routine', 'SKILL.md'), 'utf8'))
  assert.equal(data.name, 'daily-routine')
  assert.match(data.description, /run the morning routine/)
  for (const ref of ['task-format.md', 'report-format.md', 'subagent-brief.md', 'adding-a-task.md'])
    assert.match(readFileSync(join(PLUGIN, 'skills', 'daily-routine', 'SKILL.md'), 'utf8'), new RegExp(ref.replace('.', '\\.')), ref)
})

test('the report never drops a task whose file has a problem (state error)', () => {
  const skill = readFileSync(join(PLUGIN, 'skills', 'daily-routine', 'SKILL.md'), 'utf8')
  const format = readFileSync(join(PLUGIN, 'skills', 'daily-routine', 'references', 'report-format.md'), 'utf8')
  assert.match(skill, /state: error/)
  assert.match(format, /Not run yet because the task file has a problem/)
})

// Only the engine goes in this repo: no account numbers, home paths or the owner's surname.
const FORBIDDEN = /\b\d{12}\b|nig[b]ur|[A-Z]:\\Users\\/i
function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', '.superpowers'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else yield p
  }
}

test('no private data in the repo', () => {
  const hits = []
  for (const file of files(REPO)) {
    if (file === fileURLToPath(import.meta.url)) continue
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (FORBIDDEN.test(line.replace(/chrisnigbur/gi, ''))) hits.push(`${relative(REPO, file)}:${i + 1}: ${line.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(hits, [])
})
