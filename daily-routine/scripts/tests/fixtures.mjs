// Shared test fixtures (not a test file: node --test only runs *.test.mjs).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const EXAMPLE = `---
id: example-watch
title: "EX-1 Example watch: did the fix hold, and do pushes still go through?"
ticket: EX-1
status: active                 # active | retired
added: 2026-10-23
end:
  date: null                   # a date, or null
  condition: "the first post-fix push is seen and 3 runs are clean"
  then: ask
decisions:
  - 2026-10-23: added
  - "2026-10-24: extend until 2026-11-01 - Chris: one more week"
requires: [vpn]
model: sonnet
roles:
  fetch: sonnet
  judge: opus
memory: [some-memory-entry, another-entry]
---

## What it watches
Body text: with a colon, and # a hash.
`

// A temp routine folder (its path has a space) with tasks/<id>/TASK.md for each entry.
export function routineWith(tasks) {
  const folder = mkdtempSync(join(tmpdir(), 'dr routine '))
  for (const [id, text] of Object.entries(tasks)) {
    mkdirSync(join(folder, 'tasks', id), { recursive: true })
    writeFileSync(join(folder, 'tasks', id, 'TASK.md'), text)
  }
  return folder
}

// Run routine.mjs against a folder; routine() is a temp routine folder with routine.json and one task.
const ROUTINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'routine.mjs')
export const cli = (folder, ...args) => spawnSync(process.execPath, [ROUTINE, ...args, '--folder', folder], { encoding: 'utf8' })
export function routine(tasks = { 'a-task': '---\nid: a-task\ntitle: A\n---\n\nbody\n' }) {
  const folder = routineWith(tasks)
  writeFileSync(join(folder, 'routine.json'), '{"name":"test routine"}')
  return folder
}
