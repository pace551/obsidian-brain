# Governance Manifest

```yaml
tier: T1
classified: 2026-09-30
tier_override: null
stacks: [typescript]
standards:
  - { id: AI-ARCH, version: 1.0.0 }
  - { id: AI-MODELS, version: 1.0.0 }
  - { id: AI-SECURITY, version: 1.0.0 }
  - { id: DEV-BOOTSTRAP, version: 1.0.0 }
  - { id: DEV-DEPS, version: 1.0.0 }
  - { id: DEV-GIT, version: 1.0.0 }
  - { id: LEG-LICENSING, version: 1.0.0 }
  - { id: OPS-DEPLOY, version: 1.0.0 }
  - { id: OPS-FINOPS, version: 1.0.0 }
  - { id: OPS-RELEASE, version: 1.0.0 }
  - { id: SEC-INPUT, version: 1.0.0 }
  - { id: SEC-SECRETS, version: 1.0.1 }
  - { id: STK-TS, version: 1.0.0 }
  - { id: TST-FIXTURES, version: 1.0.0 }
  - { id: TST-POLICY, version: 1.0.0 }
  - { id: TST-VERIFY, version: 1.0.0 }
waivers:
  - rule_id: STK-TS-01
    reason: >
      Machine runs Node v25.8.1 (non-LTS) as the only installed runtime at
      /usr/local/bin/node. The project is ESM-only and satisfies the rest of the rule;
      only the LTS pin is deferred. Blast radius is one local stdio process with no
      network listener. Unblocked by installing Node 24 LTS and re-running
      scripts/register-desktop.sh so Desktop launches the new binary.
    expires: 2027-02-01
    granted: 2026-08-05
    granted_by: James
external_action_approvals:
  - action: >
      Publish this project's source as the public GitHub repo pace551/obsidian-brain
      (gh repo create --public, git push to it). Covers future pushes to that repo;
      does not cover npm publication or any hosted deployment.
    granted: 2026-09-30
pii_inventory: n/a
last_verified: 2026-09-30
attestations:
  # --- Published-package carve-out (tiers.md): supply-chain families at T3 weight
  - {rule_id: LEG-LICENSING-02, followed: true, note: "No copyleft adopted: node_modules audit on 2026-09-30 found only MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak-1.0.0, and Python-2.0 (argparse, permissive)", date: 2026-09-30}
  - {rule_id: LEG-LICENSING-03, followed: true, note: "LICENSE (BSL 1.1) at the repo root, see DEV-BOOTSTRAP-08", date: 2026-09-30}
  - {rule_id: DEV-DEPS-01, followed: true, note: "package-lock.json is tracked", date: 2026-09-30}
  - {rule_id: DEV-DEPS-04, followed: true, note: "n/a — no dependency added at the split", date: 2026-09-30}
  - {rule_id: DEV-DEPS-03, followed: true, note: "Only in-range transitive bumps applied (npm audit fix, no --force). The vitest fix needs a major bump and was deliberately not taken; 3 moderate dev-only advisories remain (GHSA-82fw-gwwq-j7x9 via vitest/@vitest/mocker/@vitest/coverage-v8)", date: 2026-09-30}
  - {rule_id: DEV-DEPS-05, followed: true, note: "Advisory and license facts came from live npm audit and installed package.json metadata at time of use", date: 2026-09-30}
  - {rule_id: DEV-DEPS-06, followed: true, note: "n/a — no fast-moving tooling (no AI SDK or model ID); the MCP SDK is the nearest and was not changed", date: 2026-09-30}
  # --- AI: this project ships no prompts and calls no model. It is an MCP server that
  # an LLM calls, so the AI-* family is answered from the tool-surface side.
  - {rule_id: AI-ARCH-01, followed: false, note: "n/a — no prompts in this project; the SKILL.md files are the closest thing and they are version-controlled here", date: 2026-08-05}
  - {rule_id: AI-MODELS-01, followed: false, note: "n/a — no model is selected or called by this project", date: 2026-08-05}
  - {rule_id: AI-MODELS-02, followed: false, note: "n/a — no model selection", date: 2026-08-05}
  - {rule_id: AI-MODELS-03, followed: false, note: "n/a — no model selection", date: 2026-08-05}
  - {rule_id: AI-SECURITY-01, followed: true, note: "Note content is untrusted: titles are whitespace-collapsed before becoming headings, tags/areas/slugs are regex- or enum-constrained, and vault notes are parsed as data (frontmatter + sections), never executed", date: 2026-08-05}
  - {rule_id: AI-SECURITY-02, followed: true, note: "Least-privilege by construction: 3 of 4 tools are read-only, writes are confined to Inbox/, no overwrite, and there is no delete, edit, or move tool", date: 2026-08-05}
  - {rule_id: AI-SECURITY-03, followed: true, note: "No eval and no HTML rendering; model-supplied fields are written as markdown text only", date: 2026-08-05}
  - {rule_id: AI-SECURITY-04, followed: true, note: "No secrets exist in this project", date: 2026-08-05}
  - {rule_id: DEV-BOOTSTRAP-08, followed: true, note: "LICENSE (BSL 1.1, Change License MIT, Change Date 2029-09-30 — same terms as ASPEC, parameters adapted) added in the initial commit, before the public push; package.json license set to BUSL-1.1", date: 2026-09-30}
  - {rule_id: DEV-GIT-02, followed: true, note: "Fresh repo, single initial commit (user chose a clean history over a subtree split). It bundles the prior tree, the 2026-09-23 'work' area change, the license, and the publication re-governance — one logical event, publication", date: 2026-09-30}
  - {rule_id: DEV-GIT-07, followed: true, note: "Initial commit message describes the change; only the standard Co-Authored-By and Claude-Session trailers reference tooling", date: 2026-09-30}
  - {rule_id: OPS-DEPLOY-04, followed: true, note: "Deployment is scripts/register-desktop.sh (Desktop config) and scripts/deploy-skills.sh / build-desktop-skills.sh (skills) — no memorized sequences", date: 2026-08-05}
  - {rule_id: OPS-FINOPS-01, followed: false, note: "n/a — nothing is deployed and nothing can bill; no cloud resources", date: 2026-08-05}
  - {rule_id: OPS-FINOPS-02, followed: false, note: "n/a — this project makes no LLM API calls", date: 2026-08-05}
  - {rule_id: OPS-FINOPS-04, followed: false, note: "n/a — no billing for this project", date: 2026-08-05}
  - {rule_id: OPS-FINOPS-05, followed: true, note: "Runs as a local stdio child process; zero infrastructure", date: 2026-08-05}
  - {rule_id: OPS-RELEASE-01, followed: false, note: "Now public, so others can consume it, but no semver tag cut yet; 0.1.0 in package.json. A v0.1.0 tag is a fair follow-on, not blocking at T1", date: 2026-09-30}
  - {rule_id: SEC-INPUT-01, followed: true, note: "Every tool input crosses a zod schema at the MCP boundary (src/schema.ts); rejection verified over the wire in tests/e2e.test.ts and by hand via the MCP inspector", date: 2026-08-05}
  - {rule_id: SEC-INPUT-04, followed: true, note: "src/vault.ts resolveNotePath is the only path join: rejects absolute paths, .., NUL, non-.md, and anything resolving outside realpath(vaultRoot) including via symlink. Covered by tests/vault.test.ts and exercised over stdio", date: 2026-08-05}
  - {rule_id: SEC-SECRETS-03, followed: false, note: "n/a — the project holds no credentials; OBSIDIAN_VAULT_ROOT is a path", date: 2026-08-05}
  - {rule_id: SEC-SECRETS-04, followed: true, note: "No secrets exist; tool errors return only the caller-supplied relative path, never absolute filesystem paths", date: 2026-08-05}
  - {rule_id: SEC-SECRETS-05, followed: false, note: "n/a — no secret has ever existed in this project. The trexis fake-key hits from the home repo are not in this repo's fresh history; gitleaks dir scan on 2026-09-30 found no leaks", date: 2026-09-30}
  - {rule_id: STK-TS-06, followed: true, note: "All four tools declare zod input schemas; OBSIDIAN_VAULT_ROOT is validated in src/config.ts (absolute-path check) and the vault root is realpath-checked before use", date: 2026-08-05}
  - {rule_id: STK-TS-07, followed: true, note: "No dependency added. npm audit fix (no --force) bumped transitive versions within existing ranges only", date: 2026-09-30}
  - {rule_id: STK-TS-08, followed: true, note: "scripts/*.sh and package.json use node_modules/.bin paths; the one npx use is the MCP inspector in the optional `inspect` script", date: 2026-08-05}
  - {rule_id: TST-FIXTURES-01, followed: true, note: "Fixtures are invented notes (no production data, no PII, no secrets real or fake). The home-repo .gitleaksignore symlink was dropped at the split: its entries were fingerprints for trexis commits that are not in this repo's fresh history", date: 2026-09-30}
  - {rule_id: TST-FIXTURES-02, followed: true, note: "Deterministic: fixture mtimes are set explicitly via utimes from a fixed BASE_TIME, searchNotes takes an injectable `now`, and no test depends on wall-clock or ordering", date: 2026-08-05}
  - {rule_id: TST-FIXTURES-03, followed: true, note: "No network calls; the stdio e2e test spawns a local child process only", date: 2026-08-05}
  - {rule_id: TST-FIXTURES-04, followed: true, note: "tests/helpers/vault.ts is a factory (makeVault + noteContent with per-test overrides); the committed tests/fixtures/vault is a read-only parser corpus, never mutated", date: 2026-08-05}
  - {rule_id: TST-FIXTURES-05, followed: false, note: "n/a — no test flaked in this session", date: 2026-08-05}
  - {rule_id: TST-POLICY-01, followed: false, note: "n/a — no bugfix in this changeset; relocation, license, docs, and in-range lockfile security bumps only", date: 2026-09-30}
  - {rule_id: TST-POLICY-02, followed: false, note: "n/a — no new logic in this changeset", date: 2026-09-30}
  - {rule_id: TST-POLICY-03, followed: true, note: "Untested lines are src/index.ts's main()/self-start guard (bootstrap glue, exercised in the stdio e2e subprocess where the coverage instrumenter cannot see it) and two unreachable defensive branches", date: 2026-08-05}
  - {rule_id: TST-POLICY-05, followed: true, note: "No percentage target anywhere; .coverage-baseline (97.34) is the ratchet's own file", date: 2026-08-05}
  - {rule_id: TST-VERIFY-01, followed: true, note: "2026-09-30 in order: prettier+eslint (scripts/lint.sh), tsc --noEmit, vitest+coverage 119/119 at the 97.34 baseline, npm run build, deploy:skills + check:skill-drift, build:desktop-skills, npm audit (prod 0 after in-range fix), semgrep SAST (0 findings, 74 rules), gitleaks, stdio smoke test, then /verify-compliance PASS", date: 2026-09-30}
  - {rule_id: TST-VERIFY-02, followed: true, note: "Built dist/index.js at the new path driven over stdio JSON-RPC: initialize, tools/list (4 tools), list_recent against the real vault returned without error. Claude Code MCP re-registered at the new path and reports Connected. Claude Desktop re-registered via register-desktop.sh but its restart is manual and unverified", date: 2026-09-30}
  - {rule_id: TST-VERIFY-03, followed: true, note: "Commands from scripts/lint.sh, scripts/test.sh, CLAUDE.md npm scripts, and the ASPEC checks/ runners; semgrep invoked the way checks/sec-sast.sh does, via uvx since it is not installed", date: 2026-09-30}
  - {rule_id: TST-VERIFY-04, followed: true, note: "Completion summary lists what ran and names the unverified Desktop restart and the dev-only vitest advisory left open", date: 2026-09-30}
```

