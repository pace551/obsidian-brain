# obsidian-brain

A local MCP server that lets Claude — in **Claude Desktop / claude.ai** as well as Claude
Code — capture sessions into the personal Obsidian vault and recall them later, plus the
version-controlled source for the `obsidian-capture` and `obsidian-recall` skills.

The point of the server is that the note schema is a **tool contract, not a prompt**. An
invented area or a missing Resume Prompt comes back as a validation error instead of a
malformed note nobody notices for six months.

## Tools

| Tool           | Purpose                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `capture_note` | Write a structured note to `Inbox/`. Owns filename, frontmatter, sections. Never overwrites. |
| `search_notes` | Ranked keyword search with area/type/tag/recency filters. Read-only.                         |
| `list_recent`  | The N most recently modified notes. Read-only.                                               |
| `read_note`    | One note by vault-relative path, with frontmatter and sections parsed out. Read-only.        |

Notes land as `Inbox/YYYY-MM-DD <slug>.md`:

```text
---
date: 2026-08-05
type: how-to
areas:
  - van
tags:
  - victron
source: claude
status: inbox
---

# Victron MPPT charge profile for the lithium bank

## Summary
## Key Learnings
## Ideas / Follow-ups     <- omitted entirely when empty
## Resume Prompt
## Context
```

- `type` — one of `learning`, `idea`, `research`, `how-to`, `project-note`
- `areas` — one or more of `van`, `motorcycles`, `cycling`, `sailing`, `automotive`,
  `home-automation`, `homestead`, `spa-rpa`, `ai-learning`, `diy`, `family`, `work`, `general`
- `tags` — freeform, lowercase, hyphenated

Writes go to `Inbox/` and nowhere else. Reads are confined to the vault: absolute paths,
`..`, non-`.md` files, and symlinks pointing outside are all rejected. There is no edit or
delete tool — Obsidian is for that.

## Setup

```bash
npm install
npm run build              # dist/index.js — what Claude Desktop launches
scripts/register-desktop.sh   # backs up and merges into claude_desktop_config.json
```

Then restart Claude Desktop. For the skills:

```bash
npm run deploy:skills          # skills/ -> ~/.claude/skills/  (Claude Code)
npm run build:desktop-skills   # skills-desktop/ -> dist/skills/*.zip
```

Optionally, upload each zip via **Claude Desktop → Settings → Customize → Skills**
(requires code execution). Desktop works without them: the MCP server registered above is
what gives it the vault tools, and it enforces the note schema itself. The skills only add
capture/recall workflow guidance. Uploaded skills are per-user and update by re-uploading.

## The two skill variants

`skills/` and `skills-desktop/` hold the same two skills written for different runtimes:

- **`skills/`** — Claude Code. Uses Read/Write/ripgrep against the vault directly; no
  server needed. `~/.claude/skills/` is a _deployed copy_; edit the repo, not the copy.
  `scripts/check-skill-drift.sh` fails if they diverge.
- **`skills-desktop/`** — Claude Desktop / claude.ai. No filesystem, so these drive the MCP
  tools above.

They share no template on purpose: the invariants that matter (the enums, the note format)
are enforced by the server, and `tests/skills.test.ts` fails if the taxonomy listed in any
SKILL.md drifts from `src/schema.ts`.

## Commands

```bash
scripts/lint.sh                # prettier --check + eslint
scripts/test.sh                # vitest + coverage
npm run typecheck              # tsc --noEmit
npm run inspect                # MCP inspector against a live server
npm run check:skill-drift      # deployed skills vs canonical
```

Configuration is one env var, `OBSIDIAN_VAULT_ROOT` (default
`~/Documents/Obsidian/Personal`), supplied by the MCP client config. No credentials.

Governed at **T1** — see `GOVERNANCE.md`.

## License

[Business Source License 1.1](LICENSE). You may use, modify, and redistribute obsidian-brain
for your own vaults, including for commercial work; offering it to others as a hosted
service is not covered. Each version converts to MIT on 2029-09-30.
