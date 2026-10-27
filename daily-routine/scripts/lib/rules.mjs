// The permission rules setup writes to the routine folder's .claude/settings.json, so a run
// doesn't stop to ask before each routine.mjs call or file write in the routine folder.
// The "*" after daily-routine covers the version folder in the plugin cache
// (.../cache/agent-skills/daily-routine/<version>/scripts/...) whichever way the slashes go, and no
// space before the last "*" lets a quoted path end in a closing quote.

// A leading "//" makes a rule path absolute from the filesystem root; on Windows the drive is a
// lower-case first segment: C:\src\x -> //c/src/x.
export function absolutePathRule(tool, path) {
  const posix = path.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\/+$/, '')
  return `${tool}(/${posix.startsWith('/') ? posix : `/${posix}`}/**)`
}

export const allowRules = ({ folder } = {}) => [
  'Bash(node *daily-routine*routine.mjs*)',
  'Bash(node *daily-routine*update-check.mjs*)',
  ...(folder ? [absolutePathRule('Read', folder), absolutePathRule('Edit', folder)] : []),
]
