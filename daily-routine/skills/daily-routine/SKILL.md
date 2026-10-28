---
name: daily-routine
description: Runs a configured daily routine (for example "run the morning routine"), finishes the tasks that were waiting once a blocker clears ("vpn is up"), lists the routine's tasks without running them ("list the daily routine tasks"), records extend / keep / retire / unretire decisions about a task ("retire check 16", "extend the upload task to 11/14", "bring check 16 back"), changes a task's model, requirements or shadow ("the backup check needs database access, not the VPN"), switches or stops a task's shadow model ("switch it to Sonnet", "Opus was right"), and turns what the current session just learned into a new routine task ("add that to the morning routine"). Use whenever the user names their routine or one of its tasks.
---

# Daily routine

A routine is a folder of tasks. Each task watches one thing, says what it needs to run, and has an
end date or end condition that only the user changes. You are the coordinator: you work out what
runs, hand each task to its own sub-agent on its own model, and write one report.

`R` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/routine.mjs"`. It does the exact parts
(parsing, requirement checks, end dates, order, history, decisions). Never do those by hand-editing
`TASK.md` frontmatter, `history.md` or `run-log.md`.

## 1. Before anything else

1. Find the routine folder: `R status` resolves it (the current folder if it has `routine.json`,
   else the folder setup recorded). Exit 2 means there is none: offer `/daily-routine:setup`.
2. Read the whole global memory index at the status JSON's `memory` path, then the entries your
   work touches. Memory rules apply to everything here, including how prod data may be touched.
   If the index says it may be cut off in a preview, open the file and read it to the end.
3. Read `shared/RULES.md` in the routine folder.

## 2. Run the routine

1. `R status` (it runs each requirement check once). Read `waves`, `tasks` and `requirements`.
2. For each wave in order, start one sub-agent per task in that wave, up to `maxParallel` at
   once, with the Agent tool: `subagent_type: general-purpose`, `model` set to the task's
   `model` from status (leave it out when null). The prompt is the brief in
   `references/subagent-brief.md`. A task with `roles` runs in two steps: a `fetch` sub-agent on
   `roles.fetch` that runs the steps marked as fetch work and returns raw output, then a `judge`
   sub-agent on `roles.judge` that gets that output and returns the result. Sub-agents cannot start
   sub-agents, so you run both steps.
   A task with a `shadow` in status also gets a second sub-agent on `shadow.model`, started in the
   same wave from the shadow brief (`references/subagent-brief.md`); it counts as two toward
   `maxParallel`. With `shadow.scope: full` (the default) the shadow runs the whole task on
   `shadow.model`, both the fetch and the judge step if the task has `roles`. With
   `shadow.scope: judge`, the fetch runs once and both judges get the same fetched output.
3. A later wave's brief includes the day's results of the tasks in its `after`.
4. Do not start tasks whose `state` is `waiting` or `error`. Every one of them still goes in the
   report: a task with `state: error` (its TASK.md doesn't load, or its `after` names an unknown
   task or forms a cycle) is listed with its `error` text, so a broken file never silently drops
   a check.
5. For each result, write its `history` text to a temp file and `R record <id> <file>`. Only the
   main answer is recorded. For a shadowed task, then save both answers (the main and the
   shadow's JSON, as they came back) to temp files and run `R shadow <id> <main> <shadow>`; it
   prints the verdict (`match`, `mismatch`, `error`, or `skipped` when both models errored on
   every part), the diffs and the streak. If the shadow sub-agent failed or came back empty, write
   its error text to the shadow file anyway: that records `error` and resets the streak. If the
   main answer is unreadable, report the task as an error and skip `R shadow`.
6. Write the report exactly as `references/report-format.md` says. Tasks with `endDue: true`, or
   whose result says `endConditionMet: true`, go under "Needs your call" as retire-or-extend
   questions. They still ran today. A shadow `mismatch` or `error` goes under "Needs your call" as
   "the models disagree". The switch question, its streak and its finding count come only from
   today's `R shadow` output (`due: true`), never from the status read before the run: a mismatch
   today resets the streak, and the report must not ask to switch in the same breath. A shadowed
   task that didn't run today gets no shadow item. The report body uses only the main answer.
7. Save the report: write it to a temp file, then `R log <today> <file> --summary "<one line>"`.
8. Remember which tasks were waiting and on what. The user will tell you when that clears.

## 3. Finish waiting tasks ("vpn is up")

`R status` again. Run only the tasks that were `waiting` earlier today and are `ready` now (plus any
task whose `after` waited on them). Report on just those, in the same shape, and end with "Still
waiting on you from this morning:" listing the open items from the first report. `R log` the
follow-up with the same date; it is appended to the day's file. The run-log row is replaced, so
the `--summary` covers the whole day (the first run and the follow-up), not just the follow-up.

## 4. Fixes found during a run

Sub-agents never write anything outside their task folder. A result with outcome `fix-proposed`
names a staged file in the task's `fixes/` folder. Under "Needs your call", show the exact
statement or call from that file, word for word. Only after the user explicitly says OK to that
statement do you run it yourself (never a sub-agent), following memory's rules for writes. Then
re-run the task's detection step, and `R record` the outcome ("fixed <id>, re-run 0 rows").

## 5. List the tasks, and manage them

"List the tasks" (or "what's in the routine"): `R list`. It reads the task files and runs no
requirement checks, so it is quick and touches nothing. Show its table as it prints, then the
retired tasks and any task file with a problem. Use `R list --json` when you need the values.

Turn the user's words about a task into `R decide`, always with `--note "<who decided, their
words>"`; every decision is a dated line in the task's `decisions`:

- End date or condition: `R decide <id> extend [--until YYYY-MM-DD|none] [--condition "<text>"|none]`,
  or `keep` for no end.
- "Remove it" means retire: `R decide <id> retire`. The folder and its history stay; nothing is
  deleted. "Bring it back": `R decide <id> unretire`.
- Model, requirements, shadow: `R decide <id> set [--model <model>|none] [--requires a,b|none]
  [--shadow <model>|none]`. `--requires` replaces the whole list and takes only names
  `routine.json` defines; `--model none` falls back to the routine's default model.

Never edit a task's frontmatter by hand for these, and never decide on your own: no retiring
because an end date passed, no extending because a check is still useful. When a task has a
decision note "retire together with <id>", ask about both in the same question.

Shadows follow the same rule; nothing turns a shadow off on its own, however long the streak:

- "Switch it to Sonnet" (the shadow's model): `R decide <id> adopt-shadow --note "<words>"`.
- "Stop shadowing it" (keep the main model): `R decide <id> unshadow --note "<words>"`.
- "Keep comparing": no command; the shadow keeps running and the question comes back next run.
- On a mismatch, "Opus was right" / "Sonnet was right" / "neither": `R shadow <id> --ruling
  main|shadow|neither --note "<words>"`.

## 6. Add a task

When the user says "add that to the <routine name>" (or similar), follow
`references/adding-a-task.md`. The task format is in `references/task-format.md`.

## Rules for every step

- Facts, not guesses: report what a command returned. If something wasn't checked, say so.
- Change nothing outside the routine folder without the user's OK. Reading is fine.
- Keep clean tasks to one table row. The report is short when nothing happened.
