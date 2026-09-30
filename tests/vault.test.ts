import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  assertVaultRoot,
  firstSentence,
  parseNote,
  resolveNotePath,
  VaultError,
  walkVault,
} from "../src/vault.js";
import { makeVault, noteContent } from "./helpers/vault.js";
import type { TestVault } from "./helpers/vault.js";

const FIXTURE_VAULT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "vault");
const VICTRON = "Inbox/2026-03-14 victron-mppt-charge-profile.md";

let vault: TestVault | null = null;

afterEach(async () => {
  await vault?.cleanup();
  vault = null;
});

describe("assertVaultRoot", () => {
  test("returns the canonical root", async () => {
    vault = await makeVault();
    await expect(assertVaultRoot(vault.root)).resolves.toContain("obsidian-brain-test-");
  });

  test("names the env var when the root is missing", async () => {
    await expect(assertVaultRoot("/nope/not/a/vault")).rejects.toThrow(
      /OBSIDIAN_VAULT_ROOT/u,
    );
  });

  test("rejects a file masquerading as the vault root", async () => {
    vault = await makeVault([{ path: "Inbox/a.md", content: "x" }]);
    await expect(assertVaultRoot(join(vault.root, "Inbox/a.md"))).rejects.toThrow(
      /not a directory/u,
    );
  });
});

describe("resolveNotePath", () => {
  test("resolves a vault-relative note", async () => {
    const root = await assertVaultRoot(FIXTURE_VAULT);
    await expect(resolveNotePath(root, VICTRON)).resolves.toBe(join(root, VICTRON));
  });

  test.each([
    ["absolute path", "/etc/hosts"],
    ["absolute path to a real note", "/etc/passwd.md"],
    ["parent traversal", "../../etc/hosts"],
    ["traversal mid-path", "Inbox/../../secrets.md"],
    ["backslash traversal", "Inbox\\..\\..\\secrets.md"],
    ["empty path", "   "],
    ["NUL byte", "Inbox/evil\0.md"],
    ["non-markdown file", "Inbox/.obsidian/workspace.json"],
    ["directory", "Inbox"],
  ])("rejects %s", async (_label, path) => {
    const root = await assertVaultRoot(FIXTURE_VAULT);
    await expect(resolveNotePath(root, path)).rejects.toBeInstanceOf(VaultError);
  });

  test("rejects a note that is a symlink pointing outside the vault", async () => {
    vault = await makeVault();
    const elsewhere = await makeVault([
      { path: "Inbox/secret.md", content: "not yours\n" },
    ]);
    try {
      const root = await assertVaultRoot(vault.root);
      await symlink(
        join(elsewhere.root, "Inbox/secret.md"),
        join(root, "Inbox/escape.md"),
      );

      await expect(resolveNotePath(root, "Inbox/escape.md")).rejects.toThrow(/symlink/u);
    } finally {
      await elsewhere.cleanup();
    }
  });

  test("reports a missing note rather than inventing a path", async () => {
    const root = await assertVaultRoot(FIXTURE_VAULT);
    await expect(resolveNotePath(root, "Inbox/does-not-exist.md")).rejects.toThrow(
      /not found/u,
    );
  });
});

describe("walkVault", () => {
  test("finds notes in the PARA folders and skips Templates and dot-directories", async () => {
    const root = await assertVaultRoot(FIXTURE_VAULT);
    const paths = (await walkVault(root)).map((f) => f.path).sort();

    expect(paths).toEqual([
      "Areas/van/solar-wiring-notes.md",
      "Inbox/2026-03-14 victron-mppt-charge-profile.md",
      "Inbox/2026-04-01 crlf-note.md",
    ]);
  });

  test("tolerates a vault missing some PARA folders", async () => {
    vault = await makeVault([{ path: "Inbox/a.md", content: noteContent() }]);
    const root = await assertVaultRoot(vault.root);
    expect(await walkVault(root)).toHaveLength(1);
  });

  test("ignores non-markdown files and nested Templates directories", async () => {
    vault = await makeVault([
      { path: "Areas/van/note.md", content: noteContent() },
      { path: "Areas/van/photo.png", content: "binary-ish" },
    ]);
    await mkdir(join(vault.root, "Areas/van/Templates"), { recursive: true });
    await writeFile(join(vault.root, "Areas/van/Templates/t.md"), "# t\n", "utf8");

    const root = await assertVaultRoot(vault.root);
    expect((await walkVault(root)).map((f) => f.path)).toEqual(["Areas/van/note.md"]);
  });
});

