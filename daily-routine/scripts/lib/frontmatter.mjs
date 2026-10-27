// A small YAML subset for TASK.md frontmatter, read and written without dependencies.
// Supported, and only this: `key: scalar`; quoted strings ("..." with \" and \\, '...' with '');
// null; integers; true/false; dates kept as strings; inline lists [a, b]; {} for an empty map;
// one level of nested map (two-space indent); block lists of scalars (`  - text`, where the whole
// text after "- " is one string); `#` comments after whitespace. Anything else is an error naming
// the file line.

const DELIM = '---'

function stripComment(text) {
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\' && quote === '"') i++
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i)
  }
  return text
}

function unquote(text, lineNo) {
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) throw new Error(`frontmatter line ${lineNo}: unclosed "`)
    // Only \" and \\ are escapes, so a Windows path like "C:\data\x.csv" reads as written.
    return text.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (!text.endsWith("'") || text.length < 2) throw new Error(`frontmatter line ${lineNo}: unclosed '`)
  return text.slice(1, -1).replace(/''/g, "'")
}

function splitInline(inner, lineNo) {
  const items = []
  let current = ''
  let quote = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote) {
      current += ch
      if (ch === '\\' && quote === '"') current += inner[++i] ?? ''
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") { quote = ch; current += ch }
    else if (ch === ',') { items.push(current); current = '' }
    else current += ch
  }
  if (quote) throw new Error(`frontmatter line ${lineNo}: unclosed ${quote}`)
  items.push(current)
  return items.map(s => s.trim()).filter((s, i, all) => s !== '' || all.length > 1)
    .map(s => { if (s === '') throw new Error(`frontmatter line ${lineNo}: empty list item`); return scalar(s, lineNo) })
}

function scalar(text, lineNo) {
  const t = text.trim()
  if (t === '' || t === 'null' || t === '~') return null
  if (t.startsWith('"') || t.startsWith("'")) return unquote(t, lineNo)
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^[|>&*!%@`{[\]}]/.test(t)) throw new Error(`frontmatter line ${lineNo}: unsupported value "${t}"`)
  return t
}

function value(text, lineNo) {
  const t = text.trim()
  if (t === '{}') return {}
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new Error(`frontmatter line ${lineNo}: unclosed [`)
    return splitInline(t.slice(1, -1), lineNo)
  }
  return scalar(t, lineNo)
}

// A leading UTF-8 BOM (some Windows editors write one) and trailing spaces on the --- lines are fine.
function split(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const isDelim = line => line.trimEnd() === DELIM
  if (!isDelim(lines[0])) throw new Error('no frontmatter: TASK.md must start with a --- line')
  const close = lines.findIndex((line, i) => i > 0 && isDelim(line))
  if (close === -1) throw new Error('no frontmatter: the closing --- line is missing')
  return { lines, close, eol }
}

export function parseFrontmatter(text) {
  const { lines, close, eol } = split(text)

  const data = {}
  let open = null // { key, kind: 'map'|'list'|null } for the key whose block is being read
  for (let i = 1; i < close; i++) {
    const lineNo = i + 1
    const raw = stripComment(lines[i]).replace(/\s+$/, '')
    if (raw.trim() === '') continue
    if (/^\S/.test(raw)) {
      const m = raw.match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/)
      if (!m) throw new Error(`frontmatter line ${lineNo}: expected "key: value"`)
      const [, key, rest] = m
      if (rest === undefined || rest === '') { data[key] = null; open = { key, kind: null } }
      else { data[key] = value(rest, lineNo); open = null }
      continue
    }
    const m = raw.match(/^ {2}(?:- (.*)|([A-Za-z_][\w-]*):(?:\s+(.*))?)$/)
    if (!open || !m) throw new Error(`frontmatter line ${lineNo}: unexpected indented line`)
    const [, item, subKey, subRest] = m
    const kind = item !== undefined ? 'list' : 'map'
    if (open.kind && open.kind !== kind) throw new Error(`frontmatter line ${lineNo}: mixes list items and keys`)
    if (!open.kind) { open.kind = kind; data[open.key] = kind === 'list' ? [] : {} }
    if (kind === 'list') {
      const t = item.trim()
      data[open.key].push(t.startsWith('"') || t.startsWith("'") ? unquote(t, lineNo) : t)
    } else {
      const v = subRest === undefined ? null : value(subRest, lineNo)
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) throw new Error(`frontmatter line ${lineNo}: maps nest one level only`)
      data[open.key][subKey] = v
    }
  }
  const body = lines.slice(close + 1).join(eol)
  return { data, body, eol }
}

const PLAIN = /^[A-Za-z0-9_./\\()][^:#\n"']*$/
export function quote(v) {
  if (typeof v !== 'string') return v === null ? 'null' : String(v)
  const looksLikeOther = /^(null|~|true|false|-?\d+)$/.test(v)
  if (v !== '' && !looksLikeOther && v === v.trim() && PLAIN.test(v) && !/[,\[\]{}]/.test(v)) return v
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function writeFrontmatter({ data, body, eol = '\n' }) {
  const out = [DELIM]
  for (const [key, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${key}: []`)
      else if (v.every(x => typeof x !== 'string' || quote(x) === x)) out.push(`${key}: [${v.map(quote).join(', ')}]`)
      else { out.push(`${key}:`); for (const x of v) out.push(`  - ${quote(x)}`) }
    } else if (v !== null && typeof v === 'object') {
      if (Object.keys(v).length === 0) out.push(`${key}: {}`)
      else { out.push(`${key}:`); for (const [k, x] of Object.entries(v)) out.push(`  ${k}: ${Array.isArray(x) ? `[${x.map(quote).join(', ')}]` : quote(x)}`) }
    } else out.push(`${key}: ${quote(v)}`)
  }
  out.push(DELIM)
  return out.join(eol) + eol + body
}

