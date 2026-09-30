#!/usr/bin/env bash
# deploy-skills.sh — copy the canonical Claude Code skills into ~/.claude/skills/.
# skills/ in this repo is the source of truth; ~/.claude/skills/ is a deployed copy.
# Same pattern as governance/checks/install.sh. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

mkdir -p "$DEST"
for skill in skills/*/; do
  name="$(basename "$skill")"
  mkdir -p "$DEST/$name"
  cp "$skill"SKILL.md "$DEST/$name/SKILL.md"
  echo "deploy-skills: $name -> $DEST/$name/SKILL.md"
done

echo "deploy-skills: done (verify with scripts/check-skill-drift.sh)"
