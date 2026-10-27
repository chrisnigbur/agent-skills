import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStatus, resolveModels } from '../lib/status.mjs'
import { lastHistoryDate } from '../lib/history.mjs'
import { parseConfig } from '../lib/config.mjs'
import { routineWith } from './fixtures.mjs'

const ROUTINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'routine.mjs')
const config = parseConfig(JSON.stringify({ name: 'test routine', model: 'opus' }))
const task = (id, extra = {}) => ({
  id, dir: `/x/${id}`, title: `${id} title`, ticket: null, status: 'active', added: null,
  end: { date: null, condition: null, then: 'ask' }, decisions: [], requires: [], memory: [], shared: [], after: [],
  model: null, roles: {}, body: '', ...extra,
})
const status = (tasks, requirementResults = {}, today = '2026-10-27') => buildStatus({ config, tasks, requirementResults, today })
const byId = (s, id) => s.tasks.find(t => t.id === id)

test('lastHistoryDate: the date of the last "## YYYY-MM-DD" heading', () => {
  assert.equal(lastHistoryDate(''), null)
  assert.equal(lastHistoryDate('## 2026-10-25 13:00Z\n\nx\n\n## 2026-10-26 12:00Z\r\n\r\ny\r\n'), '2026-10-26')
})

test('endDue: false on the end date, true the day after', () => {
  const t = task('a', { end: { date: '2026-10-22', condition: null, then: 'ask' } })
  assert.equal(byId(status([t], {}, '2026-10-22'), 'a').endDue, false)
  assert.equal(byId(status([t], {}, '2026-10-23'), 'a').endDue, true)
  assert.equal(byId(status([task('b')]), 'b').endDue, false)
})

test('model resolution: task over routine over session; roles kept', () => {
  assert.deepEqual(resolveModels(task('a', { model: 'haiku', roles: { fetch: 'sonnet' } }), config), { model: 'haiku', roles: { fetch: 'sonnet' } })
  assert.equal(resolveModels(task('a'), config).model, 'opus')
  assert.equal(resolveModels(task('a'), parseConfig('{}'), 'sonnet').model, 'sonnet')
  assert.equal(resolveModels(task('a'), parseConfig('{}')).model, null)
})

test('after: dependent lands in a later wave', () => {
  const s = status([task('a'), task('b', { after: ['a'] }), task('c')])
  assert.deepEqual(s.waves, [['a', 'c'], ['b']])
  assert.equal(byId(s, 'b').state, 'ready')
})

test('after: dependency waiting -> dependent waiting on task:<id>', () => {
  const s = status([task('a', { requires: ['vpn'] }), task('b', { after: ['a'] })], { vpn: { met: false, hint: 'h', reason: 'check exited 1' } })
  assert.deepEqual(byId(s, 'a').waitingOn, ['vpn'])
  assert.equal(byId(s, 'b').state, 'waiting')
  assert.deepEqual(byId(s, 'b').waitingOn, ['task:a'])
  assert.deepEqual(s.waves, [])
})

test('after: cycle -> both error; unknown id -> error', () => {
  const s = status([task('a', { after: ['b'] }), task('b', { after: ['a'] }), task('c', { after: ['zzz'] })])
  assert.equal(byId(s, 'a').state, 'error')
  assert.match(byId(s, 'a').error, /cycle/)
  assert.equal(byId(s, 'b').state, 'error')
  assert.match(byId(s, 'c').error, /unknown task "zzz"/)
})

test('after: a retired dependency does not block', () => {
  const s = status([task('a', { status: 'retired' }), task('b', { after: ['a'] })])
  assert.equal(byId(s, 'b').state, 'ready')
})

test('requirement met:null does not block', () => {
  const s = status([task('a', { requires: ['manual'] })], { manual: { met: null, hint: 'h', reason: 'no check command' } })
  assert.equal(byId(s, 'a').state, 'ready')
})

test('broken task shows state error and the others are ready; dependents wait on it', () => {
  const s = status([{ id: 'bad', dir: '/x/bad', error: 'frontmatter line 3: nope' }, task('ok'), task('dep', { after: ['bad'] })])
  assert.equal(byId(s, 'bad').state, 'error')
  assert.equal(byId(s, 'bad').error, 'frontmatter line 3: nope')
  assert.equal(byId(s, 'ok').state, 'ready')
  assert.deepEqual(byId(s, 'dep').waitingOn, ['task:bad'])
})

