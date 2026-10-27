---
description: Set up (or update) a daily routine folder: global memory, folder, name, default model, automatic updates, requirements
---
Set up the daily-routine plugin for the user. Keep it short and plain. Ask one question at a time
and wait for each answer. Re-running setup is safe: existing values are kept, so on a re-run
suggest the current values from the routine folder's `routine.json`.

1. **Global memory.** Ask where they keep their agent global memory: the index file (often a
   `MEMORY.md`) that their sessions read for shared rules. Suggest the memory folder of this
   session's project if there is one. Check the file exists and say its size. The routine reads it
   before every run, so tasks can lean on it instead of repeating it.
2. **Routine folder and name.** Ask where the routine folder should be, and what they call the
   routine (what they will say: "run the <name>"). Suggest a new `daily-routine` folder next to
   their other work, and "morning routine". The folder holds their tasks, history and run log; it
   is theirs and never goes in the plugin repo.
3. **Default model.** Ask which model tasks run on by default: `opus`, `sonnet`, `haiku`, or the
   session's own model (`none`). Each task can override it later.
4. **Automatic updates.** Ask whether Claude Code should update this plugin on its own. Recommend
   yes. This writes one entry to `~/.claude/settings.json`. The plugin's repo is private, so
   updates use this machine's git login and never prompt: check that
   `git ls-remote https://github.com/chrisnigbur/agent-skills` works without asking for a
   password, and if it doesn't, point them to the README's "Private repo" section.
5. Run:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --folder "<folder>" --memory "<memory index>" --name "<name>" --model <model|none> [--auto-update]`
   and show its output. If it says `memory: MISSING`, say so in one line.
6. **Requirements.** Ask whether any tasks will need something that isn't always there (a VPN, a
   cloud login, a database tunnel). For each one, agree on a name, a check command that exits 0
   when it is available, and a hint saying what to do when it isn't, then add it to `requirements`
   in `routine.json`. They can also leave this until the first task needs one.
7. Finish with: start a session in the routine folder and say "run the <name>". New tasks come
   from normal work: at the end of a session that found something worth watching, say "add that to
   the <name>".
