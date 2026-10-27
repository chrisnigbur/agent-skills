// history.md beside each TASK.md: one "## YYYY-MM-DD HH:MMZ" entry per run, newest last.
// runs/<date>.md holds the day's report(s); run-log.md has one row per day.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function lastHistoryDate(text) {
  const dates = [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})\b/gm)].map(m => m[1])
  return dates.length ? dates[dates.length - 1] : null
}

const readOr = (file, fallback) => existsSync(file) ? readFileSync(file, 'utf8') : fallback
const eolOf = text => text.includes('\r\n') ? '\r\n' : '\n'
const trimEnd = text => text.replace(/\s+$/, '')

export function appendHistory(taskDir, entry, { date, time }) {
  const file = join(taskDir, 'history.md')
  const old = readOr(file, '')
  const eol = old ? eolOf(old) : '\n'
  const block = `## ${date} ${time}Z\n\n${trimEnd(entry)}\n`.replace(/\r?\n/g, eol)
  writeFileSync(file, old ? `${trimEnd(old)}${eol}${eol}${block}` : block)
}

const HEADER = '| Date | Summary | Report |\n|---|---|---|\n'

export function writeRunLog(folder, date, report, summary) {
  mkdirSync(join(folder, 'runs'), { recursive: true })
  const runFile = join(folder, 'runs', `${date}.md`)
  const old = readOr(runFile, '')
  const runEol = old ? eolOf(old) : '\n'
  const runText = old ? `${trimEnd(old)}\n\n---\n\n${trimEnd(report)}\n` : `${trimEnd(report)}\n`
  writeFileSync(runFile, runText.replace(/\r?\n/g, runEol))

  // Only the table's date rows change; a title, notes or comparisons around the table stay put.
  const logFile = join(folder, 'run-log.md')
  const text = readOr(logFile, HEADER)
  const eol = eolOf(text)
  const lines = text.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  const row = `| ${date} | ${summary.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} | [report](runs/${date}.md) |`
  let header = lines.findIndex(l => /^\|\s*Date\s*\|/.test(l))
  if (header === -1) { lines.push(...(lines.length ? [''] : []), ...HEADER.trimEnd().split('\n')); header = lines.length - 2 }
  const first = header + 2
  let last = first
  while (last < lines.length && /^\| \d{4}-\d{2}-\d{2} \|/.test(lines[last])) last++
  const rows = lines.slice(first, last).filter(l => !l.startsWith(`| ${date} |`))
  rows.push(row)
  rows.sort()
  lines.splice(first, last - first, ...rows)
  writeFileSync(logFile, lines.join(eol) + eol)
}
