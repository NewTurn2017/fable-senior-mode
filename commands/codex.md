---
description: senior-mode, Codex delegate pinned to gpt-6.1-sol, with gpt-6-astra for difficult work
argument-hint: [task]
---
Senior-mode with the delegate pinned to Codex for this session.

Read `~/.claude/skills/senior-mode/SKILL.md` and follow it with every delegation going through the companion script per the Codex Runtime Contract. Do not route to Opus single-agent or an agent team unless the user explicitly switches.

Run ordinary Codex work on the primary worker: `--model sol` (`gpt-6.1-sol`) with `--effort` omitted so Codex uses its configured effort. For difficult work — best-quality implementation, hard debugging, architecture-bearing investigation, release- or security-bearing review, or anything where a wrong result is expensive — stay within this same Codex path and use `--model astra --effort high` on that `task` or `review`. State the route in one line. If an ordinary result is thin or self-contradictory, escalate to Astra instead of repeating it unchanged. An explicit user model or effort overrides this routing.

There is no `/senior-mode:astra` command. Astra is the difficult-work route inside `/senior-mode:codex`.

Task: $ARGUMENTS
