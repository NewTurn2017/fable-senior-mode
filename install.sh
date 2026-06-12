#!/usr/bin/env bash
#
# senior-mode installer for Claude Code
#
#   curl -fsSL https://raw.githubusercontent.com/NewTurn2017/fable-senior-mode/main/install.sh | bash
#
# Clones (or updates) the skill into ~/.claude/skills/senior-mode so Claude Code
# can load it. Re-running pulls the latest version. Override the skills root with
# CLAUDE_SKILLS_DIR if your setup differs.

set -euo pipefail

REPO="NewTurn2017/fable-senior-mode"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
TARGET="$SKILLS_DIR/senior-mode"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$1" >&2; exit 1; }

# --- prerequisites -----------------------------------------------------------
command -v git  >/dev/null 2>&1 || fail "git is required but was not found on PATH."
command -v node >/dev/null 2>&1 || fail "Node.js 18+ is required but 'node' was not found on PATH."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18+ is required (found $(node -v))."

mkdir -p "$SKILLS_DIR"

# --- install or update -------------------------------------------------------
if [ -L "$TARGET" ]; then
  warn "$TARGET is a symlink (looks like a local dev checkout). Leaving it untouched."
  exit 0
elif [ -d "$TARGET/.git" ]; then
  info "Updating existing install at $TARGET"
  git -C "$TARGET" pull --ff-only
elif [ -e "$TARGET" ]; then
  fail "$TARGET already exists but is not a git checkout. Move it aside and re-run."
else
  info "Cloning $REPO into $TARGET"
  git clone --depth 1 "https://github.com/$REPO.git" "$TARGET"
fi

chmod +x "$TARGET/scripts/codex-companion.mjs" 2>/dev/null || true

# --- codex readiness check ---------------------------------------------------
info "Checking Codex readiness"
if node "$TARGET/scripts/codex-companion.mjs" setup; then
  :
else
  warn "Codex is not fully ready yet. See the 'Codex setup' section of the README."
fi

info "Installed at $TARGET"
echo
echo "Next: open Claude Code and invoke the skill with 'senior-mode' or '시니어 모드'."
