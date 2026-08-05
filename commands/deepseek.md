---
description: senior-mode, delegate pinned to DeepSeek V4 Flash via OpenRouter
argument-hint: [task]
---
Senior-mode with the delegate pinned to DeepSeek (`deepseek/deepseek-v4-flash-0731`) served through OpenRouter for this session.

Read `~/.claude/skills/senior-mode/SKILL.md` and follow it, including the "OpenRouter DeepSeek Delegate" section. The session model (fable-5 or Opus 5 — whatever `/model` selected) stays the senior orchestrator; every delegation goes through the companion script per the Codex Runtime Contract with `--profile openrouter` on every `task` and `review` call. Do not pass `--effort`, do not route to the default Codex models, Opus single-agent, or an agent team, and do not drop the profile pin, unless the user explicitly switches.

Task: $ARGUMENTS
