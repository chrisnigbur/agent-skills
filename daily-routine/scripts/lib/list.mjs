// The routine's tasks as they stand, without running anything: per task its model and shadow, what
// it requires, when it ends and when it last ran. Retired tasks and broken task files listed apart.
import { resolveModels } from './status.mjs'

export function buildList({ config, tasks }) {
  const active = tasks.filter(t => !t.error && t.status !== 'retired')
  return {
    routine: config.name,
    tasks: active.map(t => {
      const { streak, findingsInStreak } = t.shadowLog ?? { streak: 0, findingsInStreak: 0 }
      return {
        id: t.id, title: t.title, model: resolveModels(t, config).model, requires: t.requires, end: t.end,
        lastRun: t.lastRun ?? null, shadow: t.shadow ? { ...t.shadow, streak, findingsInStreak } : null,
      }
    }),
    retired: tasks.filter(t => !t.error && t.status === 'retired').map(t => ({ id: t.id, title: t.title })),
    errors: tasks.filter(t => t.error).map(t => ({ id: t.id, error: t.error })),
  }
}

const cell = v => String(v).replace(/\|/g, '\\|')

function ends({ date, condition }) {
  if (date && condition) return `${date} or when: ${condition}`
  if (date) return date
  return condition ? `when: ${condition}` : 'no end'
}

export function formatList({ tasks, retired, errors }) {
  if (!tasks.length && !retired.length && !errors.length) return 'No tasks yet.'
  const out = []
  if (tasks.length) {
    out.push('| Task | Title | Model | Requires | Ends | Last run |', '|---|---|---|---|---|---|')
    for (const t of tasks) {
      const model = (t.model ?? 'session model') + (t.shadow ? ` (shadow ${t.shadow.model}, ${t.shadow.streak} of ${t.shadow.until})` : '')
      out.push(`| ${[t.id, t.title, model, t.requires.join(', '), ends(t.end), t.lastRun ?? 'never'].map(cell).join(' | ')} |`)
    }
  } else out.push('No active tasks.')
  if (retired.length) out.push('', `Retired: ${retired.map(t => `${t.id} (${t.title})`).join(', ')}`)
  for (const e of errors) out.push('', `Task file has a problem: ${e.id}: ${e.error}`)
  return out.join('\n')
}
