#!/usr/bin/env bash
# check-skill-drift.sh — fail if a deployed skill in ~/.claude/skills/ differs from the
# canonical copy in skills/. Catches the failure mode this repo exists to prevent: a skill
# hand-edited in place and then lost.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
drift=0

for skill in skills/*/; do
  name="$(basename "$skill")"
  deployed="$DEST/$name/SKILL.md"

  if [ ! -f "$deployed" ]; then
    echo "DRIFT: $name is not deployed ($deployed missing)" >&2
    drift=1
  elif ! diff -u "$skill"SKILL.md "$deployed" >/dev/null; then
    echo "DRIFT: $name differs from the canonical copy:" >&2
    diff -u "$skill"SKILL.md "$deployed" >&2 || true
    drift=1
  else
    echo "ok: $name"
  fi
done

if [ "$drift" -ne 0 ]; then
  echo "" >&2
  echo "Reconcile before committing: keep the deployed edit by copying it back into" >&2
  echo "skills/, or discard it by running scripts/deploy-skills.sh." >&2
  exit 1
fi

echo "check-skill-drift: no drift"
