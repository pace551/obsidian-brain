#!/usr/bin/env bash
# register-desktop.sh — add (or refresh) the obsidian-brain entry in Claude Desktop's
# config. Backs the file up first and merges rather than rewrites: every other key,
# including "preferences", is preserved. Idempotent — re-run after moving the repo.
#
# Restart Claude Desktop afterwards; it reads this file only at launch.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="$(pwd -P)"
ENTRYPOINT="$REPO/dist/index.js"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
VAULT="${OBSIDIAN_VAULT_ROOT:-$HOME/Documents/Obsidian/Personal}"
CONFIG="${CLAUDE_DESKTOP_CONFIG:-$HOME/Library/Application Support/Claude/claude_desktop_config.json}"

[ -f "$ENTRYPOINT" ] || { echo "register-desktop: $ENTRYPOINT missing — run 'npm run build' first" >&2; exit 1; }
[ -d "$VAULT" ] || { echo "register-desktop: vault not found at $VAULT" >&2; exit 1; }
[ -x "$NODE_BIN" ] || { echo "register-desktop: node not found (set NODE_BIN)" >&2; exit 1; }

mkdir -p "$(dirname "$CONFIG")"
if [ -f "$CONFIG" ]; then
  backup="$CONFIG.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$CONFIG" "$backup"
  echo "register-desktop: backed up -> $backup"
else
  echo '{}' > "$CONFIG"
  echo "register-desktop: created $CONFIG"
fi

# Values go in via argv, never interpolated into the script body (SEC-INPUT-03).
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const [configPath, nodeBin, entrypoint, vault] = process.argv.slice(1);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers["obsidian-brain"] = {
    command: nodeBin,
    args: [entrypoint],
    env: { OBSIDIAN_VAULT_ROOT: vault },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
' "$CONFIG" "$NODE_BIN" "$ENTRYPOINT" "$VAULT"

echo "register-desktop: obsidian-brain -> $NODE_BIN $ENTRYPOINT (vault: $VAULT)"
echo "register-desktop: restart Claude Desktop to pick it up"
