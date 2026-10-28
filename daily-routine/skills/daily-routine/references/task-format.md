# Task format

A task is a folder `tasks/<id>/` in the routine folder:

```
tasks/<id>/
  TASK.md        frontmatter + how to run it
  history.md     one entry per run, written by `routine.mjs record`
  fixes/         staged fix statements, written by the task's sub-agent
  <files>        the SQL, scripts and notes the steps use
```

The `<id>` is lower-case words joined by `-` and must equal the folder name.

## Frontmatter

Only this YAML subset is read: `key: value`, quoted strings, `null`, numbers, `[a, b]` lists, `{}`,
one level of nested keys (two spaces), and `- item` lists of text. Anything else is an error that
names the line, and only that task fails to load.

| Field | Meaning |
|---|---|
| `id` | the folder name |
| `title` | what the task watches, phrased as the question it answers |
| `ticket` | the ticket behind it, or `null` |
| `status` | `active` or `retired` (set by `decide retire`) |
| `added` | the date it was added |
| `end.date` | the last day it runs (`YYYY-MM-DD`), or `null`. It is "due" the day after. |
| `end.condition` | what has to be true to stop, in words, or `null`. The sub-agent reports `endConditionMet`. |
| `end.then` | `ask` (the user decides) or `delete-proposed` (the report proposes retiring) |
| `decisions` | every add, extend, keep and retire with its date and note; appended by `decide` |
| `requires` | requirement names from `routine.json` (`[vpn]`); the task waits while one is not met |
| `model` | model for this task; overrides `routine.json` |
| `roles` | optional `fetch:` and `judge:` models; the task then runs in two steps |
| `shadow` | optional `model:` (required), `until:` (default 5) and `scope:` (`full`, or `judge` with roles): a second model answers the same brief and is compared with the main one; ended only by `decide adopt-shadow` or `decide unshadow`. The comparison log is `shadow.md` in the task folder |
| `memory` | global memory entry names (file names without `.md`) included in the brief |
| `shared` | files in `shared/` included in the brief (`shared/RULES.md` always is) |
| `after` | tasks that must run first; their results are included in the brief |

## Body

Three sections, in this order:

- `## What it watches`: why the task exists, the fix or risk it follows, what it can and can't
  prove. Someone reading only this should know why it matters.
- `## Steps`: the exact commands in order. Give both shell forms when they differ. Put parts under
  `### <part>` headings (`### 3a`, `### 3b`). With roles, mark fetch steps with `(fetch)`.
- `## Reading the result`: for each part, what is clean, what is baseline (with the numbers), what
  counts as a finding, and what to do with it. If a finding has a known fix, say how to stage it.

## Changing a task

- End, status, model, requires and shadow: only through `routine.mjs decide` with the user's
  words (`extend`, `keep`, `retire`, `unretire`, `set`, `adopt-shadow`, `unshadow`).
- Steps and reading rules: edit the body; mention the change in the next history entry.
- Retiring keeps the folder; nothing is deleted.
