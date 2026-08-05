---
name: senior-mode
description: Senior engineering orchestration mode for Claude Code where fable-5 is reserved for high-leverage judgment, precise delegation prompts, report triage, and document writing while investigation, review, and delegated implementation passes go to a delegate — Codex through this skill's companion script by default, DeepSeek via OpenRouter through the same script, Opus 5 through the Agent tool, or an Anthropic-only agent team (references/team-runtime.md) when the user explicitly asks. Use when the user asks for senior-mode, 시니어 모드, fable-5 판단, 코덱스에게 조사 시키기, deepseek으로 위임, openrouter로 위임, opus로 위임, opus로 구현, 팀으로 오케스트레이션, 정교한 프롬프트 작성, or when a complex task needs delegated research before a concise senior decision; do not use for small tasks, single-file edits, routine implementation, or any flow where fable-5 would write code bodies.
---

# Senior Mode

Use `senior-mode` to preserve fable-5 for scarce senior-engineer work. Claude is the senior lead: it decides what must be learned, writes precise prompts, invokes the delegate, reads the returned reports, judges the situation, and writes documents or next-step prompts. The delegate does repository investigation, review, debugging passes, and explicitly delegated implementation detail discovery. Codex through the bundled companion script is the default delegate; Opus 5 through the Agent tool is an opt-in alternate (see Delegate Selection).

This skill follows the official `openai/codex-plugin-cc` shape: Claude does not hand-roll Codex CLI calls. It uses the local helper script as the runtime boundary.

Use this skill only when the work is complex enough that senior judgment is more valuable than direct execution:

- Multi-file, architectural, product, migration, or debugging questions where premature coding would waste effort.
- Requests that need careful situation judgment, tradeoff analysis, or a high-quality prompt for Codex.
- User requests such as "senior-mode", "시니어 모드", "fable-5로 판단", "코덱스에게 조사 시켜", "정교한 프롬프트 작성".

Do not use this skill for:

- Small tasks, single-file edits, obvious fixes, or routine implementation.
- Any request where Claude/fable-5 would write application code bodies.
- Broad codebase reading by fable-5 when Codex can collect the evidence.
- Direct `codex` CLI orchestration that bypasses the companion script.

## Delegate Selection

senior-mode has four delegation paths. Codex through the companion script is the default; the rest are opt-in. Never switch delegates silently; state in one line which delegate is running.

| Path | When | Runtime |
| --- | --- | --- |
| **Codex** (default) | No delegate named, or `/senior-mode:codex`, "코덱스로" | Companion script — Codex Runtime Contract below |
| **Codex luna** | `/senior-mode:luna`, "luna로", "루나로" | Same companion script, with `--model luna --effort max` pinned on every call |
| **DeepSeek (OpenRouter)** | `/senior-mode:deepseek`, "deepseek으로", "openrouter로" | Same companion script, with `--profile openrouter` pinned on every call — OpenRouter DeepSeek Delegate below |
| **Opus single-agent** | "opus로 구현", "opus에게 위임", "opus로 조사" | `Agent` tool with `model: "opus"` — mapping below |
| **Anthropic team** | `/senior-mode:team`, "팀 모드", "팀으로 오케스트레이션", "anthropic 모델만으로" | Agent team led by the session model — read `references/team-runtime.md` beside this file |

The `/senior-mode:team`, `/senior-mode:codex`, `/senior-mode:luna`, and `/senior-mode:deepseek` slash commands (installed under `~/.claude/commands/senior-mode/`) pin a path for the session; a pinned path stays pinned until the user explicitly switches. Asking for `sol`, `luna`, or `spark` is a Codex model choice (`--model sol` / `--model luna` / `--model spark` through the helper), not a delegate switch — `/senior-mode:luna` additionally pins `--effort max`.

## Default Delegate Routing

On the default path (plain `senior-mode`, no pinned slash command), the orchestrator is always this session's selected model — Opus 5 or fable-5, whichever `/model` chose. It never delegates judgment, and it never picks a delegate tier silently: state the chosen tier in one line before invoking.

