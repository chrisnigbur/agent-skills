# daily-routine

A daily routine for Claude Code that you can configure and extend. You keep a folder of tasks. Each
task watches one thing: a fix you shipped, a backlog you are draining, a number that should stay
put. When you say "run the morning routine", every task runs in its own sub-agent on its own model,
and you get one report:

- what needs your call
- what is worth passing on
- a table of everything clean or at baseline
- what couldn't run yet and why

Each task has an end date or end condition. When it comes, the report asks whether to retire the
task or extend it. Nothing ends on its own.

## Install

```
/plugin marketplace add chrisnigbur/agent-skills
/plugin install daily-routine@chrisnigbur-skills
/daily-routine:setup
```

Setup asks for:

- your global memory index
- where the routine folder goes and what you call the routine
- a default model
- whether to turn on automatic updates

### Private repo

The repo is private. Claude Code has no GitHub token of its own: it runs `git` with prompts turned
off and uses the logins this machine already has. It tries SSH first (a key in ssh-agent), then
HTTPS through your git credential helper. Setting `GITHUB_TOKEN` alone does nothing. Background
updates run after your first message in a session, and if git would need to prompt they fail
quietly and keep the version you have.

So before you turn on automatic updates, check that this works without asking for anything:

```
git ls-remote https://github.com/chrisnigbur/agent-skills
```

Any one of these makes it work:

- an SSH key for an account that can read the repo
- `gh auth setup-git`, with the active `gh` account able to read the repo
- a stored Git Credential Manager login for that account

Source: code.claude.com docs, "Host a plugin marketplace" ("Grant access to a private marketplace")
and "Plugin loading" ("When auto-update runs").

## Concepts

- **Routine folder**: yours, on your machine, never in this repo.

  ```
  routine.json    name, memory index, default model, maxParallel, requirements, schedule
  CLAUDE.md       tells sessions in this folder that it runs the routine
  shared/         RULES.md (included in every task's brief) and other shared notes and helpers
  tasks/<id>/     TASK.md, history.md, fixes/, and the files its steps use
  runs/<date>.md  the day's report, plus any follow-up
  run-log.md      one row per day
  ```

- **Task**: `TASK.md` frontmatter says what the engine needs: its end, requirements, model, the
  memory entries it uses, and the tasks it runs after. The body says how to run it and how to read
  the result. The format is in
  [skills/daily-routine/references/task-format.md](skills/daily-routine/references/task-format.md),
  and there is an example in [examples/routine](examples/routine).
- **Requirement**: a named thing tasks need, like `vpn`, with a check command (exit 0 = met) and a
  hint. Tasks whose requirements aren't met wait. Say "vpn is up" and they run.
- **End and decisions**: `end.date` and/or `end.condition`. Every extend, keep and retire is
  appended to `decisions` with the date and your words.
- **Models**: `routine.json` `model` is the default, and a task's `model` overrides it. A task with
  `roles` (`fetch: sonnet`, `judge: opus`) runs in two steps: a cheap model fetches the data, then
  a stronger one judges it. Version 1 uses short model names. Exact model ids and Codex may come
  later.
- **Fixes**: sub-agents never write. A task can stage a fix in `fixes/`. The report shows you the
  exact statement, and it runs only after your OK, followed by a re-check.
- **Global memory**: every run starts by reading your memory index, so tasks can lean on what it
  already says (which account is prod, how to reach a tool) instead of repeating it.

## Adding a task

Tasks come out of normal work. At the end of a session that found something worth watching, say
"add that to the morning routine". The session drafts the task from what it just did: the commands
that worked, today's numbers as the baseline, and what counts as a finding. It asks you only for
what it can't fill in, usually the end.

## CLI

The skill calls these, and you can too:

```
node scripts/routine.mjs status [--today YYYY-MM-DD]
node scripts/routine.mjs record <task-id> <file>
node scripts/routine.mjs log <YYYY-MM-DD> <report-file> --summary "<text>"
node scripts/routine.mjs decide <task-id> extend|keep|retire [--until <date>|none] [--condition "<text>"|none] --note "<text>"
node scripts/routine.mjs new <task-id> [--title "<text>"]
```

Every command takes `--folder <path>`. Without it, it uses the current folder if it has
`routine.json`, else the folder setup recorded in `~/.daily-routine.json`.

## Development

```
node --test "daily-routine/scripts/tests/*.test.mjs"
```

Node 18 or newer, no dependencies. The scheduled-run option (`schedule` in `routine.json`) is
reserved and not used yet.
