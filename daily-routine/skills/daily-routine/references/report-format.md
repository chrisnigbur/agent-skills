# The report

One report per run, in chat, in this shape. A follow-up run ("the VPN is up") uses the same shape
for just the tasks it ran.

## Shape

1. **Opening paragraph**: when it ran (local time and UTC), the window the tasks looked at, whether
   anything needs a write, and how many items need the user. One to three sentences.
2. **Needs your call: <task or part>**: one section per item, from outcomes `needs-call` and
   `fix-proposed`, then the retire-or-extend questions. Tell each finding as a short story: what was
   found, two or three evidence bullets (ids, dates, counts), then a suggestion. For `fix-proposed`,
   show the staged statement word for word and ask for an OK.
   Shadowed tasks add two kinds of item, after the findings. Both use only today's `R shadow`
   output, never the status read before the run:
   - **Needs your call: <task>, the models disagree**: the `R shadow` verdict was `mismatch` or
     `error`. One bullet per model with its outcome and line (main first, marked "used"), then the
     diffs, then "Which one was right?".
   - **Needs your call: <task>'s <shadow model> shadow has matched <main model> <streak> runs in a
     row**: `due: true`. Say how many of those runs had a finding (`findingsInStreak`; "all clean"
     when 0), then "Switch the task to <shadow model>, or keep comparing?". Ask it every run the
     streak still holds; nothing switches until the user says so.
   A `skipped` verdict (both models errored on every part) gets neither item: the task's error goes
   under "Not run yet" as usual, with "(shadow skipped)".
3. **Worth passing to <who or which thread>: <task>**: outcome `pass-on`, same story form.
4. **Clean or at baseline**: one table, `| Task | Result |`, one row per task, or one row per part
   when the parts came out differently. The result is the sub-agent's `line`: numbers, not "fine".
   A shadowed task whose shadow matched adds ` (shadow agrees, <streak> of <until>)` to its row.
5. **Not run yet because <reason>**: tasks that were `waiting` (name the requirement and its hint)
   and parts with outcome `error` (say what failed). End with what the user should say to finish
   them ("Tell me when the VPN is up and I'll finish them.").
6. **Not run yet because the task file has a problem**: every task with `state: error` in status,
   one line each, `<id>: <error>`, with what to fix ("frontmatter line 7: expected key: value").
   Never leave these out: a check that silently stops reporting is what the routine exists to
   prevent.
7. **Closing line**: where the results were recorded (task histories and today's run-log row).

Leave out sections that have nothing in them.

## Example (made-up tasks)

> I ran the morning routine at about 08:00 local (13:00Z) over the last 24 hours. Nothing needs a
> write today. One item needs your decision, and two tasks are waiting on the VPN.
>
> **Needs your call: order-sync, customer 4521**
> - Two orders for the same cart were created three seconds apart (10/26 14:48:50Z and 14:48:53Z).
> - Only the second has a payment; the first is stuck in PENDING.
> - This is not the retry bug the task watches: the second request came from a different device.
>
> My suggestion is to cancel the first order. I haven't staged a fix.
>
> **Needs your call: disk-space reached its end date (2026-10-20)**
> Seven clean runs since the cleanup. Retire it, or extend it?
>
> **Needs your call: api-errors' Sonnet shadow has matched Opus 5 runs in a row**
> All five were clean, so Sonnet hasn't been tested on a finding yet. Switch the task to Sonnet,
> or keep comparing?
>
> **Clean or at baseline**
>
> | Task | Result |
> |---|---|
> | nightly-export | 3 files, 12,410 rows, same as the 7-day average (shadow agrees, 2 of 5) |
> | api-errors | 2 timeouts, both from the known slow partner |
>
> **Not run yet because the VPN is off:** db-replica-lag, queue-depth. Tell me when the VPN is up
> and I'll finish them.
>
> Today's results are in each task's history and today's run-log row.

## Follow-up runs

Open with "I ran the <n> tasks that were waiting on <what>", give one bullet or row per task, then
"Still waiting on you from this morning:" with a numbered list of the open items from the first
report, including any task whose file still has a problem.
