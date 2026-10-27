# Adding a task

Tasks come out of normal work. The user and a session dig into something, and by the end the
session knows the queries, the logs, what normal looks like and when to stop watching. Then the
user says "add that to the <routine name>". Your job is to turn what this session learned into a
task file, and ask only about what it can't fill in.

1. **Draft `TASK.md` from the session**, in the format in `task-format.md`:
   - `title`: the question each run answers.
   - `## What it watches`: why, which fix or ticket, what it can and can't prove.
   - `## Steps`: the commands that actually worked in this session, exactly. Not a paraphrase.
   - `## Reading the result`: the baseline numbers seen today, and what counts as a finding.
2. **Fill the links**:
   - `memory`: the global memory entries this session leaned on.
   - `requires`: what the steps need (VPN, a cloud login). Use names already in `routine.json`.
     For a new one, add it to `routine.json` with a check command (exit 0 = met) and a hint. If
     you can't work out a check, ask the user, or leave `check` null.
   - `after`: tasks whose results this one reads.
   - `shared`: shared files it needs. A rule several tasks need goes in `shared/RULES.md`.
3. **Ask only for the gaps**, one at a time. Usually that is the end: a date, a condition, or
   none. Sometimes a model, when the task is plain data fetching (`sonnet`) or needs careful
   judgment (`opus`).
   **Shadow:** a task copied from an existing routine (a check that already ran on another
   model) gets `model: opus` and a shadow, `shadow:` with `model: sonnet` and `until: 5`, without
   asking. For a brand-new task, ask whether to shadow it and on which model.
4. **Show the draft** and write it after the user says OK:
   `R new <id> --title "<title>"`, then replace the new `TASK.md` with the draft (keep the
   `added` and `decisions` lines `new` wrote). Copy the SQL and scripts the steps use into the task
   folder, and point the steps at those copies.
5. **Offer memory**: when the session learned something that matters beyond this task (for
   example "this vendor's start times are not logged"), offer to save it to global memory, following
   the memory index's own rules for where and how.

The first run of a new task records its baseline. Say so in the next report.
