import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadTask } from '../lib/tasks.mjs'
import { cli, routine } from './fixtures.mjs'

const load = (folder, id = 'a-task') => loadTask(join(folder, 'tasks', id))

test('decide extend --until sets the date and appends the decision', () => {
  const folder = routine()
  const r = cli(folder, 'decide', 'a-task', 'extend', '--until', '2026-11-14', '--note', 'Chris: one more week', '--today', '2026-10-27')
  assert.equal(r.status, 0, r.stderr)
  const t = load(folder)
  assert.equal(t.end.date, '2026-11-14')
  assert.deepEqual(t.decisions, ['2026-10-27: extend until 2026-11-14 - Chris: one more week'])
  assert.equal(t.body, '\nbody\n')
})

test('decide extend --condition keeps the date unless --until none', () => {
  const folder = routine()
  cli(folder, 'decide', 'a-task', 'extend', '--until', '2026-11-14', '--note', 'n', '--today', '2026-10-27')
  cli(folder, 'decide', 'a-task', 'extend', '--condition', '3 clean runs', '--note', 'n2', '--today', '2026-10-28')
  assert.deepEqual(load(folder).end, { date: '2026-11-14', condition: '3 clean runs', then: 'ask' })
  cli(folder, 'decide', 'a-task', 'extend', '--until', 'none', '--condition', 'ticket ships', '--note', 'n3', '--today', '2026-10-29')
  const t = load(folder)
  assert.deepEqual(t.end, { date: null, condition: 'ticket ships', then: 'ask' })
  assert.equal(t.decisions[2], '2026-10-29: extend (ticket ships) - n3')
})

test('decide keep clears the end', () => {
  const folder = routine()
  cli(folder, 'decide', 'a-task', 'extend', '--until', '2026-11-14', '--condition', 'c', '--note', 'n', '--today', '2026-10-27')
  cli(folder, 'decide', 'a-task', 'keep', '--note', 'Chris: keep it, no end date', '--today', '2026-10-28')
  const t = load(folder)
  assert.deepEqual(t.end, { date: null, condition: null, then: 'ask' })
  assert.equal(t.decisions[1], '2026-10-28: keep - Chris: keep it, no end date')
})

test('decide retire sets status', () => {
  const folder = routine()
  cli(folder, 'decide', 'a-task', 'retire', '--note', 'end condition met', '--today', '2026-10-27')
  const t = load(folder)
  assert.equal(t.status, 'retired')
  assert.equal(t.decisions[0], '2026-10-27: retire - end condition met')
})

test('decide refuses bad input and leaves the file alone', () => {
  const folder = routine()
  const before = readFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), 'utf8')
  assert.equal(cli(folder, 'decide', 'a-task', 'extend', '--note', 'n').status, 1)
  assert.equal(cli(folder, 'decide', 'a-task', 'extend', '--until', '2026-13-01', '--note', 'n').status, 1)
  assert.equal(cli(folder, 'decide', 'a-task', 'retire').status, 1, 'note is required')
  assert.equal(cli(folder, 'decide', 'a-task', 'pause', '--note', 'n').status, 1)
  assert.equal(readFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), 'utf8'), before)
})

test('new creates from the template', () => {
  const folder = routine({})
  const r = cli(folder, 'new', 'upload-watch', '--title', 'Watch: do pushes go through?', '--today', '2026-10-27')
  assert.equal(r.status, 0, r.stderr)
  const t = load(folder, 'upload-watch')
  assert.equal(t.title, 'Watch: do pushes go through?')
  assert.equal(t.added, '2026-10-27')
  assert.deepEqual(t.decisions, ['2026-10-27: added'])
  assert.equal(t.status, 'active')
  for (const h of ['## What it watches', '## Steps', '## Reading the result']) assert.ok(t.body.includes(h), h)
})

test('new refuses an existing folder and a bad id', () => {
  const folder = routine()
  assert.equal(cli(folder, 'new', 'a-task').status, 1)
  const bad = cli(folder, 'new', 'Bad_ID')
  assert.equal(bad.status, 1)
  assert.equal(existsSync(join(folder, 'tasks', 'Bad_ID')), false)
})

