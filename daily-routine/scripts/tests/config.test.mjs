import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseConfig, readUserPointer, CONFIG_FIELDS } from '../lib/config.mjs'

const DEFAULTS = { name: 'daily routine', memory: null, model: null, maxParallel: 4, requirements: {}, schedule: null }

test('defaults: empty object gives every default', () => {
  assert.deepEqual(parseConfig('{}'), DEFAULTS)
  assert.deepEqual(CONFIG_FIELDS, Object.keys(DEFAULTS))
})

test('model: names kept, flag-like or blank rejected', () => {
  assert.equal(parseConfig('{"model":"sonnet"}').model, 'sonnet')
  assert.equal(parseConfig('{"model":"claude-sonnet-5-5[1m]"}').model, 'claude-sonnet-5-5[1m]')
  for (const model of ['', '--help', 'son net', 5])
    assert.throws(() => parseConfig(JSON.stringify({ model })), /model must be/, String(model))
})

test('maxParallel: integer 1..16', () => {
  assert.equal(parseConfig('{"maxParallel":16}').maxParallel, 16)
  for (const maxParallel of [0, 17, 2.5])
    assert.throws(() => parseConfig(JSON.stringify({ maxParallel })), /maxParallel/, String(maxParallel))
})

test('requirements: check may be null, hint required', () => {
  assert.deepEqual(parseConfig('{"requirements":{"vpn":{"check":null,"hint":"h"}}}').requirements, { vpn: { check: null, hint: 'h' } })
  assert.throws(() => parseConfig('{"requirements":{"vpn":{"check":"exit 0"}}}'), /requirements\.vpn\.hint/)
})

test('paths with spaces and backslashes survive', () => {
  const memory = 'C:\\Users\\A B\\mem\\MEMORY.md'
  const check = "powershell -NoProfile -Command \"Test-Path 'C:\\A B'\""
  const c = parseConfig(JSON.stringify({ memory, requirements: { disk: { check, hint: 'h' } } }))
  assert.equal(c.memory, memory)
  assert.equal(c.requirements.disk.check, check)
})

test('schedule: kept as given, never validated beyond object|null', () => {
  assert.deepEqual(parseConfig('{"schedule":{"cron":"anything"}}').schedule, { cron: 'anything' })
  assert.throws(() => parseConfig('{"schedule":"daily"}'), /schedule/)
})

test('unknown top-level keys are kept', () => {
  assert.equal(parseConfig('{"later":1}').later, 1)
})

test('bad JSON names the file problem', () => {
  assert.throws(() => parseConfig('{'), /routine\.json is not valid JSON/)
})

test('readUserPointer: missing file -> null; bad JSON -> null; {folder} -> object', () => {
  const home = mkdtempSync(join(tmpdir(), 'dr home '))
  assert.equal(readUserPointer(home), null)
  writeFileSync(join(home, '.daily-routine.json'), '{')
  assert.equal(readUserPointer(home), null)
  writeFileSync(join(home, '.daily-routine.json'), JSON.stringify({ folder: 'C:\\x y' }))
  assert.deepEqual(readUserPointer(home), { folder: 'C:\\x y' })
})

test('a UTF-8 BOM in routine.json is accepted', () => {
  assert.equal(parseConfig('\uFEFF{"name":"x"}').name, 'x')
})
