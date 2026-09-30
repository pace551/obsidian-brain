#!/usr/bin/env bash
# build-desktop-skills.sh — package the Desktop/claude.ai skill variants as uploadable
# zips. Optionally upload each to Settings → Customize → Skills (requires code execution).
# Uploaded skills are per-user and update by re-uploading, so re-run this after any
# skills-desktop/ change.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/skills"
rm -rf "$OUT"
mkdir -p "$OUT"

for skill in skills-desktop/*/; do
  name="$(basename "$skill")"
  # zip from inside skills-desktop/ so the archive root is <name>/SKILL.md, which is the
  # layout the uploader expects.
  (cd skills-desktop && zip -q -r "../$OUT/$name.zip" "$name" -x '.*')
  echo "build-desktop-skills: $OUT/$name.zip"
done

echo "build-desktop-skills: done — optionally upload the zips via Settings → Customize → Skills"
