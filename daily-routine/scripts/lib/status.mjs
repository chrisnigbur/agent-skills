// What the coordinator needs before a run: per task its model, whether it can run now (or what
// it waits on), whether its end has come, and the order tasks run in (waves of parallel tasks).

export function resolveModels(task, config, sessionModel = null) {
  return { model: task.model ?? config.model ?? sessionModel, roles: { ...task.roles } }
}

// The shadow and its streak; due once the streak reaches the target, and it stays due (nothing
// turns a shadow off on its own: only the user's decision does).
function shadowOf(task) {
  if (!task.shadow) return { shadow: null, shadowDue: false }
  const { streak, findingsInStreak } = task.shadowLog ?? { streak: 0, findingsInStreak: 0 }
  return { shadow: { ...task.shadow, streak, findingsInStreak }, shadowDue: streak >= task.shadow.until }
}

export function buildStatus({ config, tasks, requirementResults, today }) {
  const retired = tasks.filter(t => !t.error && t.status === 'retired')
  const retiredIds = new Set(retired.map(t => t.id))
  const active = tasks.filter(t => t.error || t.status !== 'retired')
  const byId = new Map(active.map(t => [t.id, t]))

  const rows = new Map(active.map(t => {
    if (t.error) return [t.id, { id: t.id, title: null, state: 'error', waitingOn: [], error: t.error, after: [] }]
    const { model, roles } = resolveModels(t, config)
    const after = t.after.filter(id => !retiredIds.has(id))
    const unknown = after.filter(id => !byId.has(id))
    return [t.id, {
      id: t.id, title: t.title, ticket: t.ticket, model, roles, requires: t.requires, after, shared: t.shared, memory: t.memory,
      state: unknown.length ? 'error' : 'ready',
      waitingOn: t.requires.filter(name => requirementResults[name]?.met === false),
      endDue: t.end.date !== null && today > t.end.date,
      endCondition: t.end.condition, then: t.end.then, lastRun: t.lastRun ?? null,
      ...shadowOf(t),
      error: unknown.length ? `after names unknown task "${unknown[0]}"` : null,
    }]
  }))

  // Cycles: a task that can reach itself through `after` is an error.
  const reaches = (from, target, seen = new Set()) => (rows.get(from)?.after ?? []).some(id =>
    id === target || (!seen.has(id) && (seen.add(id), reaches(id, target, seen))))
  for (const row of rows.values()) if (row.state === 'ready' && reaches(row.id, row.id)) {
    row.state = 'error'
    row.error = 'after forms a cycle'
  }
  for (const row of rows.values()) if (row.state === 'ready' && row.waitingOn.length) row.state = 'waiting'

  // A task waits on any dependency that is not ready; repeat until nothing changes.
  for (let changed = true; changed;) {
    changed = false
    for (const row of rows.values()) {
      if (row.state === 'error') continue
      const blockers = row.after.filter(id => rows.get(id).state !== 'ready').map(id => `task:${id}`)
      const missing = blockers.filter(b => !row.waitingOn.includes(b))
      if (missing.length) { row.waitingOn.push(...missing); row.state = 'waiting'; changed = true }
    }
  }

  // Waves: a ready task runs one wave after its latest dependency.
  const level = new Map()
  const levelOf = id => {
    if (!level.has(id)) level.set(id, Math.max(-1, ...rows.get(id).after.map(levelOf)) + 1)
    return level.get(id)
  }
  const waves = []
  for (const row of rows.values()) if (row.state === 'ready') (waves[levelOf(row.id)] ??= []).push(row.id)

  return {
    today, routine: config.name, memory: config.memory, maxParallel: config.maxParallel,
    requirements: requirementResults,
    waves: waves.filter(Boolean),
    tasks: [...rows.values()],
    retired: retired.map(t => ({ id: t.id, title: t.title })),
  }
}
