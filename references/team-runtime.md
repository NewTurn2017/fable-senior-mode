# Senior Mode: Anthropic Team Runtime

This is the Anthropic-only delegation path of senior-mode, entered with `/senior-mode:team` or an explicit user request ("팀 모드", "팀으로 오케스트레이션", "anthropic 모델만으로"). The root `SKILL.md`'s Role Boundaries, Delegation Prompt Contract, Report Handling, Workflow, and Output Style apply unchanged here. Only the runtime differs — instead of the Codex companion script, the session's main model orchestrates a Claude Code agent team.

Role mapping:

- **Team lead = the senior.** The lead is this session's selected model (fable-5 or Opus 4.8 — whatever the user picked with `/model`). It decides the investigation shape, writes spawn prompts, reviews plans and reports, judges, and writes documents. It never writes code bodies and never starts implementing tasks itself while teammates work.
- **Teammates = the delegates.** Claude instances that investigate, review, and implement. Anthropic models only in this mode; Codex and any external runtime are out of scope (that is `/senior-mode:codex`).

## Preflight

Agent teams are experimental and off by default. Check once per session:

```bash
echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-unset}"
```

- Enabled → proceed with a real team.
- `unset` → tell the user to add `"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}` to `~/.claude/settings.json` and restart the session. Offer a degraded fallback for the current session: the same contracts run over plain background subagents (`Agent` tool + `SendMessage` follow-ups), losing inter-teammate messaging and the shared task list. Never present a subagent run as a team run.

## Spawn Contract

Every teammate spawn is a delegation and carries the root skill's Delegation Prompt Contract (goal, scope, evidence, depth, non-goals, stop condition, report shape) plus three team-specific fields:

- **Name:** give each teammate a stable, role-shaped name (`auth-investigator`, `perf-reviewer`) so the lead and user can message it by name later.
- **File ownership:** implementation teammates each own a disjoint set of files. Two teammates never edit the same file; if the split is impossible, serialize with task dependencies instead.
- **Full context:** teammates load CLAUDE.md and project skills but not this conversation. Put every fact the teammate needs in the spawn prompt — paths, constraints, prior findings, decisions already made.

Model policy:

- The lead stays on the user's selected session model. Do not change it.
- Teammates default to `opus`. Use `sonnet` or `haiku` only for mechanical, low-judgment work, and say so when doing it. Use `fable` for a teammate only when the user explicitly asks.
- Never route any part of this mode's work to Codex or another non-Anthropic runtime.

## Orchestration Patterns

Pick the smallest pattern that fits; team size 3–5, roughly 5–6 tasks per teammate.

**Investigation (default).** 2–3 read-focused teammates with distinct lenses (architecture, data flow, failure modes). For unknown-cause debugging, make them adversarial: each investigates one hypothesis and messages the others to disprove theirs; the surviving theory is the answer. The lead synthesizes — it does not investigate in parallel with them.

**Review.** One teammate per review dimension (correctness, security, performance, tests) over the same diff or PR. The lead merges findings ordered by severity, preserving paths, line numbers, and uncertainty labels. After presenting findings, stop — no auto-fix without separate user approval (root skill rule).

**Implementation with plan approval.** The team-mode equivalent of the Codex `$ulw-plan` → `$start-work` flow:

1. Spawn the implementer with plan approval required (`mode: "plan"`). The teammate works read-only until its plan is approved.
2. When the plan arrives, the lead reviews it as a senior: risks, omissions, over-engineering, Must-NOT violations.
3. Approve, or reject with concrete feedback; the teammate revises and resubmits. For large or risky scope, surface the plan to the user before approving.
4. After approval the teammate implements. Track progress through the shared task list and idle notifications.

**Cross-layer feature.** Split by layer (frontend, backend, tests), one teammate per layer, dependencies expressed as tasks (`TaskCreate` with `dependencies`) so a teammate cannot claim blocked work early.

## Coordination Rules

- Maintain the shared task list: create tasks with clear deliverables and dependencies; let teammates self-claim follow-on work or assign explicitly.
- Follow up with `SendMessage` to the existing teammate; do not respawn a new one to continue a conversation.
- Idle notifications arrive automatically — do not poll. If a teammate stalls on an error, message it with instructions or spawn a replacement.
- The lead waits. If tempted to "just implement it meanwhile", that is the root skill's anti-pattern list talking — resist it.
- Teammate permission prompts bubble up to this session; the user approves them, not the lead.

## Completion

1. Verify delegated changes per root Workflow step 8 (run the focused test or scenario) before presenting completion.
2. Ask remaining teammates to shut down.
3. Deliver the senior output: `Judgment`, `Why`, `Next Prompt / Artifact`, `Limits` — synthesized from teammate reports, with each teammate's evidence attributed.

Cost note: every teammate is a full Claude instance; a team burns tokens far faster than one session. If the work is a bounded evidence report with no inter-agent discussion, say so in one line and offer plain subagents or `/senior-mode:codex` instead.
