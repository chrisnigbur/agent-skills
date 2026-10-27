// Requirements: named things tasks need (VPN, a cloud login). Each one's `check` is a shell
// command; exit 0 means met. Each named requirement is checked once per status run.
import { spawnSync } from 'node:child_process'

export function defaultRun(command, timeoutMs) {
  const r = spawnSync(command, { shell: true, timeout: timeoutMs, windowsHide: true, stdio: 'ignore' })
  return { status: r.status, timedOut: r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal !== null) }
}

export function checkRequirements(requirements, names, { run = defaultRun, timeoutMs = 20000 } = {}) {
  const results = {}
  for (const name of names) {
    if (name in results) continue
    const r = requirements[name]
    if (!r) { results[name] = { met: false, hint: `Add "${name}" to requirements in routine.json.`, reason: 'not defined in routine.json' }; continue }
    if (!r.check) { results[name] = { met: null, hint: r.hint, reason: 'no check command' }; continue }
    const { status, timedOut } = run(r.check, timeoutMs)
    results[name] = timedOut ? { met: false, hint: r.hint, reason: 'check timed out' }
      : status === 0 ? { met: true, hint: r.hint, reason: null }
      : { met: false, hint: r.hint, reason: `check exited ${status}` }
  }
  return results
}
