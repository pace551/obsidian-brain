/**
 * Editing an existing note in place. `applyEdits` is pure text-in/text-out so the
 * formatting guarantees (untouched bytes stay untouched) are checked exactly;
 * `updateNote` adds the vault rules — only `source: claude` notes, and only when the
 * caller's content hash still matches the file.
 */

import { readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { applyEdits, contentHash, updateNote } from "../src/edit.js";
import { makeVault, noteContent } from "./helpers/vault.js";
import type { TestVault } from "./helpers/vault.js";

const BASE = noteContent({
  title: "Victron MPPT charge profile",
  areas: ["van"],
  tags: ["victron"],
  summary: "Original summary.",
  learnings: ["First learning.", "Second learning."],
  resume: "I was tuning the charger.",
  context: "Came up on a trip.",
});

describe("applyEdits — sections", () => {
  test("replaces the Summary and leaves every other byte alone", () => {
    const edited = applyEdits(BASE, { summary: "New summary.\nSecond line." });
    expect(edited).toBe(BASE.replace("Original summary.", "New summary.\nSecond line."));
  });

  test("replaces the Context at the end of the file", () => {
    const edited = applyEdits(BASE, { context: "Came up at home." });
    expect(edited).toBe(BASE.replace("Came up on a trip.", "Came up at home."));
    expect(edited.endsWith("Came up at home.\n")).toBe(true);
  });

  test("keeps the Resume Prompt's paste hint when replacing it", () => {
    const edited = applyEdits(BASE, { resume_prompt: "I finished tuning." });
    expect(edited).toBe(BASE.replace("I was tuning the charger.", "I finished tuning."));
    expect(edited).toContain("> Paste into a new Claude session to continue.");
  });

  test("appends key learnings after the existing bullets", () => {
    const edited = applyEdits(BASE, { add_key_learnings: ["Third learning."] });
    expect(edited).toBe(
      BASE.replace("- Second learning.\n", "- Second learning.\n- Third learning.\n"),
    );
  });

  test("replaces the key learnings list wholesale", () => {
    const edited = applyEdits(BASE, { key_learnings: ["Only learning."] });
    expect(edited).toBe(
      BASE.replace("- First learning.\n- Second learning.\n", "- Only learning.\n"),
    );
  });

  test("creates Ideas / Follow-ups before the Resume Prompt when adding the first idea", () => {
    const edited = applyEdits(BASE, { add_ideas: ["Try a lower float voltage."] });
    expect(edited).toBe(
      BASE.replace(
        "## Resume Prompt",
        "## Ideas / Follow-ups\n\n- Try a lower float voltage.\n\n## Resume Prompt",
      ),
    );
  });

  test("appends to an existing Ideas section", () => {
    const withIdeas = applyEdits(BASE, { ideas: ["One."] });
    const edited = applyEdits(withIdeas, { add_ideas: ["Two."] });
    expect(edited).toContain(
      "## Ideas / Follow-ups\n\n- One.\n- Two.\n\n## Resume Prompt",
    );
  });

  test("replaces an existing Ideas list", () => {
    const withIdeas = applyEdits(BASE, { ideas: ["One.", "Two."] });
    expect(applyEdits(withIdeas, { ideas: ["Three."] })).toBe(
      applyEdits(BASE, { ideas: ["Three."] }),
    );
  });

  test("adds Ideas at the end of a note with no Resume Prompt or Context", () => {
    const short = BASE.slice(0, BASE.indexOf("## Resume Prompt"));
    expect(applyEdits(short, { add_ideas: ["Later."] })).toBe(
      `${short}## Ideas / Follow-ups\n\n- Later.\n`,
    );
  });

  test("an empty ideas list removes the section entirely", () => {
    const withIdeas = applyEdits(BASE, { ideas: ["One."] });
    expect(applyEdits(withIdeas, { ideas: [] })).toBe(BASE);
  });

  test("setting ideas to empty on a note without them is a no-op", () => {
    expect(applyEdits(BASE, { ideas: [] })).toBe(BASE);
  });

  test("leaves sections it does not model untouched", () => {
    const custom = BASE.replace(
      "## Context",
      "## My own notes\n\nHand-written, keep me.\n\n## Context",
    );
    const edited = applyEdits(custom, { summary: "Changed." });
    expect(edited).toContain("## My own notes\n\nHand-written, keep me.\n\n## Context");
  });

  test("rewrites the H1 title and nothing else", () => {
    const edited = applyEdits(BASE, { title: "  Victron   MPPT\nprofile v2 " });
    expect(edited).toBe(
      BASE.replace("# Victron MPPT charge profile", "# Victron MPPT profile v2"),
    );
  });

  test("refuses a section value that would inject a heading", () => {
    expect(() => applyEdits(BASE, { summary: "Fine.\n## Context\nHijack." })).toThrow(
      /heading/u,
    );
    expect(() => applyEdits(BASE, { add_key_learnings: ["# Title"] })).toThrow(
      /heading/u,
    );
  });

  test("reports a section the note does not have", () => {
    const noContext = BASE.slice(0, BASE.indexOf("## Context"));
    expect(() => applyEdits(noContext, { context: "x" })).toThrow(
      /no "Context" section/u,
    );
  });
});

describe("applyEdits — frontmatter", () => {
  test("replaces block-list areas and tags", () => {
    const edited = applyEdits(BASE, { areas: ["van", "diy"], tags: ["solar", "mppt"] });
    expect(edited).toContain(
      "areas:\n  - van\n  - diy\ntags:\n  - solar\n  - mppt\nsource:",
    );
  });

  test("replaces inline-list tags and writes an empty list as []", () => {
    const inline = BASE.replace("tags:\n  - victron", "tags: [victron, solar]");
    expect(applyEdits(inline, { tags: [] })).toBe(
      BASE.replace("tags:\n  - victron", "tags: []"),
    );
  });

  test("replaces type and status scalars", () => {
    const edited = applyEdits(BASE, { type: "how-to", status: "processed" });
    expect(edited).toBe(
      BASE.replace("type: learning", "type: how-to").replace(
        "status: inbox",
        "status: processed",
      ),
    );
  });

  test("inserts a key the frontmatter is missing, before the closing fence", () => {
    const noStatus = BASE.replace("status: inbox\n", "");
    expect(applyEdits(noStatus, { status: "inbox" })).toBe(
      noStatus.replace("source: claude\n---", "source: claude\nstatus: inbox\n---"),
    );
  });

  test("keeps frontmatter keys it does not model", () => {
    const extra = BASE.replace("source: claude", "source: claude\nrelated: [[Other]]");
    expect(applyEdits(extra, { type: "idea" })).toContain("related: [[Other]]");
  });

  test("preserves CRLF line endings", () => {
    const crlf = BASE.replace(/\n/gu, "\r\n");
    const edited = applyEdits(crlf, { summary: "New.", tags: ["a"] });
    expect(edited).toBe(
      BASE.replace("Original summary.", "New.")
        .replace("tags:\n  - victron", "tags:\n  - a")
        .replace(/\n/gu, "\r\n"),
    );
  });

  test("refuses replace and append of the same list together", () => {
    expect(() =>
      applyEdits(BASE, { key_learnings: ["a"], add_key_learnings: ["b"] }),
    ).toThrow(/not both/u);
    expect(() => applyEdits(BASE, { ideas: ["a"], add_ideas: ["b"] })).toThrow(
      /not both/u,
    );
  });

  test("refuses frontmatter edits on a note without frontmatter", () => {
    expect(() => applyEdits("# Bare\n", { type: "idea" })).toThrow(/no frontmatter/u);
  });

  test("refuses an empty edit", () => {
    expect(() => applyEdits(BASE, {})).toThrow(/nothing to update/u);
  });
});

describe("updateNote", () => {
  let vault: TestVault | null = null;
  const PATH = "Areas/van/2026-01-01 victron.md";

  afterEach(async () => {
    await vault?.cleanup();
    vault = null;
  });

  test("writes the edit anywhere in the vault and returns the new hash", async () => {
    vault = await makeVault([{ path: PATH, content: BASE }]);
    const result = await updateNote(await realpath(vault.root), PATH, contentHash(BASE), {
      summary: "Updated.",
    });

    const onDisk = await readFile(join(vault.root, PATH), "utf8");
    expect(onDisk).toBe(BASE.replace("Original summary.", "Updated."));
    expect(result).toEqual({ path: PATH, hash: contentHash(onDisk) });
  });

  test("refuses when the note changed since it was read", async () => {
    vault = await makeVault([{ path: PATH, content: BASE }]);
    const stale = contentHash(BASE);
    await writeFile(join(vault.root, PATH), BASE.replace("Original", "Hand-edited"));

    await expect(
      updateNote(await realpath(vault.root), PATH, stale, { summary: "x" }),
    ).rejects.toThrow(/changed since it was read/u);
    expect(await readFile(join(vault.root, PATH), "utf8")).toContain("Hand-edited");
  });

  test.each([
    ["a hand-written note", BASE.replace("source: claude", "source: me")],
    ["a note without frontmatter", "# Just a note\n\nNo frontmatter here.\n"],
  ])("refuses %s", async (_label, content) => {
    vault = await makeVault([{ path: PATH, content }]);
    await expect(
      updateNote(await realpath(vault.root), PATH, contentHash(content), {
        summary: "x",
      }),
    ).rejects.toThrow(/only notes with source: claude/u);
    expect(await readFile(join(vault.root, PATH), "utf8")).toBe(content);
  });

  test("goes through the vault path rules", async () => {
    vault = await makeVault();
    await expect(
      updateNote(await realpath(vault.root), "../outside.md", "0".repeat(64), {
        summary: "x",
      }),
    ).rejects.toThrow(/traverse upward/u);
  });

  test("edits a symlinked note in place without replacing the link", async () => {
    vault = await makeVault([{ path: PATH, content: BASE }]);
    await symlink(join(vault.root, PATH), join(vault.root, "Inbox/link.md"));

    await updateNote(await realpath(vault.root), "Inbox/link.md", contentHash(BASE), {
      context: "Via link.",
    });
    expect(await readFile(join(vault.root, PATH), "utf8")).toContain("Via link.");
  });
});
