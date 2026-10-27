---
id: new-task
title: "What this task watches, as a question the run answers"
ticket: null                   # the ticket behind it, if any
status: active                 # active | retired
added: null
end:
  date: null                   # last day it runs (YYYY-MM-DD), or null
  condition: null              # or what has to be true to stop, in words
  then: ask                    # ask (you decide) | delete-proposed (the run proposes retiring it)
decisions: []                  # every add / extend / keep / retire, appended by `routine.mjs decide`
requires: []                   # requirement names from routine.json, like [vpn]
model: null                    # overrides routine.json's model for this task
roles: {}                      # optional: fetch: sonnet, judge: opus
memory: []                     # global memory entries this task relies on (file names without .md)
shared: []                     # files in the routine's shared/ folder this task needs
after: []                      # tasks that must run first; their results are handed to this one
---

## What it watches

<!-- Why the task exists, what fix or risk it follows, and what it can and can't prove. -->

## Steps

<!-- The exact commands, in order, with the PowerShell and Git Bash forms where they differ.
     With roles, mark the steps that are fetch work. Never a write: stage fixes in fixes/. -->

## Reading the result

<!-- What is clean, what is baseline (with the numbers), what is a finding, and what to do with
     each. If a finding has a known fix, say how to stage it. -->