describe("parseNote", () => {
  test("parses frontmatter, inline lists, quotes, and unknown keys", async () => {
    const raw = await readFile(join(FIXTURE_VAULT, VICTRON), "utf8");
    const note = parseNote(raw, "fallback");

    expect(note.title).toBe("Victron MPPT charge profile for the lithium bank");
    expect(note.frontmatter.date).toBe("2026-03-14");
    expect(note.frontmatter.type).toBe("how-to");
    expect(note.frontmatter.areas).toEqual(["van", "homestead"]);
    expect(note.frontmatter.tags).toEqual(["victron", "mppt", "lithium-battery"]);
    expect(note.frontmatter.source).toBe("claude");
    expect(note.frontmatter.status).toBe("inbox");
    expect(note.frontmatter.extra).toEqual({ custom_key: "kept-as-extra" });
  });

  test("splits sections on ## headings", async () => {
    const raw = await readFile(join(FIXTURE_VAULT, VICTRON), "utf8");
    const note = parseNote(raw, "fallback");

    expect(Object.keys(note.sections)).toEqual([
      "Summary",
      "Key Learnings",
      "Resume Prompt",
      "Context",
    ]);
    expect(note.sections["Key Learnings"]).toBe(
      "- Absorption at 14.4 V, tail current 5 A\n- The MPPT's lithium preset assumes a 100 Ah bank",
    );
    expect(note.sections["Context"]).toBe(
      "The batteries were getting warm on long solar days.",
    );
  });

  test("handles a note with no frontmatter", async () => {
    const raw = await readFile(
      join(FIXTURE_VAULT, "Areas/van/solar-wiring-notes.md"),
      "utf8",
    );
    const note = parseNote(raw, "fallback");

    expect(note.title).toBe("Solar panel wiring — series vs parallel");
    expect(note.frontmatter.areas).toEqual([]);
    expect(note.frontmatter.date).toBeUndefined();
    expect(note.sections["Summary"]).toContain("partial shade");
  });

  test("handles CRLF line endings", async () => {
    const raw = await readFile(
      join(FIXTURE_VAULT, "Inbox/2026-04-01 crlf-note.md"),
      "utf8",
    );
    const note = parseNote(raw, "fallback");

    expect(note.title).toBe("CRLF note from a Windows edit");
    expect(note.frontmatter.areas).toEqual(["spa-rpa"]);
    expect(note.frontmatter.tags).toEqual(["automation"]);
    expect(note.sections["Summary"]).toBe(
      "This note has Windows line endings and must still parse.",
    );
  });

  test("falls back to the supplied title when the note has no H1", () => {
    const note = parseNote(
      "---\ndate: 2026-01-01\n---\n\nJust prose.\n",
      "2026-01-01 orphan",
    );
    expect(note.title).toBe("2026-01-01 orphan");
  });

  test("degrades to no frontmatter on an unterminated block rather than throwing", () => {
    const note = parseNote("---\ndate: 2026-01-01\ntype: idea\n\n# Broken\n", "fallback");
    expect(note.frontmatter.date).toBeUndefined();
    expect(note.title).toBe("Broken");
  });
});

describe("firstSentence", () => {
  test("stops at the first sentence boundary", () => {
    expect(firstSentence("One thing. Two thing. Three.")).toBe("One thing.");
  });

  test("collapses whitespace and returns the whole text when unpunctuated", () => {
    expect(firstSentence("no\n  punctuation here")).toBe("no punctuation here");
  });

  test("truncates with an ellipsis past the limit", () => {
    expect(firstSentence("x".repeat(300))).toHaveLength(160);
    expect(firstSentence("x".repeat(300)).endsWith("…")).toBe(true);
  });

  test("returns empty for empty input", () => {
    expect(firstSentence("   ")).toBe("");
  });
});
