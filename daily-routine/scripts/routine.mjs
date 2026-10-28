#!/usr/bin/env node
// The exact parts of a daily routine, called by the daily-routine skill:
//
//   node routine.mjs status [--today YYYY-MM-DD]
//   node routine.mjs list [--json]
//   node routine.mjs record <task-id> <file>
//   node routine.mjs log <YYYY-MM-DD> <report-file> --summary "<text>"
//   node routine.mjs decide <task-id> extend|keep|retire|unretire|adopt-shadow|unshadow [--until <date>|none] [--condition "<text>"|none] --note "<text>"
//   node routine.mjs decide <task-id> set [--model <model>|none] [--requires <a,b>|none] [--shadow <model>|none] --note "<text>"
//   node routine.mjs new <task-id> [--title "<text>"]
//   node routine.mjs shadow <task-id> <main-answer-file> <shadow-answer-file>
//   node routine.mjs shadow <task-id> --ruling main|shadow|neither --note "<text>"
//
// Every command takes [--folder <path>]; record/decide/new/shadow also take [--today YYYY-MM-DD].
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
import { buildStatus, resolveModels } from './lib/status.mjs'
import { buildList, formatList } from './lib/list.mjs'
import { lastHistoryDate, appendHistory, writeRunLog } from './lib/history.mjs'
import { decide, newTask, DecisionError } from './lib/decide.mjs'
import { readAnswer, compareResults, formatSide, outcomesOf, appendShadowRow, parseShadowLog } from './lib/shadow.mjs'

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

// Every task with its last run date and shadow log, as status and list read them.
function loadTasksWithLogs(folder) {
  return loadTasks(folder).map(t => {
    if (t.error) return t
    const file = join(t.dir, 'history.md')
    const shadowFile = join(t.dir, 'shadow.md')
    return {
      ...t, lastRun: existsSync(file) ? lastHistoryDate(readFileSync(file, 'utf8')) : null,
      shadowLog: existsSync(shadowFile) ? parseShadowLog(readFileSync(shadowFile, 'utf8')) : undefined,
    }
  })
}

const readConfig = folder => parseConfig(readFileSync(join(folder, 'routine.json'), 'utf8'))

export function readStatus(folder, { today, runChecks = true } = {}) {
  const config = readConfig(folder)
  const tasks = loadTasksWithLogs(folder)
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
  list({ folder, flags }) {
    const list = buildList({ config: readConfig(folder), tasks: loadTasksWithLogs(folder) })
    console.log(flags.json ? JSON.stringify(list, null, 2) : formatList(list))
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
    const requires = text(flags.requires) === undefined ? undefined
      : flags.requires === 'none' ? [] : flags.requires.split(',').map(name => name.trim()).filter(Boolean)
    decide(task, action, {
      until: text(flags.until), condition: text(flags.condition), note: text(flags.note), today: text(flags.today) ?? localDate(),
      model: text(flags.model), requires, shadow: text(flags.shadow), requirementNames: Object.keys(readConfig(folder).requirements),
    })
    console.log(`${id}: ${task.decisions[task.decisions.length - 1]}`)
  },
  new({ folder, flags, args: [id] }) {
    const task = newTask(folder, id ?? '', { title: text(flags.title), today: text(flags.today) ?? localDate(), template: TEMPLATE })
    console.log(join(task.dir, 'TASK.md'))
  },
  shadow({ folder, flags, args: [id, mainFile, shadowFile] }) {
    const dir = taskDir(folder, id)
    const task = loadTask(dir)
    if (!task.shadow) throw new UsageError(`task "${id}" has no shadow`)
    const now = new Date()
    const when = `${text(flags.today) ?? localDate(now)} ${now.toISOString().slice(11, 16)}Z`
    const config = parseConfig(readFileSync(join(folder, 'routine.json'), 'utf8'))
    const models = { id, mainModel: resolveModels(task, config).model ?? 'the session model', shadowModel: task.shadow.model }

    if (flags.ruling !== undefined) {
      if (!['main', 'shadow', 'neither'].includes(flags.ruling)) throw new UsageError('--ruling must be main, shadow or neither')
      if (!text(flags.note)) throw new UsageError('--ruling needs --note "<whose call, their words>"')
      appendShadowRow(dir, { when, verdict: 'ruling', outcomes: '', main: '', shadow: '', notes: `${flags.ruling} was right - ${flags.note}` }, models)
      console.log('ruling recorded')
      return
    }

    let main
    try { main = readAnswer(readInput(mainFile)) } catch (e) {
      if (e instanceof UsageError) throw e
      throw new UsageError(`main answer unreadable: ${e.message}`)
    }
    let row
    let diffs = []
    try {
      const shadow = readAnswer(readInput(shadowFile))
      const result = compareResults(main, shadow)
      diffs = result.diffs
      row = { verdict: result.verdict, shadow: formatSide(shadow), notes: diffs.join('; ') }
    } catch (e) {
      if (e instanceof UsageError) throw e
      row = { verdict: 'error', shadow: '', notes: `shadow answer unreadable: ${e.message}` }
    }
    appendShadowRow(dir, { when, outcomes: outcomesOf(main), main: formatSide(main), ...row }, models)
    const { streak, findingsInStreak } = parseShadowLog(readFileSync(join(dir, 'shadow.md'), 'utf8'))
    console.log(JSON.stringify({ verdict: row.verdict, diffs, streak, until: task.shadow.until, due: streak >= task.shadow.until, findingsInStreak }))
  },
}

const HELP = `routine.mjs: the exact parts of a daily routine (the daily-routine skill calls these; you can too).

Commands:
  status [--today YYYY-MM-DD]        what can run now: runs each requirement check, prints JSON
  list [--json]                      every task (model, shadow, requires, end, last run); runs no checks
  record <task-id> <file>            append the file to the task's history.md
  log <YYYY-MM-DD> <report-file> --summary "<text>"
                                     save the day's report to runs/ and its row in run-log.md
  decide <task-id> extend [--until <date>|none] [--condition "<text>"|none] --note "<text>"
  decide <task-id> keep|retire|unretire --note "<text>"
  decide <task-id> set [--model <model>|none] [--requires <a,b>|none] [--shadow <model>|none] --note "<text>"
  decide <task-id> adopt-shadow|unshadow --note "<text>"
                                     the user's decision about a task, kept as a dated line in TASK.md
  new <task-id> [--title "<text>"]   create tasks/<task-id>/TASK.md from the template
  shadow <task-id> <main-answer-file> <shadow-answer-file>
  shadow <task-id> --ruling main|shadow|neither --note "<text>"
                                     compare a shadowed task's two answers, or record whose was right
  help                               this text (also --help)

Every command takes --folder <path>; record, log, decide, new and shadow also take --today.
The routine folder is --folder, else the current folder if it has routine.json, else the folder
setup saved in ~/.daily-routine.json.`

export function main(argv) {
  const { positional, flags } = parseArgs(argv)
  const [name, ...rest] = positional
  if (name === 'help' || (name === undefined && flags.help)) {
    const found = findFolder(flags)
    const folder = found && existsSync(join(found, 'routine.json')) ? found : null
    console.log(`${HELP}

Routine folder: ${folder ?? 'none yet (run /daily-routine:setup)'}`)
    return 0
  }
  const command = commands[name]
  if (!command) { console.error(name ? `unknown command "${name}": run routine.mjs help` : 'usage: routine.mjs <command> ...: run routine.mjs help'); return 1 }
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
