---
description: Show what the daily-routine plugin can do, what to say for each, and where your routine lives
---
Show the user how to use the daily-routine plugin. Change nothing.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/routine.mjs" help` and take the `Routine folder:` line
   from its last line. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.mjs"` from that folder
   (from the current folder when there is none); it prints a line only when an update or a setup
   field is missing. If the folder exists, also run `node "${CLAUDE_PLUGIN_ROOT}/scripts/routine.mjs" list`.
2. Reply with this, filled in, and nothing else:

**Your routine:** the folder (or "none yet: run `/daily-routine:setup`"), its name from
`routine.json`, and how many active tasks `list` shows. Say "up to date" when `update-check.mjs`
printed nothing; otherwise quote its line.

**What you can say**

| To | Say, for example |
|---|---|
| Run it | "run the <routine name>" |
| Finish tasks that were waiting | "vpn is up", "db is up" (the requirement's name) |
| See the tasks without running them | "list the <routine name> tasks" |
| Change when a task ends | "extend the backup check to 12/31", "keep it, no end date" |
| Retire a task, or bring one back | "retire the backup check", "bring the backup check back" |
| Change a task's model or what it needs | "run it on Opus", "it needs database access, not the VPN" |
| Shadow a task, or decide on its shadow | "shadow it with Sonnet", "switch it to Sonnet", "stop shadowing it", "Opus was right" |
| OK a staged fix | "OK" to the exact statement the report shows |
| Add a task | "add that to the <routine name>" (from the session that just did the work) |
| Set up or change the routine | `/daily-routine:setup` |

Use the routine's real name from `routine.json` in place of `<routine name>`.

**Good to know:** retiring keeps the task folder and its history, and nothing is ever deleted.
Every decision is written into the task as a dated line with your words. A task only waits when
something it requires isn't available. The command-line reference is `routine.mjs help`.
