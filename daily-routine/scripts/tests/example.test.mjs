import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve, sep, isAbsolute, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../lib/frontmatter.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..', '..')
const REPO = resolve(PLUGIN, '..')

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
// The patterns are generic, so this file names nothing private and is scanned too. Anything
// else you never want published is kept OUT of the repo: point PRIVATE_TERMS_FILE at a file
// outside it with one regular expression per line.
const GENERIC = [
  ['aws-account-id', /\b\d{12}\b/],
  ['windows-home-path', /[A-Z]:\\Users\\/i],
  // Written so the pattern's own source does not match it.
  ['owner-surname', /nig[b]ur/i],
]

// path.relative handles a different drive and Windows' case-insensitive names; a name that
// merely starts with ".." (like "..private") is still inside.
function isInside(directory, candidate, paths = { relative, resolve, sep, isAbsolute }) {
  const fromDirectory = paths.relative(paths.resolve(directory), paths.resolve(candidate))
  const outside = fromDirectory === '..'
    || fromDirectory.startsWith('..' + paths.sep)
    || paths.isAbsolute(fromDirectory)

  return !outside
}

function privateTerms() {
  const termsFile = process.env.PRIVATE_TERMS_FILE

  if (!termsFile) {
    return []
  }

  assert.ok(!isInside(REPO, termsFile), 'PRIVATE_TERMS_FILE must live outside the repo')

  return readFileSync(termsFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => [`private-term-${index + 1}`, new RegExp(line.trim(), 'i')])
}

function* files(directory) {
  for (const name of readdirSync(directory)) {
    if (['.git', 'node_modules', '.superpowers'].includes(name)) {
      continue
    }

    const path = join(directory, name)

    if (statSync(path).isDirectory()) {
      yield* files(path)
    } else {
      yield path
    }
  }
}

// Each generic check catches its kind of value. The samples are built at run time so no real
// value is written down here.
test('the generic checks catch each kind of private value', () => {
  const samples = [
    ['aws-account-id', `arn:aws:iam::${'1'.repeat(12)}:role/x`],
    ['windows-home-path', ['C:', 'Users', 'someone'].join(String.fromCharCode(92))],
    ['owner-surname', 'nig' + 'bur'],
  ]

  for (const [category, sample] of samples) {
    const [, pattern] = GENERIC.find(([name]) => name === category)

    assert.match(sample, pattern, category)
  }
})

test('a terms file counts as inside the repo only when it really is', () => {
  const repo = 'C:\\work\\repo'

  assert.equal(isInside(repo, 'C:\\work\\repo\\terms.txt', win32), true)
  assert.equal(isInside(repo, 'C:\\WORK\\REPO\\terms.txt', win32), true)
  assert.equal(isInside(repo, 'C:\\work\\repo\\..private\\terms.txt', win32), true)
  assert.equal(isInside(repo, 'C:\\work\\repo', win32), true)
  assert.equal(isInside(repo, 'C:\\work\\terms.txt', win32), false)
  assert.equal(isInside(repo, 'D:\\terms.txt', win32), false)
  assert.equal(isInside(repo, 'C:\\work\\repo-private\\terms.txt', win32), false)
})

// Reports path, line and category only, never the matching text.
test('no private data in the repo', () => {
  const checks = [...GENERIC, ...privateTerms()]
  const hits = []

  for (const file of files(REPO)) {
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      const owned = line.replace(/chrisnigbur/gi, '')

      for (const [category, pattern] of checks) {
        if (pattern.test(owned)) {
          hits.push(`${relative(REPO, file)}:${index + 1}: ${category}`)
        }
      }
    })
  }

  assert.deepEqual(hits, [])
})
