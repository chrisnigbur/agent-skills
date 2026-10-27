import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, writeFrontmatter } from '../lib/frontmatter.mjs'
import { EXAMPLE } from './fixtures.mjs'

test('frontmatter: round-trip of the design example TASK.md', () => {
  const parsed = parseFrontmatter(EXAMPLE)
  assert.deepEqual(parsed.data, {
    id: 'example-watch',
    title: 'EX-1 Example watch: did the fix hold, and do pushes still go through?',
    ticket: 'EX-1',
    status: 'active',
    added: '2026-10-23',
    end: { date: null, condition: 'the first post-fix push is seen and 3 runs are clean', then: 'ask' },
    decisions: ['2026-10-23: added', '2026-10-24: extend until 2026-11-01 - Chris: one more week'],
    requires: ['vpn'],
    model: 'sonnet',
    roles: { fetch: 'sonnet', judge: 'opus' },
    memory: ['some-memory-entry', 'another-entry'],
  })
  assert.equal(parsed.body, '\n## What it watches\nBody text: with a colon, and # a hash.\n')
  const again = parseFrontmatter(writeFrontmatter(parsed))
  assert.deepEqual(again.data, parsed.data)
  assert.equal(again.body, parsed.body)
})

test('frontmatter: CRLF parses like LF and is written back as CRLF', () => {
  const crlf = EXAMPLE.replace(/\n/g, '\r\n')
  const parsed = parseFrontmatter(crlf)
  assert.equal(parsed.eol, '\r\n')
  assert.deepEqual(parsed.data, parseFrontmatter(EXAMPLE).data)
  const out = writeFrontmatter(parsed)
  assert.ok(!/[^\r]\n/.test(out), 'every newline is CRLF')
})

test('frontmatter: unsupported syntax names the file line', () => {
  assert.throws(() => parseFrontmatter('---\nid: x\nnotes: |\n  multi\n---\n'), /line 3/)
})

test('frontmatter: "- 2026-10-23: added" is the string "2026-10-23: added"', () => {
  assert.deepEqual(parseFrontmatter('---\ndecisions:\n  - 2026-10-23: added\n---\n').data.decisions, ['2026-10-23: added'])
})

test('frontmatter: empty list, empty map, quoted strings with quotes', () => {
  const { data } = parseFrontmatter(`---\na: []\nb: {}\nc: "say \\"hi\\""\nd: 'it''s'\ne: 12\n---\n`)
  assert.deepEqual(data, { a: [], b: {}, c: 'say "hi"', d: "it's", e: 12 })
  assert.deepEqual(parseFrontmatter(writeFrontmatter({ data, body: '', eol: '\n' })).data, data)
})

test('frontmatter: a file with no frontmatter is rejected', () => {
  assert.throws(() => parseFrontmatter('# just a title\n'), /no frontmatter/)
})

test('frontmatter: inside double quotes only \\" and \\\\ are escapes; other backslashes stay', () => {
  const { data } = parseFrontmatter('---\na: "D:\\data\\y.csv"\nb: "say \\"hi\\" \\\\ ok"\n---\n')
  assert.equal(data.a, 'D:\\data\\y.csv')
  assert.equal(data.b, 'say "hi" \\ ok')
})

test('frontmatter: a UTF-8 BOM and trailing spaces on --- lines are accepted', () => {
  const parsed = parseFrontmatter('\uFEFF--- \nid: x\n---  \nbody\n')
  assert.deepEqual(parsed.data, { id: 'x' })
  assert.equal(parsed.body, 'body\n')
})