## Notes

**Why T1.** Classification rubric, top-down: not payment/third-party-PII (line 1), not a
deployed service and nobody but James runs it (line 2), primary output is a tool rather than
an analysis or decision input (line 3) → line 4, Personal. The server speaks MCP over stdio
to a locally-launched process; there is no port, no auth surface, and no data leaves the
machine. Escalation trigger to watch: if the server ever gains an HTTP transport or a second
user, re-run `/govern`.

**Git hooks are installed** in `.git/hooks/`, copied from `_common/githooks` per the
DEV-BOOTSTRAP-06 text (not via `install-git-hooks.sh`, whose `core.hooksPath` layout the
DEV-BOOTSTRAP-06 check does not recognise). The vendored check scripts live in the
gitignored `.governance/`. Until 2026-09-30 they were waived (DEV-BOOTSTRAP-06)
because the project lived inside the `home` monorepo; the split to its own repo resolved
that, and the waiver was closed rather than left to expire.

**No CI.** T1 does not require it.

**Cost:** zero. No paid API, no cloud resource, no recurring spend (OPS-FINOPS satisfied
trivially).

**Secrets:** none. The server holds no credentials; `OBSIDIAN_VAULT_ROOT` is a path, not a
secret, and is supplied by the MCP client config.

### 2026-09-30 re-classification: publication

The project moved out of the private `home` monorepo to `~/Dev/claude-code/obsidian-brain`
and its own **public** GitHub repo, `pace551/obsidian-brain`, with a fresh single-commit
history. Tier stays **T1**: publication adds no deployment and no second runtime user
(rubric line 2). The tiers.md **published library/package carve-out** applies, as it did
for trexis on 2026-08-26, so `LEG-LICENSING` and `DEV-DEPS` are pinned and the license and
dependency-license check happened before the push. Pins were merged with the existing set,
not replaced.

Two waivers closed at the split: **DEV-BOOTSTRAP-06** (hooks now installed) and
**DEV-GIT-01** (the non-conventional sibling commits in `home` are not in this history).

Public commits use the GitHub noreply address, set in this repo's local git config.

