import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, routine } from './fixtures.mjs'
import { readAnswer, numbersIn, compareResults, appendShadowRow, formatSide, outcomesOf, parseShadowLog } from '../lib/shadow.mjs'

const answer = (...parts) => ({ parts: parts.map(([part, outcome, line]) => ({ part, outcome, line, detail: '', staged: [] })), history: '', endConditionMet: false })

test('compare: same outcomes and numbers, different wording -> match', () => {
  assert.deepEqual(compareResults(answer(['backups', 'clean', '0 rows']), answer(['backups', 'clean', 'no rows found (0)'])), { verdict: 'match', diffs: [] })
})

test('compare: comma thousands match', () => {
  assert.equal(compareResults(answer(['x', 'baseline', '12,410 rows']), answer(['x', 'baseline', '12410 rows'])).verdict, 'match')
})

test('compare: parts in another order -> match', () => {
  const main = answer(['16a', 'clean', '0 hits'], ['16b', 'baseline', '3 rows'])
  const shadow = answer(['16b', 'baseline', '3 rows'], ['16a', 'clean', '0 hits'])
  assert.equal(compareResults(main, shadow).verdict, 'match')
})

test('compare: outcome differs', () => {
  assert.deepEqual(compareResults(answer(['backups', 'clean', '0 rows']), answer(['backups', 'fix-proposed', '0 rows'])),
    { verdict: 'mismatch', diffs: ['backups: outcome clean vs fix-proposed'] })
})

test('compare: numbers differ', () => {
  assert.deepEqual(compareResults(answer(['backups', 'needs-call', '1 row']), answer(['backups', 'needs-call', '2 rows'])).diffs, ['backups: numbers 1 vs 2'])
  assert.deepEqual(compareResults(answer(['backups', 'clean', 'none']), answer(['backups', 'clean', '0'])).diffs, ['backups: numbers none vs 0'])
})

test('compare: missing and extra parts', () => {
  const { verdict, diffs } = compareResults(answer(['16a', 'clean', '0'], ['16b', 'clean', '0']), answer(['16a', 'clean', '0'], ['16c', 'clean', '0']))
  assert.equal(verdict, 'mismatch')
  assert.deepEqual(diffs, ['16b: missing from shadow', '16c: only in shadow'])
})

test('numbersIn: commas removed, sorted', () => {
  assert.deepEqual(numbersIn('12,410 rows, 3 files'), ['12410', '3'])
  assert.deepEqual(numbersIn('ratio 0.5 of -2'), ['-2', '0.5'])
})

test('readAnswer: fenced JSON is unwrapped', () => {
  assert.equal(readAnswer('```json\n{"parts": []}\n```\n').parts.length, 0)
})

test('readAnswer: prose throws "not JSON"', () => {
  assert.throws(() => readAnswer('Here is the result: {"parts": []}'), /^Error: not JSON/)
})

test('readAnswer: {} throws "no parts list"', () => {
  assert.throws(() => readAnswer('{}'), /no parts list/)
})

const models = { id: 'backups', mainModel: 'opus', shadowModel: 'sonnet' }
const row = (when, verdict, outcomes = 'clean', notes = '') => ({ when, verdict, outcomes, main: 'backups clean: 0 rows', shadow: 'backups clean: 0 rows', notes })

test('log: first row writes the header, later rows append', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr shadow '))
  appendShadowRow(dir, row('2026-10-28 13:00Z', 'match'), models)
  appendShadowRow(dir, row('2026-10-29 13:00Z', 'mismatch', 'clean', 'backups: numbers 0 vs 1'), models)
  const text = readFileSync(join(dir, 'shadow.md'), 'utf8')
  assert.match(text, /^# Shadow log: backups\n\nMain model: opus\. Shadow model: sonnet\./)
  assert.equal(text.match(/^\| When \|/gm).length, 1)
  assert.ok(text.endsWith('| 2026-10-28 13:00Z | match | clean | backups clean: 0 rows | backups clean: 0 rows |  |\n| 2026-10-29 13:00Z | mismatch | clean | backups clean: 0 rows | backups clean: 0 rows | backups: numbers 0 vs 1 |\n'))
})

