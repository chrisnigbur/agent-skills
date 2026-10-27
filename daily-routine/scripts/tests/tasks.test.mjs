import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTask, loadTasks, saveTask } from '../lib/tasks.mjs'
import { EXAMPLE, routineWith } from './fixtures.mjs'

const minimal = id => `---\nid: ${id}\ntitle: ${id} title\n---\n\nbody\n`

test('tasks: defaults filled', () => {
  const folder = routineWith({ 'a-task': minimal('a-task') })
  const t = loadTask(join(folder, 'tasks', 'a-task'))
  assert.equal(t.id, 'a-task')
  assert.equal(t.title, 'a-task title')
  assert.equal(t.ticket, null)
  assert.equal(t.status, 'active')
  assert.equal(t.added, null)
  assert.deepEqual(t.end, { date: null, condition: null, then: 'ask' })
  for (const k of ['decisions', 'requires', 'memory', 'shared', 'after']) assert.deepEqual(t[k], [], k)
  assert.deepEqual(t.roles, {})
  assert.equal(t.model, null)
  assert.equal(t.body, '\nbody\n')
})

test('tasks: the design example loads', () => {
  const folder = routineWith({ 'example-watch': EXAMPLE })
  const t = loadTask(join(folder, 'tasks', 'example-watch'))
  assert.deepEqual(t.roles, { fetch: 'sonnet', judge: 'opus' })
  assert.deepEqual(t.requires, ['vpn'])
})

test('tasks: id must match folder', () => {
  const folder = routineWith({ 'a-task': minimal('other') })
  assert.throws(() => loadTask(join(folder, 'tasks', 'a-task')), /id "other" must match its folder "a-task"/)
})

test('tasks: id must be kebab-case', () => {
  const folder = routineWith({ Bad_ID: minimal('Bad_ID') })
  assert.throws(() => loadTask(join(folder, 'tasks', 'Bad_ID')), /id/)
})

test('tasks: bad end.date rejected', () => {
  const folder = routineWith({ 'a-task': `---\nid: a-task\ntitle: t\nend:\n  date: 2026-13-01\n---\n` })
  assert.throws(() => loadTask(join(folder, 'tasks', 'a-task')), /end\.date/)
})

test('tasks: bad model or role model rejected', () => {
  const folder = routineWith({
    'a-task': `---\nid: a-task\ntitle: t\nmodel: --x\n---\n`,
    'b-task': `---\nid: b-task\ntitle: t\nroles:\n  fetch: "two words"\n---\n`,
  })
  assert.throws(() => loadTask(join(folder, 'tasks', 'a-task')), /model/)
  assert.throws(() => loadTask(join(folder, 'tasks', 'b-task')), /roles\.fetch/)
})

test('loadTasks: one broken TASK.md becomes {id, error}, the others load', () => {
  const folder = routineWith({ 'b-good': minimal('b-good'), 'a-bad': '---\nid: a-bad\nnotes: |\n---\n' })
  mkdirSync(join(folder, 'tasks', 'c-empty-folder'))
  const tasks = loadTasks(folder)
  assert.deepEqual(tasks.map(t => t.id), ['a-bad', 'b-good', 'c-empty-folder'])
  assert.match(tasks[0].error, /line 3/)
  assert.equal(tasks[1].error, undefined)
  assert.match(tasks[2].error, /TASK\.md/)
})

test('loadTasks: no tasks folder gives an empty list', () => {
  assert.deepEqual(loadTasks(mkdtempSync(join(tmpdir(), 'dr empty '))), [])
})

test('saveTask: changing end.date keeps body bytes identical', () => {
  const crlf = EXAMPLE.replace(/\n/g, '\r\n')
  const folder = routineWith({ 'example-watch': crlf })
  const dir = join(folder, 'tasks', 'example-watch')
  const t = loadTask(dir)
  t.end.date = '2026-12-31'
  saveTask(t)
  const text = readFileSync(join(dir, 'TASK.md'), 'utf8')
  assert.ok(text.endsWith(crlf.slice(crlf.indexOf('\r\n---\r\n', 4) + 7)), 'body unchanged')
  assert.equal(loadTask(dir).end.date, '2026-12-31')
  assert.ok(!/[^\r]\n/.test(text), 'still CRLF')
})

const withShadow = lines => `---\nid: s-task\ntitle: S\n${lines}\n---\n\nbody\n`
const shadowOf = lines => loadTasks(routineWith({ 's-task': withShadow(lines) }))[0]

test('shadow: missing or null -> null', () => {
  assert.equal(shadowOf('model: opus').shadow, null)
  assert.equal(shadowOf('shadow: null').shadow, null)
})

test('shadow: model only -> until 5, scope full', () => {
  assert.deepEqual(shadowOf('shadow:\n  model: sonnet').shadow, { model: 'sonnet', until: 5, scope: 'full' })
})

test('shadow: all fields kept', () => {
  const t = shadowOf('roles:\n  fetch: sonnet\n  judge: opus\nshadow:\n  model: haiku\n  until: 3\n  scope: judge')
  assert.deepEqual(t.shadow, { model: 'haiku', until: 3, scope: 'judge' })
})

test('shadow: errors name the field', () => {
  const cases = [
    ['shadow:\n  until: 5', 'shadow.model must be a model name like "sonnet"'],
    ['shadow:\n  model: sonnet\n  until: 0', 'shadow.until must be a whole number of runs, 1 or more'],
    ['shadow:\n  model: sonnet\n  until: two', 'shadow.until must be a whole number of runs, 1 or more'],
    ['shadow:\n  model: sonnet\n  scope: half', 'shadow.scope must be full or judge'],
    ['shadow:\n  model: sonnet\n  scope: judge', 'shadow.scope judge needs roles (fetch and judge)'],
  ]
  for (const [lines, error] of cases) assert.equal(shadowOf(lines).error, error, lines)
})
