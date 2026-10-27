// routine.json: the routine's name, where global memory lives, the default model, how many
// sub-agents run at once, the named requirements tasks can need, and a reserved schedule.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULTS = { name: 'daily routine', memory: null, model: null, maxParallel: 4, requirements: {}, schedule: null }
export const CONFIG_FIELDS = Object.keys(DEFAULTS)

// Passed to a sub-agent or `claude --model`; a value starting with "-" would read as another flag.
export function isModelName(value) {
  return typeof value === 'string' && /^[^\s-]\S*$/.test(value)
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

export function parseConfig(text) {
  let raw
  try { raw = JSON.parse(text.replace(/^﻿/, '')) } catch (e) { throw new Error(`routine.json is not valid JSON: ${e.message}`) }
  if (!isObject(raw)) throw new Error('routine.json must be a JSON object')
  const c = { ...DEFAULTS, ...raw }

  if (typeof c.name !== 'string' || !c.name.trim()) throw new Error('name must be a non-empty string')
  if (c.memory !== null && typeof c.memory !== 'string') throw new Error('memory must be a path, or null')
  if (c.model !== null && !isModelName(c.model)) throw new Error('model must be a model name like "sonnet", or null')
  if (!Number.isInteger(c.maxParallel) || c.maxParallel < 1 || c.maxParallel > 16) throw new Error('maxParallel must be a whole number from 1 to 16')
  if (!isObject(c.requirements)) throw new Error('requirements must be an object of named requirements')
  const requirements = {}
  for (const [name, r] of Object.entries(c.requirements)) {
    if (!isObject(r)) throw new Error(`requirements.${name} must be an object`)
    const check = r.check ?? null
    if (check !== null && typeof check !== 'string') throw new Error(`requirements.${name}.check must be a shell command, or null`)
    if (typeof r.hint !== 'string' || !r.hint.trim()) throw new Error(`requirements.${name}.hint must say what to do when it isn't met`)
    requirements[name] = { ...r, check, hint: r.hint }
  }
  c.requirements = requirements
  if (c.schedule !== null && !isObject(c.schedule)) throw new Error('schedule must be an object, or null')
  return c
}

export function readUserPointer(home) {
  try {
    const p = JSON.parse(readFileSync(join(home, '.daily-routine.json'), 'utf8'))
    return isObject(p) && typeof p.folder === 'string' ? p : null
  } catch { return null }
}
