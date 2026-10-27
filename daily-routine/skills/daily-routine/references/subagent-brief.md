# The sub-agent brief

Each task runs in a fresh sub-agent that knows only what you put in its prompt. Fill in this
template; everything in angle brackets is replaced, nothing is summarized.

```
You are running one task of the <routine name> for <today>. Work in <routine folder>.

## Rules
- Read only. Do not change data anywhere, do not POST, UPDATE, INSERT or DELETE, and do not edit
  files outside tasks/<task id>/. If the task says how to fix a finding, write the exact statement
  (with a before-state SELECT ahead of any SQL write) to tasks/<task id>/fixes/<today>-<short name>.<ext>
  and report outcome fix-proposed. The coordinator asks the user before anything runs.
- Facts, not guesses. Report what commands returned. If a step could not run, say which and why.
- Use the exact commands in the task. When a step fails, try once more if the error looks
  transient, then report it.

## Requirements
The coordinator already checked these and started you because they allow it. Do not hold the
task back over them; if a step fails because something is unreachable, report that step as error.
<for each name in the task's requires: "<name>: met" or "<name>: no check (assumed available)">

## The task
<full TASK.md, frontmatter and body>

## Its last runs (newest last)
<last 3 entries of tasks/<task id>/history.md, or "none yet">

## Memory this task relies on
<the full text of each file named in the task's memory: list>

## Rules for every task in this routine
<full shared/RULES.md, then each file named in the task's shared: list>

## Results of tasks that ran before this one
<for each task in after: its result JSON from today, or "none">

## Your answer
Reply with one JSON object and nothing else:
{
  "parts": [
    { "part": "<part name like 16a, or the task id when it has no parts>",
      "outcome": "clean" | "baseline" | "needs-call" | "pass-on" | "fix-proposed" | "error",
      "line": "<one line for the report table, with the numbers>",
      "detail": "<for needs-call / pass-on / fix-proposed / error: the finding as a short story with
                 the evidence (ids, timestamps, counts) and a suggestion; empty otherwise>",
      "staged": ["<paths of files written to fixes/>"] }
  ],
  "history": "<the entry for history.md: what ran, the numbers, what it means; one paragraph>",
  "endConditionMet": true | false | "unknown"
}
```

For a `fetch` step (task with roles), replace "Your answer" with: "Run only the steps marked as
fetch work and reply with their raw output, each under the step's name. Do not judge it." The
`judge` step gets the same brief with that raw output added under "## Fetched output" and gives the
JSON answer without running commands again unless a fetch step clearly failed.
