# CLAUDE.md — obsidian-brain

Local stdio MCP server over the personal Obsidian vault, plus the version-controlled
source for the `obsidian-capture` / `obsidian-recall` skills.

Governed project — tier and applicable standards in `GOVERNANCE.md`; run
`/verify-compliance` before calling any work done (Constitution C2).

## Structure

```
src/
  index.ts    McpServer + StdioServerTransport bootstrap
  config.ts   vault root ($OBSIDIAN_VAULT_ROOT, else ~/Documents/Obsidian/Personal)
  schema.ts   NOTE_TYPES / AREAS + zod tool input schemas — the note contract
  note.ts     slugify, render, collision suffix, atomic write
  vault.ts    path safety, vault walk, frontmatter + section parser
  search.ts   ranked scan + recency listing
  tools.ts    registerTool wiring (behavior lives in the modules above)
tests/        unit + in-process protocol + stdio e2e + skills lint
  helpers/    test vault factory (temp dirs, explicit mtimes)
  fixtures/   committed vault of awkward notes (CRLF, no frontmatter, inline lists)
skills/           canonical Claude Code skills — deployed to ~/.claude/skills/
skills-desktop/   Claude Desktop / claude.ai variants that drive the MCP tools
scripts/          lint, test, deploy-skills, check-skill-drift, build-desktop-skills,
                  register-desktop
```

## Commands

All commands runnable verbatim from repo root:

```bash
scripts/lint.sh                 # format check + lint (STK-TS-03)
scripts/test.sh                 # tests + coverage (STK-TS-04)
npm run typecheck               # tsc --noEmit
npm run build                   # -> dist/index.js
npm run inspect                 # MCP inspector against a live server
npm run deploy:skills           # skills/ -> ~/.claude/skills/
npm run check:skill-drift       # fails if the deployed copy diverged
npm run build:desktop-skills    # skills-desktop/ -> dist/skills/*.zip
npm run register:desktop        # merge into claude_desktop_config.json (backs it up)
```

Tools by `node_modules/.bin` or npm scripts, never global installs (STK-TS-08).

## Gotchas

- **`dist/` is gitignored but Claude Desktop launches from it.** After any `src/` change:
  `npm run build`, then **restart Claude Desktop** — it reads its config and starts the
  server only at launch. A stale `dist/` is the most likely reason a fix "didn't take".
- **`skills/` is the source of truth, `~/.claude/skills/` is a copy.** Editing the
  deployed copy is how the originals nearly got lost. Edit here, run `deploy:skills`,
  and `check-skill-drift.sh` will tell you if the two ever diverge.
- **Desktop skills are optional; the MCP server is what Desktop uses.** Uploading the
  zips (Settings → Customize → Skills) only adds workflow guidance. If they are uploaded,
  they don't auto-update: after changing `skills-desktop/`, run `build:desktop-skills` and
  re-upload.
- **The taxonomy lives in `src/schema.ts`.** Changing `NOTE_TYPES` or `AREAS` is a vault
  taxonomy change: update every SKILL.md that enumerates them or `tests/skills.test.ts`
  fails (that is the test's whole job).
- **Never point tests at the real vault.** Tests build temp vaults via
  `tests/helpers/vault.ts`; `tests/fixtures/vault/` is a committed corpus of awkward
  notes. Both are disposable.
- **Node is v25.8.1, not an LTS.** STK-TS-01 is waived until 2027-02-01 (see
  `GOVERNANCE.md`); the fix is installing Node 24 LTS and re-running
  `scripts/register-desktop.sh` so Desktop launches the new binary.
- **Git hooks run the gates.** `.git/hooks/` (copied from ASPEC's `_common/githooks`,
  with check scripts vendored into the gitignored `.governance/`): pre-commit runs the
  staged secret scan + `scripts/lint.sh`; pre-push runs `scripts/test.sh` + the coverage
  ratchet. Run the scripts yourself when iterating.
- **This repo is public** (github.com/pace551/obsidian-brain, BSL 1.1 — see `LICENSE`).
  Nothing personal beyond the vault path and area slugs belongs in tracked files.