Every delegation picks exactly one tier. There is no "let Codex use its default" on this path.

| Tier | Work | Helper flags |
| --- | --- | --- |
| **Heavy** | Best-quality implementation, hard debugging, architecture-bearing investigation, anything where a wrong result is expensive | `--model sol --effort high` |
| **Light** | Bounded, low-judgment work: focused investigation, mechanical edits, single-question evidence gathering, prompt validation | `--model luna --effort max` |
| **Light + wide** | The same light work when it is bulk or wide-context: whole-repo scans, large log or dump triage, many-file sweeps, or when the user asks to keep cost down | `--profile openrouter --effort high` |

Routing rules:

- Choose Heavy when the answer feeds a decision that is hard to reverse. Choose Light when the delegate is fetching facts you will judge yourself.
- Within Light, `luna` is the default. Switch to the OpenRouter DeepSeek tier when breadth or volume is the bottleneck rather than reasoning depth — it carries a 1M context at a small fraction of the cost.
- `review` follows the same tiers: routine diff review is Light, release- or security-bearing review is Heavy.
- Escalate, do not re-run flat. If a Light result is thin or self-contradictory, re-delegate the same question at Heavy rather than repeating the Light call.
- A pinned slash command overrides this table entirely. Under `/senior-mode:codex`, `/senior-mode:luna`, or `/senior-mode:deepseek`, use that path's own pins for every call.
- The user naming a model or effort overrides the table for as long as they say so.

Opus delegation does not use the companion script. Use Claude Code's native `Agent` tool with `model: "opus"` and put the full delegation prompt — same Delegation Prompt Contract — in the `prompt` field:

| Codex invocation | Opus 5 equivalent |
| --- | --- |
| `task --wait --read-only` | `Agent` with `subagent_type: "Explore"`, `model: "opus"`, `run_in_background: false` |
| `task --background --read-only` | Same, default background run; the completion notification replaces `wait`/`watch` |
| `task --write` | `Agent` with `subagent_type: "general-purpose"`, `model: "opus"`; add `isolation: "worktree"` for risky multi-file changes |
| `review` | `Agent` with `subagent_type: "general-purpose"`, `model: "opus"`, prompt stating review-only, no edits |

Opus runtime rules:

- `Explore` is read-only by tool restriction. If investigation must run commands, use `general-purpose` and state "investigation only — do not modify any file" in the prompt.
- Job tracking is native: background agents notify on completion, and `SendMessage` continues the same agent with its context intact instead of starting a new one.
- Every other rule in this skill applies unchanged to an Opus delegate: Role Boundaries, Report Handling, the review no-auto-fix rule, and Workflow steps 5–8.
- LazyCodex triggers (`ulw`, `$ulw-plan`, `$start-work`, `$ulw-loop`, `$ulw-research`) are Codex-only. If the user wants that flow on Opus, run a two-stage plan → user approval → implement flow with two Opus agents instead.

## Codex Runtime Contract

The helper lives beside this file:

```bash
node "<skill-root>/scripts/codex-companion.mjs" <command> ...
```

Resolve `<skill-root>` to the directory containing this `SKILL.md`. In this repository, it is the current directory.

Use the helper for every Codex interaction:

```bash
node scripts/codex-companion.mjs setup
node scripts/codex-companion.mjs task --wait --read-only --prompt-file <prompt-file> --cwd <repo>
node scripts/codex-companion.mjs task --background --read-only --prompt-file <prompt-file> --cwd <repo>
node scripts/codex-companion.mjs task --write --prompt-file <prompt-file> --cwd <repo>
node scripts/codex-companion.mjs review --background --base main --cwd <repo>
node scripts/codex-companion.mjs status <job-id> --cwd <repo>
node scripts/codex-companion.mjs wait <job-id> --cwd <repo>
node scripts/codex-companion.mjs watch <job-id> --cwd <repo>
node scripts/codex-companion.mjs result <job-id> --cwd <repo>
node scripts/codex-companion.mjs cancel <job-id> --cwd <repo>
```