test('decide rewrites only the lines it changes: comments, # in titles and quoted backslashes survive', async () => {
  const { writeFileSync } = await import('node:fs')
  const original = [
    '---',
    'id: a-task',
    'title: Check #11 nightly uploads',
    'status: active   # active | retired',
    'end:',
    '  date: 2026-10-20   # last day',
    '  condition: "D:\\data\\y.csv exists"',
    '  then: ask',
    'requires: [vpn]   # needs the tunnel',
    '---',
    '',
    'body',
    '',
  ].join('\r\n')
  const folder = routine({ 'a-task': original })
  writeFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), original)
  const r = cli(folder, 'decide', 'a-task', 'extend', '--until', '2026-11-14', '--note', 'Chris: extend', '--today', '2026-10-27')
  assert.equal(r.status, 0, r.stderr)
  const text = readFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), 'utf8')
  assert.equal(text, [
    '---',
    'id: a-task',
    'title: Check #11 nightly uploads',
    'status: active   # active | retired',
    'end:',
    '  date: 2026-11-14   # last day',
    '  condition: "D:\\data\\y.csv exists"',
    '  then: ask',
    'requires: [vpn]   # needs the tunnel',
    'decisions:',
    '  - "2026-10-27: extend until 2026-11-14 - Chris: extend"',
    '---',
    '',
    'body',
    '',
  ].join('\r\n'))
  cli(folder, 'decide', 'a-task', 'retire', '--note', 'done', '--today', '2026-10-28')
  const after = readFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), 'utf8')
  assert.match(after, /status: retired   # active \| retired\r\n/)
  assert.match(after, /  - "2026-10-27: extend until 2026-11-14 - Chris: extend"\r\n  - "2026-10-28: retire - done"\r\n---/)
})

test('decide on a task with no end block adds one', () => {
  const folder = routine()
  cli(folder, 'decide', 'a-task', 'extend', '--condition', '3 clean runs', '--note', 'n', '--today', '2026-10-27')
  assert.deepEqual(load(folder).end, { date: null, condition: '3 clean runs', then: 'ask' })
  assert.equal(load(folder).body, '\nbody\n')
})

test('decide and new refuse text with a line break', () => {
  const folder = routine()
  assert.equal(cli(folder, 'decide', 'a-task', 'keep', '--note', 'line1\nline2').status, 1)
  assert.equal(cli(folder, 'decide', 'a-task', 'extend', '--condition', 'a\nb', '--note', 'n').status, 1)
  assert.equal(cli(folder, 'new', 'b-task', '--title', 'a\r\nb').status, 1)
  assert.equal(load(folder).decisions.length, 0)
})

const SHADOWED = '---\nid: a-task\ntitle: A\nmodel: opus\nshadow:\n  model: sonnet\n  until: 5\nmemory: []\n---\n\nbody\n'

test('decide adopt-shadow switches the model and removes the shadow', () => {
  const folder = routine({ 'a-task': SHADOWED })
  const r = cli(folder, 'decide', 'a-task', 'adopt-shadow', '--note', 'Chris: switch it to Sonnet', '--today', '2026-11-02')
  assert.equal(r.status, 0, r.stderr)
  const t = load(folder)
  assert.equal(t.model, 'sonnet')
  assert.equal(t.shadow, null)
  assert.deepEqual(t.decisions, ['2026-11-02: adopt-shadow (model sonnet) - Chris: switch it to Sonnet'])
  assert.deepEqual(t.memory, [])
})

test('decide unshadow keeps the model', () => {
  const folder = routine({ 'a-task': SHADOWED })
  assert.equal(cli(folder, 'decide', 'a-task', 'unshadow', '--note', 'Chris: Sonnet misses too much', '--today', '2026-11-02').status, 0)
  const t = load(folder)
  assert.equal(t.model, 'opus')
  assert.equal(t.shadow, null)
  assert.deepEqual(t.decisions, ['2026-11-02: unshadow - Chris: Sonnet misses too much'])
})

test('decide adopt-shadow without a shadow -> exit 1 "this task has no shadow"', () => {
  const folder = routine()
  for (const action of ['adopt-shadow', 'unshadow']) {
    const r = cli(folder, 'decide', 'a-task', action, '--note', 'n')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /this task has no shadow/)
  }
  assert.match(cli(folder, 'decide', 'a-task', 'pause', '--note', 'n').stderr, /use extend, keep, retire, adopt-shadow or unshadow/)
})

test('decide: shadow.md is left in place after either', () => {
  const folder = routine({ 'a-task': SHADOWED })
  writeFileSync(join(folder, 'tasks', 'a-task', 'shadow.md'), '# Shadow log: a-task\n')
  cli(folder, 'decide', 'a-task', 'unshadow', '--note', 'n')
  assert.equal(readFileSync(join(folder, 'tasks', 'a-task', 'shadow.md'), 'utf8'), '# Shadow log: a-task\n')
})

test('decide adopt-shadow refuses a judge-scoped shadow and leaves the file alone', () => {
  const text = '---\nid: a-task\ntitle: A\nroles:\n  fetch: sonnet\n  judge: opus\nshadow:\n  model: haiku\n  scope: judge\n---\n\nbody\n'
  const folder = routine({ 'a-task': text })
  const r = cli(folder, 'decide', 'a-task', 'adopt-shadow', '--note', 'n')
  assert.equal(r.status, 1)
  assert.match(r.stderr, /judge-scoped shadow/)
  assert.equal(readFileSync(join(folder, 'tasks', 'a-task', 'TASK.md'), 'utf8'), text)
})
