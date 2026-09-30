/** Where the vault lives and which parts of it this server is allowed to touch. */

import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/** Directory (vault-relative) that `capture_note` is allowed to write to. */
export const INBOX_DIR = "Inbox";

/** Top-level directories scanned by search/recent. Everything else is invisible. */
export const SEARCH_DIRS = ["Inbox", "Areas", "Resources", "Archive"] as const;

/** Directory names never descended into, at any depth. */
export const SKIP_DIRS = new Set([
  "Templates",
  ".obsidian",
  ".trash",
  ".git",
  "node_modules",
]);

const DEFAULT_VAULT = ["Documents", "Obsidian", "Personal"];

/**
 * Resolve the vault root: `$OBSIDIAN_VAULT_ROOT` when set, else
 * `~/Documents/Obsidian/Personal`. A leading `~/` is expanded. The path is not
 * required to exist here — {@link vault.assertVaultRoot} checks that at call time so
 * a mistyped config surfaces as a tool error rather than a silent server crash.
 */
export function resolveVaultRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env["OBSIDIAN_VAULT_ROOT"]?.trim();
  if (raw !== undefined && raw !== "") {
    const expanded = raw.startsWith("~/") ? resolve(homedir(), raw.slice(2)) : raw;
    if (!isAbsolute(expanded)) {
      throw new Error(
        `OBSIDIAN_VAULT_ROOT must be an absolute path (got ${JSON.stringify(raw)})`,
      );
    }
    return resolve(expanded);
  }
  return resolve(homedir(), ...DEFAULT_VAULT);
}