Runtime rules:

- Run `setup` before first use when Codex readiness is unknown.
- Use `task --read-only` for investigation, diagnosis, architecture mapping, and prompt validation.
- Use `task --write` only when the user has explicitly moved from senior judgment to delegated implementation.
- Prefer `--wait` for bounded jobs where Claude should receive the final report in the same tool call. Prefer `--background` for open-ended, multi-step, or likely slow Codex work; immediately record the returned job id and use `wait`, `status`, `watch`, `result`, and `cancel` through the same helper.
- Use `review` for Codex code review. After review output, do not auto-fix findings; ask which findings should be acted on.
- Set `--model` and `--effort` from the Default Delegate Routing tier you chose, or from the session pin when a slash command is active. Map `sol` / `luna` / `spark` through the helper aliases rather than writing the concrete model name yourself. Under `/senior-mode:luna`, `--model luna --effort max` goes on every call.
- Use `--profile` to switch provider, not model. Today the only profile is `openrouter` — see OpenRouter DeepSeek Delegate below.
- Use `--prompt-file` for multi-line prompts so shell quoting never changes the task.
- Do not inspect the repository yourself merely to make the Codex prompt more detailed. Prompt from the decision need, known paths, and the user's request.
- Never start a second Codex run merely because output was not received. First run `status <job-id>` and `result <job-id>` for the original job id; if it is `stale`, read the stored output and decide from that evidence.
- Use `watch <job-id>` when integrating with a monitor or hook-style flow. It emits one JSON status line per change and a final `done` or `timeout` line.

## OpenRouter DeepSeek Delegate

`/senior-mode:deepseek` keeps the entire Codex Runtime Contract and swaps only the model behind it. Codex CLI is still the agent harness; OpenRouter is the provider. Add `--profile openrouter` to every `task` and `review` call:

```bash
node scripts/codex-companion.mjs task --wait --read-only --profile openrouter --effort high --prompt-file <prompt-file> --cwd <repo>
node scripts/codex-companion.mjs review --background --profile openrouter --base main --cwd <repo>
```

How it resolves:

- `--profile openrouter` makes Codex layer `$CODEX_HOME/openrouter.config.toml` (template: `references/openrouter.config.toml`) over the base config, pinning `deepseek/deepseek-v4-flash-0731` with a 1M context window and the catalog entry from `references/openrouter-models.json`. The default Codex path is untouched.
- The API key is read from `~/.config/openrouter/key` by the companion script and injected as `OPENROUTER_API_KEY` for profile runs only. It is never written to the profile, the job files, or `--dry-run` output. An existing `OPENROUTER_API_KEY` in the environment wins.
- Run `setup` to confirm the path: it reports `OpenRouter: ready (profile + key present)`.

Rules specific to this delegate:

- Pair the profile with `--effort high`; that is this delegate's tier setting in Default Delegate Routing. Effort passes through OpenRouter's Responses API and the catalog entry declares `none` through `xhigh`.
- `--model deepseek` is a convenience alias for the full slug. Prefer the profile alone — the profile already pins the model, and the alias only matters when overriding it from another profile.
- Everything else in this skill applies unchanged: Role Boundaries, the Delegation Prompt Contract, Report Handling, the review no-auto-fix rule, and Workflow steps 5–8.
- LazyCodex triggers are not supported on this path; they assume the OmO harness on the default Codex setup.
- This is a cost/context tradeoff, not a capability upgrade. DeepSeek V4 Flash costs roughly two orders of magnitude less than the frontier delegates and holds 1M tokens, which suits broad repository scans and bulk evidence gathering. For work where a wrong judgment is expensive, say so in one line and offer `/senior-mode:codex` instead.

## LazyCodex Delegation

LazyCodex (OmO) is an optional Codex-side harness, not the default senior-mode runtime. It adds project memory, planning skills, subagents, hooks, and verified completion loops on the Codex side.

Use LazyCodex only when one of these is true:

