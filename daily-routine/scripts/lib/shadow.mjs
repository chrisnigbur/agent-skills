// Shadow runs: a second model answers the same brief, and the two answers are compared part by
// part (outcome and the numbers in the line; the wording never matches and is ignored).
// tasks/<id>/shadow.md keeps one table row per run; the trailing run of matches is the streak.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function readAnswer(text) {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  let answer
  try { answer = JSON.parse(fenced ? fenced[1] : text) } catch (e) { throw new Error(`not JSON: ${e.message}`) }
  if (!answer || !Array.isArray(answer.parts)) throw new Error('no parts list')
  return answer
}

export function numbersIn(line) {
  return (String(line ?? '').match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map(n => n.replace(/,/g, '')).sort()
}

export function compareResults(main, shadow) {
  // Both models failed to run anything: the morning tested neither, so it doesn't count.
  const allError = answer => answer.parts.length > 0 && answer.parts.every(p => p.outcome === 'error')
  if (allError(main) && allError(shadow)) return { verdict: 'skipped', diffs: [] }
  const shadowParts = new Map(shadow.parts.map(p => [p.part, p]))
  const mainNames = new Set(main.parts.map(p => p.part))
  const diffs = []
  for (const m of main.parts) {
    const s = shadowParts.get(m.part)
    if (!s) { diffs.push(`${m.part}: missing from shadow`); continue }
    if (m.outcome !== s.outcome) diffs.push(`${m.part}: outcome ${m.outcome} vs ${s.outcome}`)
    const [a, b] = [numbersIn(m.line), numbersIn(s.line)]
    if (a.join(',') !== b.join(',')) diffs.push(`${m.part}: numbers ${a.join(',') || 'none'} vs ${b.join(',') || 'none'}`)
  }
  for (const s of shadow.parts) if (!mainNames.has(s.part)) diffs.push(`${s.part}: only in shadow`)
  return { verdict: diffs.length ? 'mismatch' : 'match', diffs }
}

export const formatSide = answer => answer.parts.map(p => `${p.part} ${p.outcome}: ${p.line}`).join('; ')
export const outcomesOf = answer => [...new Set(answer.parts.map(p => p.outcome))].join(', ')

const cell = v => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
const eolOf = text => text.includes('\r\n') ? '\r\n' : '\n'

export function appendShadowRow(taskDir, row, { id, mainModel, shadowModel }) {
  const file = join(taskDir, 'shadow.md')
  const line = `| ${[row.when, row.verdict, row.outcomes, row.main, row.shadow, row.notes].map(cell).join(' | ')} |`
  if (!existsSync(file)) {
    const header = [`# Shadow log: ${id}`, '', `Main model: ${mainModel}. Shadow model: ${shadowModel}. One row per run; \`ruling\` rows are your call on a mismatch.`, '',
      '| When | Verdict | Outcomes | Main | Shadow | Notes |', '|---|---|---|---|---|---|']
    writeFileSync(file, [...header, line, ''].join('\n'))
    return
  }
  const old = readFileSync(file, 'utf8')
  const eol = eolOf(old)
  writeFileSync(file, `${old.replace(/\s+$/, '')}${eol}${line}${eol}`)
}

// Outcomes that are a real finding; clean, baseline and error are not.
const FINDINGS = new Set(['needs-call', 'pass-on', 'fix-proposed'])

export function parseShadowLog(text) {
  const rows = text.split(/\r?\n/).filter(l => l.startsWith('|') && !/^\|\s*(When|-)/.test(l))
    .map(l => l.trim().slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim()))
  let streak = 0
  let findingsInStreak = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const [, verdict, outcomes] = rows[i]
    if (verdict === 'ruling' || verdict === 'skipped') continue
    if (verdict !== 'match') break
    streak++
    if (outcomes.split(/,\s*/).some(o => FINDINGS.has(o))) findingsInStreak++
  }
  return { streak, findingsInStreak }
}
