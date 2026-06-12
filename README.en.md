# senior-mode

*A Claude Code skill that keeps your most expensive model on senior judgment and hands the legwork to Codex.*

<p align="center">
  <img src="./docs/senior-mode-webtoon.png" alt="senior-mode webtoon — fable-5 (the manager) does design/planning/review, Codex 5.5 (the junior) does research/code-search/implementation" width="760">
</p>

[한국어 README](./README.md)

---

`senior-mode` makes Claude act as a senior engineering lead instead of a typist. The expensive, high-reasoning model (fable-5) is reserved for the work only a senior should do — deciding what to investigate, writing precise delegation prompts, reading reports, judging tradeoffs, and producing documents. The grunt work — reading the repo, gathering evidence, running review and debugging passes, and explicitly delegated implementation — goes to the Codex CLI through a bundled companion script.

It follows the `openai/codex-plugin-cc` shape: Claude never hand-rolls `codex` calls. Every Codex interaction goes through `scripts/codex-companion.mjs`, which runs jobs in the foreground or background, tracks their state on disk, and lets you wait on, watch, fetch, or cancel them.

## When to use it

Reach for `senior-mode` when senior judgment is worth more than fast typing:

- Multi-file, architectural, migration, or debugging questions where coding too early wastes effort.
- Decisions that need tradeoff analysis or a carefully written Codex prompt.
- Trigger phrases: `senior-mode`, `시니어 모드`, `fable-5로 판단`, `코덱스에게 조사 시켜`, `정교한 프롬프트 작성`.

Skip it for small tasks, single-file edits, obvious fixes, or anything where Claude would just write the code directly.

## Requirements

- **Claude Code** (CLI, desktop, or IDE extension).
- **Node.js 18+** — the companion script is dependency-free ESM.
- **[Codex CLI](https://github.com/openai/codex)** — `senior-mode` delegates investigation and review to it.
- **git** — used by the installer.

## Install

One line:

```bash
curl -fsSL https://raw.githubusercontent.com/NewTurn2017/fable-senior-mode/main/install.sh | bash
```

This clones the skill into `~/.claude/skills/senior-mode`. Re-running the same command pulls the latest version. Set `CLAUDE_SKILLS_DIR` first if your skills live elsewhere.

### Manual install

```bash
git clone https://github.com/NewTurn2017/fable-senior-mode.git ~/.claude/skills/senior-mode
chmod +x ~/.claude/skills/senior-mode/scripts/codex-companion.mjs
```

## Codex setup

`senior-mode` shells out to the `codex` binary, so Codex must be installed and authenticated first.

1. Install the Codex CLI (see the [Codex repo](https://github.com/openai/codex)).
2. Authenticate — sign in with your ChatGPT/OpenAI account or export an `OPENAI_API_KEY`, per the Codex docs.
3. Verify readiness from this skill:

   ```bash
   node ~/.claude/skills/senior-mode/scripts/codex-companion.mjs setup
   ```

   This runs a doctor check and reports whether Codex is reachable. The installer runs it for you on the last step.

## Usage

In Claude Code, invoke the skill by asking for it — "senior-mode", "시니어 모드", or by describing a task that needs delegated investigation before a decision. Claude then drives the companion script for you. You can also run the script directly:

```bash
# Readiness check
node scripts/codex-companion.mjs setup

# Bounded investigation — block until the report comes back
node scripts/codex-companion.mjs task --wait --read-only --prompt-file <prompt-file> --cwd <repo>

# Open-ended work — start in the background, then track it
node scripts/codex-companion.mjs task --background --read-only --prompt-file <prompt-file> --cwd <repo>

# Explicitly delegated implementation (only when you mean it)
node scripts/codex-companion.mjs task --write --prompt-file <prompt-file> --cwd <repo>

# Code review against a base branch
node scripts/codex-companion.mjs review --background --base main --cwd <repo>
```

### Tracking background jobs

Every background job returns a job id. Use it instead of launching a second run:

| Command | What it does |
| --- | --- |
| `status <job-id> --cwd <repo>` | Current state of a job (or a list of recent jobs). |
| `wait <job-id> --cwd <repo>` | Block until the job finishes, then print the result. |
| `watch <job-id> --cwd <repo>` | Emit one JSON status line per change, ending in `done` or `timeout`. |
| `result <job-id> --cwd <repo>` | Print the stored result (omit the id for the latest job). |
| `cancel <job-id> --cwd <repo>` | Stop a running job and its Codex process. |

Useful flags: `--prompt-file` (multi-line prompts that survive shell quoting), `--timeout-ms`, `--poll-interval-ms`, `--model`, `--effort`, `--json`, `--state-dir`.

Job state is written under `.senior-mode/codex/jobs/` in the workspace root and is gitignored.

## LazyCodex (optional)

[LazyCodex](https://www.npmjs.com/package/lazycodex-ai) is an optional Codex-side harness that adds project memory, planning, subagents, hooks, and verified completion loops. `senior-mode` works without it. Use it only when the delegated work is broad enough that Codex should own a full plan/execute/verify loop. It mutates your `~/.codex` setup, so install it deliberately:

```bash
npx lazycodex-ai install --no-tui --codex-autonomous   # only when you want it
npx lazycodex-ai doctor                                 # health check
```

To use it from this helper, put a LazyCodex trigger (`ultrawork`, `ulw`, `$ulw-loop`, `$ulw-plan`, `$start-work`) in your prompt file and run the normal `task` command. Keep tracking completion through `wait` / `watch` / `status` / `result`.

## Uninstall

```bash
rm -rf ~/.claude/skills/senior-mode
```

## Repository layout

```
senior-mode/
├─ SKILL.md                    # the skill definition Claude Code loads
├─ scripts/
│  └─ codex-companion.mjs      # dependency-free Codex runtime boundary
├─ install.sh                  # curl-pipeable installer
├─ README.md                   # Korean README
└─ README.en.md                # this file
```

## License

[MIT](./LICENSE)
