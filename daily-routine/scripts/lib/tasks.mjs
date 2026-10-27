// Tasks: one folder per task under <routine>/tasks/, each with a TASK.md (frontmatter + body).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseFrontmatter, writeFrontmatter } from './frontmatter.mjs'
import { isModelName } from './config.mjs'

export const TASK_ID = /^[a-z0-9][a-z0-9-]*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const LISTS = ['decisions', 'requires', 'memory', 'shared', 'after']

export function isDate(v) {
  if (typeof v !== 'string' || !DATE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function toTask(dir, data, body, eol) {
  const folder = basename(dir)
  const id = data.id
  if (typeof id !== 'string' || !TASK_ID.test(id)) throw new Error(`id must be lower-case words joined by "-" (got ${JSON.stringify(id)})`)
  if (id !== folder) throw new Error(`id "${id}" must match its folder "${folder}"`)
  if (typeof data.title !== 'string' || !data.title.trim()) throw new Error('title is required')
  const status = data.status ?? 'active'
  if (!['active', 'retired'].includes(status)) throw new Error('status must be active or retired')
  const added = data.added ?? null
  if (added !== null && !isDate(added)) throw new Error('added must be a YYYY-MM-DD date')
  const end = { date: null, condition: null, then: 'ask', ...(data.end ?? {}) }
  if (end.date !== null && !isDate(end.date)) throw new Error(`end.date must be a YYYY-MM-DD date, or null (got ${end.date})`)
  if (end.condition !== null && typeof end.condition !== 'string') throw new Error('end.condition must be text, or null')
  if (!['ask', 'delete-proposed'].includes(end.then)) throw new Error('end.then must be ask or delete-proposed')
  const model = data.model ?? null
  if (model !== null && !isModelName(model)) throw new Error('model must be a model name like "sonnet", or left out')
  const roles = data.roles ?? {}
  if (typeof roles !== 'object' || Array.isArray(roles)) throw new Error('roles must map role names to models')
  for (const [role, m] of Object.entries(roles)) if (!isModelName(m)) throw new Error(`roles.${role} must be a model name like "sonnet"`)
  const shadow = toShadow(data.shadow ?? null, roles)
  const lists = {}
  for (const k of LISTS) {
    const v = data[k] ?? []
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) throw new Error(`${k} must be a list`)
    lists[k] = v
  }
  return { ...data, id, dir, title: data.title, ticket: data.ticket ?? null, status, added, end, ...lists, model, roles, shadow, body, eol }
}

// A shadow model runs the same brief beside the main one so the two answers can be compared.
function toShadow(shadow, roles) {
  if (shadow === null) return null
  if (typeof shadow !== 'object' || Array.isArray(shadow)) throw new Error('shadow must have a model, like "model: sonnet"')
  if (!isModelName(shadow.model)) throw new Error('shadow.model must be a model name like "sonnet"')
  const until = shadow.until ?? 5
  if (!Number.isInteger(until) || until < 1) throw new Error('shadow.until must be a whole number of runs, 1 or more')
  const scope = shadow.scope ?? 'full'
  if (!['full', 'judge'].includes(scope)) throw new Error('shadow.scope must be full or judge')
  if (scope === 'judge' && !(roles.fetch && roles.judge)) throw new Error('shadow.scope judge needs roles (fetch and judge)')
  return { model: shadow.model, until, scope }
}

export function loadTask(dir) {
  const { data, body, eol } = parseFrontmatter(readFileSync(join(dir, 'TASK.md'), 'utf8'))
  return toTask(dir, data, body, eol)
}

export function loadTasks(routineFolder) {
  const root = join(routineFolder, 'tasks')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
    .map(name => {
      const dir = join(root, name)
      try { return loadTask(dir) } catch (e) {
        const error = e.code === 'ENOENT' ? 'no TASK.md in this folder' : e.message
        return { id: name, dir, error }
      }
    })
}

// Rewrites only the frontmatter; the body is written back byte for byte, with the file's line ending.
export function saveTask(task) {
  const { dir, body, eol, ...data } = task
  writeFileSync(join(dir, 'TASK.md'), writeFrontmatter({ data, body, eol }))
}
