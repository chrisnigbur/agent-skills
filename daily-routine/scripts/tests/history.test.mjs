import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cli, routine } from './fixtures.mjs'


test('record: appends a dated heading and the file text', () => {
  const folder = routine()
  writeFileSync(join(folder, 'entry.md'), 'clean, 0 rows')
  assert.equal(cli(folder, 'record', 'a-task', join(folder, 'entry.md'), '--today', '2026-10-27').status, 0)
  writeFileSync(join(folder, 'entry.md'), 'fixed 123, re-run 0 rows\n')
  assert.equal(cli(folder, 'record', 'a-task', join(folder, 'entry.md'), '--today', '2026-10-27').status, 0)
  const h = readFileSync(join(folder, 'tasks', 'a-task', 'history.md'), 'utf8')
  assert.match(h, /^## 2026-10-27 \d{2}:\d{2}Z\n\nclean, 0 rows\n\n## 2026-10-27 \d{2}:\d{2}Z\n\nfixed 123, re-run 0 rows\n$/)
})

test('record: keeps CRLF when history.md is CRLF', () => {
  const folder = routine()
  writeFileSync(join(folder, 'tasks', 'a-task', 'history.md'), '## 2026-10-26 12:00Z\r\n\r\nold\r\n')
  writeFileSync(join(folder, 'entry.md'), 'line one\nline two')
  cli(folder, 'record', 'a-task', join(folder, 'entry.md'), '--today', '2026-10-27')
  const h = readFileSync(join(folder, 'tasks', 'a-task', 'history.md'), 'utf8')
  assert.ok(!/[^\r]\n/.test(h), 'every newline is CRLF')
  assert.match(h, /line one\r\nline two\r\n$/)
})

test('record: unknown task exits 1', () => {
  const folder = routine()
  writeFileSync(join(folder, 'entry.md'), 'x')
  const r = cli(folder, 'record', 'nope', join(folder, 'entry.md'))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no task "nope"/)
})

test('log: second report same day appended after ---, row replaced not duplicated', () => {
  const folder = routine()
  writeFileSync(join(folder, 'r1.md'), 'first report')
  writeFileSync(join(folder, 'r2.md'), 'vpn follow-up')
  assert.equal(cli(folder, 'log', '2026-10-27', join(folder, 'r1.md'), '--summary', '1 call, 4 waiting').status, 0)
  assert.equal(cli(folder, 'log', '2026-10-28', join(folder, 'r1.md'), '--summary', 'clean').status, 0)
  assert.equal(cli(folder, 'log', '2026-10-27', join(folder, 'r2.md'), '--summary', '1 call, all ran').status, 0)
  assert.equal(readFileSync(join(folder, 'runs', '2026-10-27.md'), 'utf8'), 'first report\n\n---\n\nvpn follow-up\n')
  assert.equal(readFileSync(join(folder, 'run-log.md'), 'utf8'),
    '| Date | Summary | Report |\n|---|---|---|\n' +
    '| 2026-10-27 | 1 call, all ran | [report](runs/2026-10-27.md) |\n' +
    '| 2026-10-28 | clean | [report](runs/2026-10-28.md) |\n')
})

test('log: a "|" in the summary is escaped so the table holds', () => {
  const folder = routine()
  writeFileSync(join(folder, 'r.md'), 'x')
  cli(folder, 'log', '2026-10-27', join(folder, 'r.md'), '--summary', 'a | b')
  assert.match(readFileSync(join(folder, 'run-log.md'), 'utf8'), /\| a \\\| b \|/)
})

test('log: needs a date and a summary', () => {
  const folder = routine()
  writeFileSync(join(folder, 'r.md'), 'x')
  assert.equal(cli(folder, 'log', 'yesterday', join(folder, 'r.md'), '--summary', 's').status, 1)
  assert.equal(cli(folder, 'log', '2026-10-27', join(folder, 'r.md')).status, 1)
  assert.equal(existsSync(join(folder, 'run-log.md')), false)
})

test('log: touches only the table rows; title, prose and CRLF stay', () => {
  const folder = routine()
  writeFileSync(join(folder, 'r.md'), 'x')
  writeFileSync(join(folder, 'run-log.md'), '# Run log\r\n\r\n| Date | Summary | Report |\r\n|---|---|---|\r\n| 2026-10-26 | clean | [report](runs/2026-10-26.md) |\r\n\r\nComparison 2026-10-26: old and new agree.\r\n')
  cli(folder, 'log', '2026-10-27', join(folder, 'r.md'), '--summary', 'one call')
  cli(folder, 'log', '2026-10-25', join(folder, 'r.md'), '--summary', 'late entry')
  assert.equal(readFileSync(join(folder, 'run-log.md'), 'utf8'),
    '# Run log\r\n\r\n| Date | Summary | Report |\r\n|---|---|---|\r\n' +
    '| 2026-10-25 | late entry | [report](runs/2026-10-25.md) |\r\n' +
    '| 2026-10-26 | clean | [report](runs/2026-10-26.md) |\r\n' +
    '| 2026-10-27 | one call | [report](runs/2026-10-27.md) |\r\n' +
    '\r\nComparison 2026-10-26: old and new agree.\r\n')
})

test('log: a CRLF report file keeps CRLF when a follow-up is appended', () => {
  const folder = routine()
  writeFileSync(join(folder, 'r.md'), 'x')
  cli(folder, 'log', '2026-10-27', join(folder, 'r.md'), '--summary', 's')
  writeFileSync(join(folder, 'runs', '2026-10-27.md'), 'first\r\n')
  cli(folder, 'log', '2026-10-27', join(folder, 'r.md'), '--summary', 's')
  assert.equal(readFileSync(join(folder, 'runs', '2026-10-27.md'), 'utf8'), 'first\r\n\r\n---\r\n\r\nx\r\n')
})