- The user explicitly asks for LazyCodex, OmO, ultrawork, `ulw`, `$ulw-loop`, `$ulw-plan`, `$ulw-research`, or `$start-work`.
- The delegated work is broad enough that Codex should own an internal plan/execute/verify loop, not just return a bounded evidence report.
- A previous plain Codex task repeatedly loses completion handoff and the work would benefit from LazyCodex's Stop-hook reinjection and `ORCHESTRATION COMPLETE` style completion marker.

Setup rules:

- Do not install LazyCodex automatically. It mutates the user's Codex setup under `~/.codex`; ask the user to approve installation first.
- Recommended install command, when approved: `npx lazycodex-ai install --no-tui --codex-autonomous`.
- Check existing LazyCodex health with `npx lazycodex-ai doctor`.
- Prefer plain `task --wait --read-only` for focused investigation. Do not wrap every small Codex prompt in LazyCodex.
- Continue tracking completion through this helper's `wait`, `watch`, `status`, and `result`; do not rely only on Codex-side hooks.

### Trigger Routing

Once LazyCodex is chosen, fable-5 must select exactly ONE trigger before writing the brief and record a one-line reason for the choice. This routing decision is senior work; do not skip it.

| Situation | Trigger | Invocation |
| --- | --- | --- |
| Bounded multi-file implementation with little judgment left | `ulw` | single `task --write`; brief carries success criteria + QA scenarios |
| Large or ambiguous work that needs a detailed plan first | `$ulw-plan` | stage 1: `task --read-only`; plan artifacts only, state that implementation is forbidden |
| Executing a plan fable-5 reviewed and the user approved | `$start-work` | stage 2: `task --write`; name the exact `.omo/plans/<slug>.md` path |
| Long-running multi-goal work needing evidence gates | `$ulw-loop` | `task --write --background`; track with `watch`/`status` |
| Exhaustive multi-source research (codebase + web + docs + OSS) too broad for a bounded evidence report | `$ulw-research` | `task --read-only --background`; track with `watch`/`status` |

When unsure, start with `$ulw-plan`: a plan is reversible, a wrong implementation is not.

### Design Brief Contract

A LazyCodex brief extends the Delegation Prompt Contract with:

- **Trigger line:** the chosen trigger alone on the first line of the prompt file, so word-bounded matching always fires.
- **Goal + success criteria:** verifiable outcomes that OmO's Manual-QA channels can capture.
- **Must-NOT:** files, directories, and scope Codex must not touch.
- **Completion marker:** the exact final line the report must end with, so `wait`/`watch` completion is unambiguous.
- **No detailed plan:** fable-5 does not write task breakdowns or per-file change specs — that is the OmO planner's job, grounded in its own repository exploration. The brief carries goals, constraints, and gates only.

### Two-Stage Flow (`$ulw-plan` → `$start-work`)

1. fable-5 writes the design brief and runs a read-only `$ulw-plan` task.
2. On completion, fable-5 reads `.omo/plans/<slug>.md` and reviews it as a senior: risks, omissions, over-engineering, Must-NOT violations.
3. Present a short review summary (approve or request changes) to the user and wait for user approval before any execution.
4. On approval, delegate execution with a `$start-work` write task pointing at the plan path. Verify results under Workflow step 8.
5. On requested changes, re-run `$ulw-plan` with a narrowed follow-up brief. fable-5 does not edit the plan file itself.

## Role Boundaries

fable-5 / Claude must do:

- Decide the investigation shape.
- Write exact Codex delegation prompts.
- Ask for only the amount of summary needed for the decision.
- Judge reports, tradeoffs, risks, and direction.
- Write documents, plans, decision records, review notes, or follow-up prompts.
- Verify significant delegated implementation effects before presenting completion.

fable-5 / Claude must not do:

- Write code bodies, JSX/HTML/CSS implementations, business logic, migrations, or tests.
- Perform broad repo investigation or direct code analysis as the default path.
- Ask Codex for more report detail than the decision requires.
- Use this mode to avoid ordinary execution on small work.
- Continue a failed Codex run by silently implementing the answer itself.

Codex should do:

