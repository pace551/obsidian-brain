import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { INBOX_DIR, resolveVaultRoot, SEARCH_DIRS, SKIP_DIRS } from "../src/config.js";

describe("resolveVaultRoot", () => {
  test("defaults to the PARA vault under the home directory", () => {
    expect(resolveVaultRoot({})).toBe(join(homedir(), "Documents/Obsidian/Personal"));
  });

  test("treats an empty or whitespace-only env var as unset", () => {
    expect(resolveVaultRoot({ OBSIDIAN_VAULT_ROOT: "   " })).toBe(
      join(homedir(), "Documents/Obsidian/Personal"),
    );
  });

  test("honors an absolute override", () => {
    expect(resolveVaultRoot({ OBSIDIAN_VAULT_ROOT: "/vaults/personal" })).toBe(
      "/vaults/personal",
    );
  });

  test("normalizes a trailing slash and redundant segments", () => {
    expect(resolveVaultRoot({ OBSIDIAN_VAULT_ROOT: "/vaults/./personal/" })).toBe(
      "/vaults/personal",
    );
  });

  test("expands a leading ~/", () => {
    expect(resolveVaultRoot({ OBSIDIAN_VAULT_ROOT: "~/Vaults/Personal" })).toBe(
      join(homedir(), "Vaults/Personal"),
    );
  });

  test("rejects a relative override rather than resolving it against the cwd", () => {
    // The server's cwd is whatever launched it — a relative vault path is never intended.
    expect(() => resolveVaultRoot({ OBSIDIAN_VAULT_ROOT: "Documents/Obsidian" })).toThrow(
      /absolute/u,
    );
  });
});

describe("vault layout constants", () => {
  test("captures land in Inbox and searches cover the PARA folders", () => {
    expect(INBOX_DIR).toBe("Inbox");
    expect([...SEARCH_DIRS]).toEqual(["Inbox", "Areas", "Resources", "Archive"]);
  });

  test("Templates and Obsidian's own config are never scanned", () => {
    expect(SKIP_DIRS.has("Templates")).toBe(true);
    expect(SKIP_DIRS.has(".obsidian")).toBe(true);
  });
});
