#!/usr/bin/env node
// The exact parts of a daily routine, called by the daily-routine skill:
//
//   node routine.mjs status [--today YYYY-MM-DD]
//   node routine.mjs record <task-id> <file>
//   node routine.mjs log <YYYY-MM-DD> <report-file> --summary "<text>"
//   node routine.mjs decide <task-id> extend|keep|retire [--until <date>|none] [--condition "<text>"|none] --note "<text>"
//   node routine.mjs new <task-id> [--title "<text>"]
//
// Every command takes [--folder <path>]; record/decide/new also take [--today YYYY-MM-DD].
//
// The routine folder is --folder, else the current folder if it has routine.json, else the
// folder in ~/.daily-routine.json (written by setup).
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConfig, readUserPointer } from './lib/config.mjs'
import { loadTask, loadTasks, isDate } from './lib/tasks.mjs'
import { checkRequirements } from './lib/requirements.mjs'
import { buildStatus } from './lib/status.mjs'
import { lastHistoryDate, appendHistory, writeRunLog } from './lib/history.mjs'
import { decide, newTask, DecisionError } from './lib/decide.mjs'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'task', 'TASK.md')

export function localDate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[a.slice(2)] = true
      else { flags[a.slice(2)] = next; i++ }
    } else positional.push(a)
  }
  return { positional, flags }
}

export function findFolder(flags, { cwd = process.cwd(), home = homedir() } = {}) {
  if (typeof flags.folder === 'string') return resolve(flags.folder)
  if (existsSync(join(cwd, 'routine.json'))) return cwd
  return readUserPointer(home)?.folder ?? null
}

export function readStatus(folder, { today, runChecks = true } = {}) {
  const config = parseConfig(readFileSync(join(folder, 'routine.json'), 'utf8'))
  const tasks = loadTasks(folder).map(t => {
    if (t.error) return t
    const file = join(t.dir, 'history.md')
    return { ...t, lastRun: existsSync(file) ? lastHistoryDate(readFileSync(file, 'utf8')) : null }
  })
  const names = [...new Set(tasks.filter(t => !t.error && t.status === 'active').flatMap(t => t.requires))]
  const requirementResults = runChecks ? checkRequirements(config.requirements, names) : {}
  return buildStatus({ config, tasks, requirementResults, today })
}

class UsageError extends Error {}

const text = v => typeof v === 'string' ? v : undefined
function taskDir(folder, id) {
  const dir = join(folder, 'tasks', id ?? '')
  if (!id || !existsSync(join(dir, 'TASK.md'))) throw new UsageError(`no task "${id}" in ${join(folder, 'tasks')}`)
  return dir
}
function readInput(file) {
  if (!file || !existsSync(file)) throw new UsageError(`no such file: ${file}`)
  return readFileSync(file, 'utf8')
}

const commands = {
  status({ folder, flags }) {
    console.log(JSON.stringify(readStatus(folder, { today: flags.today ?? localDate() }), null, 2))
  },
  record({ folder, flags, args: [id, file] }) {
    const dir = taskDir(folder, id)
    const now = new Date()
    appendHistory(dir, readInput(file), { date: text(flags.today) ?? localDate(now), time: now.toISOString().slice(11, 16) })
    console.log(`recorded ${id}`)
  },
  log({ folder, flags, args: [date, file] }) {
    if (!isDate(date)) throw new UsageError(`log needs a YYYY-MM-DD date (got ${date})`)
    if (!text(flags.summary)) throw new UsageError('log needs --summary "<one line>"')
    writeRunLog(folder, date, readInput(file), flags.summary)
    console.log(`logged ${date}`)
  },
  decide({ folder, flags, args: [id, action] }) {
    const task = loadTask(taskDir(folder, id))
    decide(task, action, { until: text(flags.until), condition: text(flags.condition), note: text(flags.note), today: text(flags.today) ?? localDate() })
    console.log(`${id}: ${task.decisions[task.decisions.length - 1]}`)
  },
  new({ folder, flags, args: [id] }) {
    const task = newTask(folder, id ?? '', { title: text(flags.title), today: text(flags.today) ?? localDate(), template: TEMPLATE })
    console.log(join(task.dir, 'TASK.md'))
  },
}

export function main(argv) {
  const { positional, flags } = parseArgs(argv)
  const [name, ...rest] = positional
  const command = commands[name]
  if (!command) { console.error(`usage: routine.mjs <${Object.keys(commands).join('|')}> ...`); return 1 }
  const folder = findFolder(flags)
  if (!folder || !existsSync(join(folder, 'routine.json'))) {
    console.error('no routine folder: run /daily-routine:setup (or pass --folder)')
    return 2
  }
  try { return command({ folder, flags, args: rest }) ?? 0 } catch (e) {
    console.error(e instanceof UsageError || e instanceof DecisionError ? e.message : `routine.mjs ${name}: ${e.message}`)
    return 1
  }
}

export { commands, UsageError }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