// Changes a few keys in place and leaves every other line, its comments and the body exactly as
// they were. `changes` may set `status` and `model` (scalars), `end` (sub-keys to set),
// `decisions` (the full list; items beyond those already in the file are appended) and
// `shadow: null` (removes the shadow block).
export function updateFrontmatter(text, changes) {
  const bom = text.startsWith('﻿') ? '﻿' : ''
  const { lines, close, eol } = split(text)
  let end = close // the closing --- line; moves down as lines are inserted
  const insert = (at, added) => { lines.splice(at, 0, ...added); end += added.length }
  const topIndex = key => lines.findIndex((line, i) => i > 0 && i < end && new RegExp(`^${key}:(\\s|$)`).test(line))
  const blockEnd = start => { let i = start + 1; while (i < end && /^ {2}\S/.test(lines[i])) i++; return i }
  const setLine = (i, prefix, v) => {
    const kept = stripComment(lines[i]).replace(/\s+$/, '')
    const comment = lines[i].slice(kept.length)
    lines[i] = `${prefix} ${quote(v)}${comment.trim() ? comment : ''}`
  }

  if ('shadow' in changes && changes.shadow === null) {
    const i = topIndex('shadow')
    if (i !== -1) { const stop = blockEnd(i); lines.splice(i, stop - i); end -= stop - i }
  }
  for (const key of ['status', 'model']) {
    if (!(key in changes)) continue
    const i = topIndex(key)
    if (i === -1) insert(end, [`${key}: ${quote(changes[key])}`])
    else setLine(i, `${key}:`, changes[key])
  }
  if (changes.end) {
    let i = topIndex('end')
    if (i === -1) { insert(end, ['end:']); i = end - 1 }
    else if (stripComment(lines[i]).trim() !== 'end:') lines[i] = 'end:' // was `end: {}` or `end: null`
    for (const [k, v] of Object.entries(changes.end)) {
      const stop = blockEnd(i)
      const j = lines.findIndex((line, n) => n > i && n < stop && line.startsWith(`  ${k}:`))
      if (j === -1) insert(stop, [`  ${k}: ${quote(v)}`])
      else setLine(j, `  ${k}:`, v)
    }
  }
  if (changes.decisions) {
    const items = changes.decisions.map(d => `  - ${quote(d)}`)
    const i = topIndex('decisions')
    if (i === -1) insert(end, ['decisions:', ...items])
    else if (stripComment(lines[i]).trim() !== 'decisions:') { lines[i] = 'decisions:'; insert(i + 1, items) } // was inline
    else { const stop = blockEnd(i); insert(stop, items.slice(stop - i - 1)) }
  }
  return bom + lines.join(eol)
}
