---
description: senior-mode, Codex delegate pinned to gpt-5.6-luna at max effort
argument-hint: [task]
---
Senior-mode with the delegate pinned to Codex running `gpt-5.6-luna` at `max` reasoning effort for this session.

Read `~/.claude/skills/senior-mode/SKILL.md` and follow it. The session model (fable-5 or Opus 5 — whatever `/model` selected) stays the senior orchestrator; every delegation goes through the companion script per the Codex Runtime Contract with `--model luna --effort max` on every `task` and `review` call. Do not route to Opus single-agent or an agent team, and do not drop the model/effort pin, unless the user explicitly switches.

Task: $ARGUMENTS
