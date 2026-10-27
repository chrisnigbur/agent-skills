#!/usr/bin/env node
// SessionStart hook: the update check, then, in a routine folder only, one line saying what is
// there. Runs no requirement checks and never fails the session.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { updateLines } from './update-check.mjs'
import { readStatus, localDate } from './routine.mjs'

try {
  const timer = setTimeout(() => process.exit(0), 10000)
  for (const line of updateLines()) console.log(line)
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'routine.json'))) {
    try {
      const s = readStatus(cwd, { today: localDate(), runChecks: false })
      const due = s.tasks.filter(t => t.endDue).length
      console.log(`daily-routine: ${s.routine}, ${s.tasks.length} active task${s.tasks.length === 1 ? '' : 's'}, ${due} due for a retire-or-extend call. Say "run the ${s.routine}".`)
    } catch (e) {
      console.log(`daily-routine: routine.json could not be read (${e.message}); re-run /daily-routine:setup.`)
    }
  }
  clearTimeout(timer)
} catch { /* never get in the way of a session */ }
process.exitCode = 0