test('log: a pipe in a line is escaped, newlines become spaces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr shadow '))
  appendShadowRow(dir, { ...row('2026-10-28 13:00Z', 'match'), main: 'a | b\nc' }, models)
  assert.match(readFileSync(join(dir, 'shadow.md'), 'utf8'), /\| a \\\| b c \|/)
})

test('log: keeps a CRLF file CRLF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr shadow '))
  writeFileSync(join(dir, 'shadow.md'), '# Shadow log: backups\r\n\r\n| When | Verdict | Outcomes | Main | Shadow | Notes |\r\n|---|---|---|---|---|---|\r\n')
  appendShadowRow(dir, row('2026-10-28 13:00Z', 'match'), models)
  const text = readFileSync(join(dir, 'shadow.md'), 'utf8')
  assert.equal(text.split('\n').filter(l => l && !l.endsWith('\r')).length, 0)
})

test('formatSide and outcomesOf', () => {
  const a = answer(['16a', 'clean', '0 hits'], ['16b', 'needs-call', '1 row'], ['16c', 'clean', '0'])
  assert.equal(formatSide(a), '16a clean: 0 hits; 16b needs-call: 1 row; 16c clean: 0')
  assert.equal(outcomesOf(a), 'clean, needs-call')
})

const logWith = rows => `# Shadow log: backups\n\n| When | Verdict | Outcomes | Main | Shadow | Notes |\n|---|---|---|---|---|---|\n${rows.map(([v, o = 'clean']) => `| 2026-10-28 13:00Z | ${v} | ${o} | m | s | |`).join('\n')}\n`

test('parseShadowLog: streak counts trailing matches, skips rulings, resets on mismatch and error', () => {
  assert.equal(parseShadowLog(logWith([['match'], ['mismatch'], ['ruling', ''], ['match'], ['match']])).streak, 2)
  assert.equal(parseShadowLog(logWith([['match'], ['error']])).streak, 0)
})

test('parseShadowLog: findingsInStreak', () => {
  assert.deepEqual(parseShadowLog(logWith([['mismatch', 'needs-call'], ['match', 'clean'], ['match', 'clean, needs-call']])), { streak: 2, findingsInStreak: 1 })
  assert.equal(parseShadowLog(logWith([['match', 'baseline']])).findingsInStreak, 0)
})

test('parseShadowLog: empty text -> streak 0, findingsInStreak 0', () => {
  assert.deepEqual(parseShadowLog(''), { streak: 0, findingsInStreak: 0 })
})

// CLI: routine.mjs shadow
const SHADOWED = '---\nid: backups\ntitle: G\nmodel: opus\nshadow:\n  model: sonnet\n---\n\nbody\n'
const answerFile = (folder, name, value) => {
  const file = join(folder, name)
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
  return file
}
const runShadow = (folder, main, shadow) => cli(folder, 'shadow', 'backups', answerFile(folder, 'main.json', main), answerFile(folder, 'shadow.json', shadow), '--today', '2026-10-28')
const shadowLog = folder => readFileSync(join(folder, 'tasks', 'backups', 'shadow.md'), 'utf8')

test('cli shadow: match writes a row and prints the streak', () => {
  const folder = routine({ backups: SHADOWED })
  const r = runShadow(folder, answer(['backups', 'clean', '0 rows']), answer(['backups', 'clean', 'zero rows: 0']))
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), { verdict: 'match', diffs: [], streak: 1, until: 5, due: false, findingsInStreak: 0 })
  assert.match(shadowLog(folder), /Main model: opus\. Shadow model: sonnet\./)
  assert.match(shadowLog(folder), /^\| 2026-10-28 \d\d:\d\dZ \| match \| clean \| backups clean: 0 rows \| backups clean: zero rows: 0 \|  \|$/m)
})

