#!/usr/bin/env node
// Prints one line when a newer daily-routine is on agent-skills main, and one line when the
// current folder's routine.json lacks a field a newer setup adds; prints nothing otherwise.
//
//   node update-check.mjs          (run from the routine folder)
//
// A marketplace install lives in ~/.claude/plugins/cache/agent-skills/daily-routine/<version>/.
// The marketplace clone may be shallow, so compare file contents: the git hash of each installed
// file against daily-routine/ on origin/main. Never updates or writes anything, and stays quiet
// offline, when run from a plain checkout, or on any error.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { CONFIG_FIELDS } from './lib/config.mjs'

const PLUGIN = 'daily-routine'
const PREFIX = `${PLUGIN}/`

export function staleFiles({ treeLines, hashOf }) {
  let changed = 0
  for (const line of treeLines.filter(Boolean)) {
    const [meta, path] = line.split('\t')
    if (!path?.startsWith(PREFIX)) continue
    if (hashOf(path.slice(PREFIX.length)) !== meta.split(' ')[2]) changed++
  }
  return changed
}

export function missingFields(rawConfig) {
  return CONFIG_FIELDS.filter(k => !(k in rawConfig))
}

export function updateLines({ cwd = process.cwd(), root = resolve(dirname(fileURLToPath(import.meta.url)), '..') } = {}) {
  const lines = []
  try {
    const configFile = join(cwd, 'routine.json')
    if (existsSync(configFile)) {
      const missing = missingFields(JSON.parse(readFileSync(configFile, 'utf8')))
      if (missing.length) lines.push(`daily-routine: routine.json is missing ${missing.join(', ')}; re-run /daily-routine:setup.`)
    }
  } catch { /* unreadable config: session-start reports it */ }

  try {
    if (!/[\\/]plugins[\\/]cache[\\/]agent-skills[\\/]daily-routine[\\/]/.test(root + '/')) return lines
    const clone = join(homedir(), '.claude', 'plugins', 'marketplaces', 'agent-skills')
    if (!existsSync(clone)) return lines
    const git = (...a) => spawnSync('git', ['-C', clone, ...a], {
      encoding: 'utf8', timeout: 8000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    if (git('fetch', '--quiet', 'origin', 'main').status !== 0) return lines
    const tree = git('ls-tree', '-r', 'origin/main', '--', PREFIX)
    if (tree.status !== 0) return lines
    const changed = staleFiles({
      treeLines: tree.stdout.trim().split('\n'),
      hashOf: rel => { const f = join(root, rel); return existsSync(f) ? git('hash-object', f).stdout.trim() : '' },
    })
    if (changed) lines.push(`daily-routine: a newer version is on agent-skills (${changed} file${changed === 1 ? '' : 's'} changed). Update with: claude plugin marketplace update agent-skills && claude plugin update daily-routine@agent-skills, then restart Claude Code.`)
  } catch { /* never get in the way of a session */ }
  return lines
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const line of updateLines()) console.log(line)
}
