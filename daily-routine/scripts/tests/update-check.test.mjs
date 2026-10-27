import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { staleFiles, missingFields, MARKETPLACE } from '../update-check.mjs'
import { routine } from './fixtures.mjs'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (script, cwd) => spawnSync(process.execPath, [join(SCRIPTS, script)], { encoding: 'utf8', cwd, timeout: 20000 })

test('staleFiles counts mismatched and missing files', () => {
  const treeLines = [
    '100644 blob aaa\tdaily-routine/scripts/a.mjs',
    '100644 blob bbb\tdaily-routine/scripts/b.mjs',
    '100644 blob ccc\tdaily-routine/new.md',
  ]
  const local = { 'scripts/a.mjs': 'aaa', 'scripts/b.mjs': 'old' }
  assert.equal(staleFiles({ treeLines, hashOf: rel => local[rel] ?? '' }), 2)
  assert.equal(staleFiles({ treeLines: treeLines.slice(0, 1), hashOf: rel => local[rel] ?? '' }), 0)
})

test('missingFields lists absent CONFIG_FIELDS', () => {
  assert.deepEqual(missingFields({ name: 'x', memory: null, model: null }), ['maxParallel', 'requirements', 'schedule'])
  assert.deepEqual(missingFields({ name: 'x', memory: null, model: null, maxParallel: 4, requirements: {}, schedule: null }), [])
})

test('update-check prints the missing-fields line in a routine folder with an old routine.json', () => {
  const folder = routine()
  const r = run('update-check.mjs', folder)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /daily-routine: routine\.json is missing memory, model, maxParallel, requirements, schedule; re-run \/daily-routine:setup\./)
})

test('session-start prints nothing outside a routine folder', () => {
  const r = run('session-start.mjs', join(routine(), 'tasks'))
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('session-start prints the one line in a routine folder', () => {
  const folder = routine({
    'a-task': '---\nid: a-task\ntitle: A\nend:\n  date: 2020-01-01\n---\n',
    'b-task': '---\nid: b-task\ntitle: B\n---\n',
    'c-task': '---\nid: c-task\ntitle: C\nstatus: retired\n---\n',
  })
  writeFileSync(join(folder, 'routine.json'), JSON.stringify({ name: 'test routine', memory: null, model: null, maxParallel: 4, requirements: {}, schedule: null }))
  const r = run('session-start.mjs', folder)
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'daily-routine: test routine, 2 active tasks, 1 due for a retire-or-extend call. Say "run the test routine".')
})

test('session-start exits 0 with a corrupt routine.json', () => {
  const folder = routine()
  writeFileSync(join(folder, 'routine.json'), '{')
  const r = run('session-start.mjs', folder)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /daily-routine: routine\.json could not be read/)
})

test('the marketplace name matches marketplace.json and is not a reserved name', () => {
  const market = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.claude-plugin', 'marketplace.json'), 'utf8'))
  assert.equal(MARKETPLACE, 'chrisnigbur-skills')
  assert.equal(market.name, MARKETPLACE)
})
