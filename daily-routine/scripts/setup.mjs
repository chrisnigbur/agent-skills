#!/usr/bin/env node
// Sets up (or updates) a routine folder. Safe to re-run: existing values are kept.
//
//   node setup.mjs --folder <path> [--memory <path>] [--name "<text>"] [--model <name>|none] [--auto-update]
//
// Writes <folder>/routine.json, CLAUDE.md (only if absent), tasks/ runs/ shared/, the folder's
// .claude/settings.json permission rules, ~/.daily-routine.json (so other sessions can find the
// folder), and with --auto-update the agent-skills marketplace entry in ~/.claude/settings.json.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConfig, isModelName } from './lib/config.mjs'
import { allowRules } from './lib/rules.mjs'
import { parseArgs } from './routine.mjs'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'routine.json')
const readJson = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
const writeJson = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n') }
const fail = message => { console.error(message); process.exit(1) }

const { flags } = parseArgs(process.argv.slice(2))
if (typeof flags.folder !== 'string') fail('setup needs --folder <path> (where the routine folder lives)')
const folder = resolve(flags.folder)
const home = typeof flags.home === 'string' ? flags.home : homedir()
const model = flags.model === 'none' ? null : flags.model
if (model !== undefined && model !== null && !isModelName(model)) fail(`--model must be a model name like "sonnet", or none (got ${model})`)

// --- routine folder and routine.json
for (const sub of ['tasks', 'runs', 'shared']) mkdirSync(join(folder, sub), { recursive: true })
const configFile = join(folder, 'routine.json')
const config = parseConfig(JSON.stringify({
  ...JSON.parse(readFileSync(TEMPLATE, 'utf8')),
  ...readJson(configFile),
  ...(typeof flags.name === 'string' ? { name: flags.name } : {}),
  ...(typeof flags.memory === 'string' ? { memory: resolve(flags.memory) } : {}),
  ...(model !== undefined ? { model } : {}),
}))
writeJson(configFile, config)
console.log(`wrote ${configFile}`)

const rulesFile = join(folder, 'shared', 'RULES.md')
if (!existsSync(rulesFile)) {
  writeFileSync(rulesFile, '# Rules for every task\n\nWhat every task in this routine needs to know that global memory does not say.\n')
  console.log(`wrote ${rulesFile}`)
}

const claudeFile = join(folder, 'CLAUDE.md')
if (!existsSync(claudeFile)) {
  writeFileSync(claudeFile, [
    `# ${config.name}`,
    '',
    `This folder runs the ${config.name} with the daily-routine plugin. Say "run the ${config.name}".`,
    '',
    `Global memory index: ${config.memory ?? '(not set: re-run /daily-routine:setup with --memory)'}. Read all of it before a run.`,
    '',
  ].join('\n'))
  console.log(`wrote ${claudeFile}`)
}

// --- pointer, so the add-a-task flow can find this folder from any session
writeJson(join(home, '.daily-routine.json'), { folder })
console.log(`wrote ${join(home, '.daily-routine.json')}`)

// --- permission rules in the routine folder
const settingsFile = join(folder, '.claude', 'settings.json')
const settings = readJson(settingsFile)
const allow = new Set(settings.permissions?.allow ?? [])
const added = allowRules({ folder }).filter(r => !allow.has(r))
settings.permissions = { ...(settings.permissions ?? {}), allow: [...allow, ...added] }
writeJson(settingsFile, settings)
console.log(added.length ? `added ${added.length} permission rules to ${settingsFile}` : `permission rules already in ${settingsFile}`)

// --- automatic updates for the agent-skills marketplace (user settings)
if (flags['auto-update']) {
  const userFile = join(home, '.claude', 'settings.json')
  const u = readJson(userFile)
  u.extraKnownMarketplaces = u.extraKnownMarketplaces ?? {}
  u.extraKnownMarketplaces['agent-skills'] = {
    ...(u.extraKnownMarketplaces['agent-skills'] ?? {}),
    source: { source: 'github', repo: 'chrisnigbur/agent-skills' },
    autoUpdate: true,
  }
  writeJson(userFile, u)
  console.log(`turned on automatic updates for agent-skills in ${userFile}`)
  console.log("private repo: auto-update uses this machine's git login and never prompts. Make sure a plain `git ls-remote https://github.com/chrisnigbur/agent-skills` works without asking for a password (see the README's Private repo section).")
}

// --- memory check
if (config.memory) {
  if (existsSync(config.memory)) console.log(`memory: ok (${Math.max(1, Math.round(statSync(config.memory).size / 1024))} KB)`)
  else console.log(`memory: MISSING ${config.memory}`)
} else console.log('memory: not set (pass --memory <path to MEMORY.md>)')

console.log(`\nDone. Start a session in ${folder} and say "run the ${config.name}".`)
