---
id: disk-space
title: "Is the system drive still above 10% free after last week's cleanup?"
ticket: null
status: active
added: 2026-10-13
end:
  date: 2026-10-20
  condition: "seven clean runs in a row"
  then: ask
decisions:
  - "2026-10-13: added"
requires: []
model: haiku
roles: {}
memory: []
shared: []
after: []
---

## What it watches

The system drive filled up once and builds started failing. A cleanup freed space on 2026-10-13.
This task checks each morning that free space stays above 10%, so a slow refill is caught before
it breaks anything. It can show how much space is free; it can't say what is using it.

## Steps

### disk

PowerShell:

```
Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':')) | Select-Object Used, Free
```

Git Bash, macOS or Linux:

```
df -k /
```

## Reading the result

- **Free space at or above 10%** -> clean. Record the free GB and percent.
- **Below 10%** -> needs-call: give the free GB and percent, and the change since the last run
  from history.
- **The command fails** -> error, with the message.