test('retired tasks listed only under retired', () => {
  const s = status([task('a', { status: 'retired' }), task('b')])
  assert.deepEqual(s.tasks.map(t => t.id), ['b'])
  assert.deepEqual(s.retired, [{ id: 'a', title: 'a title' }])
})

test('status carries routine-level fields and task details', () => {
  const s = status([task('a', { requires: ['vpn'], lastRun: '2026-10-26', end: { date: null, condition: 'until x', then: 'ask' } })], { vpn: { met: true, hint: 'h', reason: null } })
  assert.equal(s.today, '2026-10-27')
  assert.equal(s.routine, 'test routine')
  assert.equal(s.maxParallel, 4)
  assert.deepEqual(s.requirements, { vpn: { met: true, hint: 'h', reason: null } })
  const a = byId(s, 'a')
  assert.equal(a.model, 'opus')
  assert.equal(a.lastRun, '2026-10-26')
  assert.equal(a.endCondition, 'until x')
  assert.equal(a.then, 'ask')
})

test('CLI: status --folder prints JSON with every task and runs requirement checks', () => {
  const folder = routineWith({
    'a-task': '---\nid: a-task\ntitle: A\nrequires: [never]\n---\n',
    'b-task': '---\nid: b-task\ntitle: B\n---\n',
  })
  writeFileSync(join(folder, 'routine.json'), JSON.stringify({ name: 'cli routine', requirements: { never: { check: 'exit 1', hint: 'say never is up' } } }))
  writeFileSync(join(folder, 'tasks', 'b-task', 'history.md'), '## 2026-10-26 12:00Z\n\nclean\n')
  const r = spawnSync(process.execPath, [ROUTINE, 'status', '--folder', folder, '--today', '2026-10-27'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const s = JSON.parse(r.stdout)
  assert.deepEqual(s.tasks.map(t => [t.id, t.state]), [['a-task', 'waiting'], ['b-task', 'ready']])
  assert.equal(s.requirements.never.met, false)
  assert.equal(s.tasks[1].lastRun, '2026-10-26')
})

test('CLI: no routine folder exits 2 with a setup hint', () => {
  const empty = routineWith({})
  const r = spawnSync(process.execPath, [ROUTINE, 'status'], { encoding: 'utf8', cwd: empty, env: { ...process.env, HOME: empty, USERPROFILE: empty } })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no routine folder: run \/daily-routine:setup/)
})

const SHADOW = { model: 'sonnet', until: 5, scope: 'full' }

test('shadow: none -> shadow null, shadowDue false', () => {
  const a = byId(status([task('a')]), 'a')
  assert.equal(a.shadow, null)
  assert.equal(a.shadowDue, false)
})

test('shadow: no log yet -> streak 0, not due', () => {
  const a = byId(status([task('a', { shadow: SHADOW })]), 'a')
  assert.deepEqual(a.shadow, { ...SHADOW, streak: 0, findingsInStreak: 0 })
  assert.equal(a.shadowDue, false)
})

test('shadow: due at the target, still due past it', () => {
  assert.equal(byId(status([task('a', { shadow: SHADOW, shadowLog: { streak: 4, findingsInStreak: 0 } })]), 'a').shadowDue, false)
  assert.equal(byId(status([task('a', { shadow: SHADOW, shadowLog: { streak: 5, findingsInStreak: 0 } })]), 'a').shadowDue, true)
  const past = byId(status([task('a', { shadow: SHADOW, shadowLog: { streak: 7, findingsInStreak: 2 } })]), 'a')
  assert.equal(past.shadowDue, true)
  assert.equal(past.shadow.findingsInStreak, 2)
})

test('shadow: CLI status reads shadow.md', () => {
  const folder = routineWith({ 'a-task': '---\nid: a-task\ntitle: A\nshadow:\n  model: sonnet\n---\n' })
  writeFileSync(join(folder, 'routine.json'), JSON.stringify({ name: 'cli routine' }))
  writeFileSync(join(folder, 'tasks', 'a-task', 'shadow.md'), '# Shadow log: a-task\n\n| When | Verdict | Outcomes | Main | Shadow | Notes |\n|---|---|---|---|---|---|\n| 2026-10-26 13:00Z | match | clean | m | s | |\n| 2026-10-27 13:00Z | match | clean | m | s | |\n')
  const r = spawnSync(process.execPath, [ROUTINE, 'status', '--folder', folder, '--today', '2026-10-27'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(JSON.parse(r.stdout).tasks[0].shadow.streak, 2)
})