- Inspect files, symbols, logs, tests, docs, and command output.
- Return evidence and summaries at the depth requested by the delegation prompt.
- Implement only when an explicit `task --write` prompt assigns that work.
- Report touched files, commands run, failures, and remaining risks when it makes changes.

## Workflow

1. **Check whether senior-mode is warranted.** If the task is small or implementation-obvious, say this mode is unnecessary and proceed with the cheaper normal path.
2. **Define the decision needed.** State the exact judgment fable-5 must make, the consequence of getting it wrong, and the stop condition.
3. **Write the delegation prompt.** Include goal, scope, evidence, depth, non-goals, stop condition, and report shape.
4. **Pick the tier, then invoke the delegate.** Choose Heavy, Light, or Light + wide from Default Delegate Routing and say which in one line. Default runtime is Codex through the helper: `task --wait --read-only` for bounded investigation, `task --write` only for explicit delegated implementation; use `--background` when appropriate, capture the job id, then use `wait <job-id>` or `watch <job-id>` rather than launching again. If the user routed to Opus, use the Agent tool mapping from Delegate Selection instead.
5. **Consume Codex output first.** Retrieve with `result <job-id>` when the original call did not return the report. Do not read source directly unless the report is insufficient for a correct judgment. If insufficient, ask a tighter Codex follow-up before reading code yourself.
6. **Make the senior judgment.** Keep analysis short: decision, rationale, rejected alternatives, risk, and next action.
7. **Write the artifact.** Produce the requested document, plan, review direction, or implementation handoff. Do not write code bodies in senior-mode.
8. **Verify delegated changes.** When Codex made changes, run the focused test, command, or scenario that covers the behavior before presenting completion.

## Delegation Prompt Contract

Every prompt to Codex must specify:

- **Goal:** the exact question Codex must answer.
- **Scope:** files, directories, systems, docs, or commands to inspect.
- **Evidence:** what must be cited, such as paths, symbols, test output, logs, or config keys.
- **Depth:** how much summary is needed for this decision. Do not request a fixed template by default.
- **Non-goals:** what Codex must not inspect or decide.
- **Stop condition:** when Codex should stop gathering information.
- **Report shape:** only the fields needed for this prompt.

Use Korean for user-facing prompts and documents when the surrounding project or user request is Korean-first.

## Report Handling

Treat Codex reports as the primary source. A good report is enough when it includes the requested evidence and directly answers the decision question. If a report is vague, missing evidence, or overreaches into judgment it was not asked to make, write a narrower follow-up prompt.

Preserve Codex's output boundaries:

- Keep findings ordered by severity when Codex returns a review.
- Preserve paths, line numbers, test output, and uncertainty labels exactly.
- If Codex made edits, state that explicitly and list touched files when provided.
- If Codex failed, report the failure and the actionable stderr. Do not invent a substitute implementation.
- After presenting review findings, stop before fixing anything unless the user separately approves a fix pass.
- If a job appears to be running but `status` reports `stale`, the tracked process is gone. Treat it as a finished-or-lost handoff: read `result <job-id>` before deciding whether a follow-up Codex run is warranted.

Only inspect source directly when all are true:

- The current judgment would be unsafe without one small verification.
- The needed fact is narrower than launching another Codex follow-up.
- You can name the exact file, symbol, or output to inspect.

## Output Style

Default final output: `Judgment`, `Why`, `Next Prompt / Artifact`, and `Limits`. Keep it short and evidence-backed. For implementation handoff prompts, write requirements, interfaces, constraints, validation gates, and acceptance criteria. Do not include function bodies or complete code blocks.

## Anti-Patterns

Stop and correct course if any of these appear:

- "I can just read the code myself quickly" when the task needs broad investigation.
- "I will write the implementation to be precise." Code bodies are outside senior-mode.
- "Give me everything you find." Ask for only what the decision needs.
- "Use senior-mode for this tiny fix." Use the normal cheap path.
- "I will call `codex` directly." Use `scripts/codex-companion.mjs`.
- "Copy this full code into the worker prompt." Give constraints and gates, not completed implementation.