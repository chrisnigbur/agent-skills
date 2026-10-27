// The user's decisions about a task: extend, keep (no end), retire, and for a shadowed task adopt-shadow
// (switch to the shadow's model) or unshadow (stop comparing). Every decision is
// appended to `decisions` with the date and their words; nothing is ever rewritten. Only the
// changed lines of TASK.md are touched, so hand-written comments and values stay as they are.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDate, saveTask, TASK_ID, loadTask } from './tasks.mjs'
import { parseFrontmatter, updateFrontmatter } from './frontmatter.mjs'

export class DecisionError extends Error {}

const oneLine = (value, flag) => {
  if (typeof value === 'string' && /[\r\n]/.test(value)) throw new DecisionError(`${flag} must be one line`)
  return value
}

export function decide(task, action, { until, condition, note, today }) {
  if (typeof note !== 'string' || !note.trim()) throw new DecisionError('--note is required: say whose call it is and why')
  oneLine(note, '--note')
  oneLine(condition, '--condition')
  if (!['extend', 'keep', 'retire', 'adopt-shadow', 'unshadow'].includes(action)) throw new DecisionError(`unknown decision "${action}": use extend, keep, retire, adopt-shadow or unshadow`)
  if (action.endsWith('shadow') && !task.shadow) throw new DecisionError('this task has no shadow')
  if (action === 'adopt-shadow' && task.shadow.scope === 'judge') {
    throw new DecisionError(`adopt-shadow can't switch a judge-scoped shadow yet: set roles.judge to ${task.shadow.model} in TASK.md, then decide unshadow`)
  }
  const changes = {}
  let line
  if (action === 'extend') {
    if (until === undefined && condition === undefined) throw new DecisionError('extend needs --until <date> or --condition "<text>"')
    if (until !== undefined && until !== 'none' && !isDate(until)) throw new DecisionError(`--until must be a YYYY-MM-DD date or none (got ${until})`)
    changes.end = {}
    if (until !== undefined) changes.end.date = task.end.date = until === 'none' ? null : until
    if (condition !== undefined) changes.end.condition = task.end.condition = condition === 'none' ? null : condition
    line = `extend${task.end.date && until !== undefined ? ` until ${task.end.date}` : ''}${condition !== undefined && task.end.condition ? ` (${task.end.condition})` : ''}`
  } else if (action === 'keep') {
    changes.end = { date: null, condition: null }
    task.end.date = task.end.condition = null
    line = 'keep'
  } else if (action === 'adopt-shadow') {
    changes.model = task.model = task.shadow.model
    changes.shadow = task.shadow = null
    line = `adopt-shadow (model ${changes.model})`
  } else if (action === 'unshadow') {
    changes.shadow = task.shadow = null
    line = 'unshadow'
  } else {
    changes.status = task.status = 'retired'
    line = 'retire'
  }
  changes.decisions = task.decisions = [...task.decisions, `${today}: ${line} - ${note.trim()}`]

  const file = join(task.dir, 'TASK.md')
  const before = readFileSync(file, 'utf8')
  writeFileSync(file, updateFrontmatter(before, changes))
  try { return loadTask(task.dir) } catch (e) {
    writeFileSync(file, before)
    throw new DecisionError(`TASK.md left unchanged: the update would not read back (${e.message})`)
  }
}

export function newTask(folder, id, { title, today, template }) {
  if (!TASK_ID.test(id)) throw new DecisionError(`task id must be lower-case words joined by "-" (got "${id}")`)
  oneLine(title, '--title')
  const dir = join(folder, 'tasks', id)
  if (existsSync(dir)) throw new DecisionError(`task "${id}" already exists`)
  const { data, body, eol } = parseFrontmatter(readFileSync(template, 'utf8'))
  mkdirSync(dir, { recursive: true })
  const task = { ...data, id, title: title ?? `${id}: what does this task watch?`, added: today, decisions: [`${today}: added`], dir, body, eol }
  saveTask(task)
  return loadTask(dir)
}
