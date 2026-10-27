import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRequirements } from '../lib/requirements.mjs'

const reqs = {
  up: { check: 'up-cmd', hint: 'h-up' },
  down: { check: 'down-cmd', hint: 'h-down' },
  manual: { check: null, hint: 'h-manual' },
}
const fakeRun = calls => command => { calls.push(command); return command === 'up-cmd' ? { status: 0, timedOut: false } : { status: 3, timedOut: false } }

test('met, not met, uncheckable and undefined', () => {
  const r = checkRequirements(reqs, ['up', 'down', 'manual', 'nope'], { run: fakeRun([]) })
  assert.deepEqual(r.up, { met: true, hint: 'h-up', reason: null })
  assert.deepEqual(r.down, { met: false, hint: 'h-down', reason: 'check exited 3' })
  assert.deepEqual(r.manual, { met: null, hint: 'h-manual', reason: 'no check command' })
  assert.deepEqual(r.nope, { met: false, hint: 'Add "nope" to requirements in routine.json.', reason: 'not defined in routine.json' })
})

test('each named requirement runs once even when many tasks need it', () => {
  const calls = []
  checkRequirements(reqs, ['up', 'up', 'down', 'up'], { run: fakeRun(calls) })
  assert.deepEqual(calls, ['up-cmd', 'down-cmd'])
})

test('a check that hangs times out and counts as not met', () => {
  const r = checkRequirements({ slow: { check: 'node -e "setTimeout(()=>{}, 5000)"', hint: 'h' } }, ['slow'], { timeoutMs: 300 })
  assert.equal(r.slow.met, false)
  assert.equal(r.slow.reason, 'check timed out')
})

test('a command with a quoted path containing a space runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr with space '))
  const js = `process.exit(require('fs').existsSync(${JSON.stringify(dir)}) ? 0 : 1)`
  const check = `node -e "${js.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  assert.equal(checkRequirements({ disk: { check, hint: 'h' } }, ['disk']).disk.met, true)
})
