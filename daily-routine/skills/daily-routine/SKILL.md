---
name: daily-routine
description: Runs a configured daily routine (for example "run the morning routine"), finishes the tasks that were waiting once a blocker clears ("vpn is up"), records extend / keep / retire decisions about a task ("retire check 16", "extend the upload task to 11/14"), and turns what the current session just learned into a new routine task ("add that to the morning routine"). Use whenever the user names their routine or one of its tasks.
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
3. A later wave's brief includes the day's results of the tasks in its `after`.
4. Do not start tasks whose `state` is `waiting` or `error`. Every one of them still goes in the
   report: a task with `state: error` (its TASK.md doesn't load, or its `after` names an unknown
   task or forms a cycle) is listed with its `error` text, so a broken file never silently drops
   a check.
5. For each result, write its `history` text to a temp file and `R record <id> <file>`.
6. Write the report exactly as `references/report-format.md` says. Tasks with `endDue: true`, or
   whose result says `endConditionMet: true`, go under "Needs your call" as retire-or-extend
   questions. They still ran today.
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

## 5. Decisions about a task's end

Turn the user's words into `R decide <id> extend|keep|retire [--until YYYY-MM-DD|none]
[--condition "<text>"|none] --note "<who decided, their words>"`. Never decide on your own: no
retiring because an end date passed, no extending because a check is still useful. When a task
has a decision note "retire together with <id>", ask about both in the same question.

## 6. Add a task

When the user says "add that to the <routine name>" (or similar), follow
`references/adding-a-task.md`. The task format is in `references/task-format.md`.

## Rules for every step

- Facts, not guesses: report what a command returned. If something wasn't checked, say so.
- Change nothing outside the routine folder without the user's OK. Reading is fine.
- Keep clean tasks to one table row. The report is short when nothing happened.