test('cli shadow: five matches -> due true', () => {
  const folder = routine({ backups: SHADOWED })
  let r
  for (let i = 0; i < 5; i++) r = runShadow(folder, answer(['backups', 'clean', '0 rows']), answer(['backups', 'clean', '0 rows']))
  assert.deepEqual(JSON.parse(r.stdout), { verdict: 'match', diffs: [], streak: 5, until: 5, due: true, findingsInStreak: 0 })
})

test('cli shadow: mismatch prints diffs and streak 0', () => {
  const folder = routine({ backups: SHADOWED })
  runShadow(folder, answer(['backups', 'clean', '0 rows']), answer(['backups', 'clean', '0 rows']))
  const r = runShadow(folder, answer(['backups', 'clean', '0 rows']), answer(['backups', 'fix-proposed', '1 row']))
  assert.deepEqual(JSON.parse(r.stdout), { verdict: 'mismatch', diffs: ['backups: outcome clean vs fix-proposed', 'backups: numbers 0 vs 1'], streak: 0, until: 5, due: false, findingsInStreak: 0 })
  assert.match(shadowLog(folder), /\| mismatch \| clean \| .* \| backups: outcome clean vs fix-proposed; backups: numbers 0 vs 1 \|$/m)
})

test('cli shadow: fenced or prose shadow answer', () => {
  const folder = routine({ backups: SHADOWED })
  const main = answer(['backups', 'clean', '0 rows'])
  assert.equal(JSON.parse(runShadow(folder, main, '```json\n' + JSON.stringify(main) + '\n```').stdout).verdict, 'match')
  const r = runShadow(folder, main, 'All clean today, 0 rows.')
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.verdict, 'error')
  assert.equal(out.streak, 0)
  assert.match(shadowLog(folder), /\| error \| clean \| backups clean: 0 rows \|  \| shadow answer unreadable: not JSON/)
})

test('cli shadow: unreadable main -> exit 1, no shadow.md', () => {
  const folder = routine({ backups: SHADOWED })
  const r = runShadow(folder, 'oops', answer(['backups', 'clean', '0 rows']))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /main answer unreadable: not JSON/)
  assert.equal(existsSync(join(folder, 'tasks', 'backups', 'shadow.md')), false)
})

test('cli shadow: task without shadow -> exit 1 with "has no shadow"', () => {
  const folder = routine({ backups: '---\nid: backups\ntitle: G\n---\n' })
  const r = runShadow(folder, answer(['backups', 'clean', '0']), answer(['backups', 'clean', '0']))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /task "backups" has no shadow/)
})

test('cli shadow --ruling: appends a ruling row and leaves the streak alone', () => {
  const folder = routine({ backups: SHADOWED })
  runShadow(folder, answer(['backups', 'clean', '0 rows']), answer(['backups', 'clean', '0 rows']))
  const r = cli(folder, 'shadow', 'backups', '--ruling', 'main', '--note', 'Chris: Opus was right', '--today', '2026-10-28')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /ruling recorded/)
  assert.match(shadowLog(folder), /\| ruling \|  \|  \|  \| main was right - Chris: Opus was right \|$/m)
  assert.equal(parseShadowLog(shadowLog(folder)).streak, 1)
  assert.equal(cli(folder, 'shadow', 'backups', '--ruling', 'both', '--note', 'x').status, 1)
  assert.equal(cli(folder, 'shadow', 'backups', '--ruling', 'main').status, 1)
})

test('compare: both sides all error -> skipped, not a match', () => {
  assert.deepEqual(compareResults(answer(['backups', 'error', '--direct timed out']), answer(['backups', 'error', 'could not connect'])), { verdict: 'skipped', diffs: [] })
})

test('parseShadowLog: skipped rows neither count nor break the streak; error is not a finding', () => {
  assert.deepEqual(parseShadowLog(logWith([['match'], ['skipped', 'error'], ['match']])), { streak: 2, findingsInStreak: 0 })
  assert.equal(parseShadowLog(logWith([['match', 'clean, error']])).findingsInStreak, 0)
  assert.equal(parseShadowLog(logWith([['match', 'fix-proposed']])).findingsInStreak, 1)
})
