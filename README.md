# agent-skills

Agent skills and Claude Code plugins. Each plugin is a top-level folder; the repo is also a
Claude Code plugin marketplace named `agent-skills`.

| Plugin | What it does |
|---|---|
| [`daily-routine`](daily-routine/) | A configurable daily routine. Each task watches one thing, has an end date or end condition you can extend, needs only what it declares (VPN, a cloud login, a connector), and runs in its own sub-agent on its own model. One report per run, in a fixed shape. |

## Installing

```
/plugin marketplace add chrisnigbur/agent-skills
/plugin install daily-routine@agent-skills
/daily-routine:setup
```

The repo is private for now, so Claude Code needs a GitHub login that can read it. See
[`daily-routine/README.md`](daily-routine/README.md#private-repo).

Only engines live here. Your own routine (its tasks, history and run log) stays in a folder on
your machine that setup creates; nothing from it belongs in this repo.
