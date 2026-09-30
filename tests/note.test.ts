import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  noteFilename,
  normalizeTitle,
  renderNote,
  slugify,
  today,
  writeNoteAtomic,
} from "../src/note.js";
import type { CaptureNoteInput } from "../src/schema.js";

function capture(overrides: Partial<CaptureNoteInput> = {}): CaptureNoteInput {
  return {
    title: "Victron MPPT charge profile for the lithium bank",
    type: "how-to",
    areas: ["van"],
    tags: ["victron", "mppt"],
    summary: "Worked out absorption voltage and tail current.",
    key_learnings: ["Absorption at 14.4 V", "Tail current 5 A"],
    ideas: [],
    resume_prompt: "I was setting the MPPT profile for a 200 Ah bank.",
    context: "The batteries were getting warm.",
    ...overrides,
  };
}

describe("slugify", () => {
  test("lowercases, hyphenates, and caps at six words", () => {
    expect(slugify("Victron MPPT charge profile for the lithium bank")).toBe(
      "victron-mppt-charge-profile-for-the",
    );
  });

  test("folds diacritics and drops punctuation", () => {
    expect(slugify("Café façade — notes (v2)!")).toBe("cafe-facade-notes-v2");
  });

  test("falls back rather than producing an empty slug", () => {
    expect(slugify("!!! ???")).toBe("note");
  });
});

describe("normalizeTitle", () => {
  test("collapses whitespace so a title cannot break out of its heading", () => {
    expect(normalizeTitle("  a\n\n## injected  heading ")).toBe("a ## injected heading");
  });
});

describe("today", () => {
  test("formats local-time YYYY-MM-DD with zero padding", () => {
    expect(today(new Date(2026, 7, 5, 13, 30))).toBe("2026-08-05");
    expect(today(new Date(2026, 0, 9, 0, 0))).toBe("2026-01-09");
  });
});

describe("renderNote", () => {
  test("emits the vault's frontmatter and section layout", () => {
    const rendered = renderNote(capture(), "2026-08-05");
    expect(rendered).toBe(
      [
        "---",
        "date: 2026-08-05",
        "type: how-to",
        "areas:",
        "  - van",
        "tags:",
        "  - victron",
        "  - mppt",
        "source: claude",
        "status: inbox",
        "---",
        "",
        "# Victron MPPT charge profile for the lithium bank",
        "",
        "## Summary",
        "",
        "Worked out absorption voltage and tail current.",
        "",
        "## Key Learnings",
        "",
        "- Absorption at 14.4 V",
        "- Tail current 5 A",
        "",
        "## Resume Prompt",
        "",
        "> Paste into a new Claude session to continue.",
        "",
        "I was setting the MPPT profile for a 200 Ah bank.",
        "",
        "## Context",
        "",
        "The batteries were getting warm.",
        "",
      ].join("\n"),
    );
  });

  test("omits Ideas / Follow-ups when there is nothing to list", () => {
    expect(renderNote(capture({ ideas: [] }), "2026-08-05")).not.toContain("Ideas");
  });

  test("includes Ideas / Follow-ups before the Resume Prompt when present", () => {
    const rendered = renderNote(
      capture({ ideas: ["Check the BMS logs", "Ask about tail current"] }),
      "2026-08-05",
    );
    expect(rendered).toContain(
      "## Ideas / Follow-ups\n\n- Check the BMS logs\n- Ask about tail current",
    );
    expect(rendered.indexOf("## Ideas")).toBeLessThan(
      rendered.indexOf("## Resume Prompt"),
    );
  });

  test("renders an empty tag list as [] rather than a null key", () => {
    const rendered = renderNote(capture({ tags: [] }), "2026-08-05");
    expect(rendered).toContain("tags: []");
  });

  test("renders multiple areas as a YAML block list", () => {
    expect(renderNote(capture({ areas: ["van", "homestead"] }), "2026-08-05")).toContain(
      "areas:\n  - van\n  - homestead",
    );
  });
});

describe("noteFilename", () => {
  test("first attempt has no suffix; later attempts count up", () => {
    expect(noteFilename("2026-08-05", "solar", 1)).toBe("2026-08-05 solar.md");
    expect(noteFilename("2026-08-05", "solar", 2)).toBe("2026-08-05 solar-2.md");
    expect(noteFilename("2026-08-05", "solar", 3)).toBe("2026-08-05 solar-3.md");
  });
});

describe("writeNoteAtomic", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "obsidian-brain-write-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("writes the note and returns its filename and absolute path", async () => {
    const written = await writeNoteAtomic(dir, "2026-08-05", "solar", "body\n");
    expect(written.filename).toBe("2026-08-05 solar.md");
    expect(written.path).toBe(join(dir, "2026-08-05 solar.md"));
    await expect(readFile(written.path, "utf8")).resolves.toBe("body\n");
  });

  test("never overwrites — a repeat capture gets -2, then -3", async () => {
    await writeNoteAtomic(dir, "2026-08-05", "solar", "first\n");
    const second = await writeNoteAtomic(dir, "2026-08-05", "solar", "second\n");
    const third = await writeNoteAtomic(dir, "2026-08-05", "solar", "third\n");

    expect(second.filename).toBe("2026-08-05 solar-2.md");
    expect(third.filename).toBe("2026-08-05 solar-3.md");
    await expect(readFile(join(dir, "2026-08-05 solar.md"), "utf8")).resolves.toBe(
      "first\n",
    );
  });

  test("leaves no temp file behind", async () => {
    await writeNoteAtomic(dir, "2026-08-05", "solar", "body\n");
    const entries = await readdir(dir);
    expect(entries).toEqual(["2026-08-05 solar.md"]);
  });

  test("creates the target directory when the vault lacks it", async () => {
    const nested = join(dir, "Inbox");
    const written = await writeNoteAtomic(nested, "2026-08-05", "solar", "body\n");
    await expect(readFile(written.path, "utf8")).resolves.toBe("body\n");
  });

  test("concurrent captures of the same slug all survive", async () => {
    const writes = await Promise.all(
      [1, 2, 3, 4].map(async (n) =>
        writeNoteAtomic(dir, "2026-08-05", "solar", `body ${String(n)}\n`),
      ),
    );
    const names = writes.map((w) => w.filename).sort();
    expect(new Set(names).size).toBe(4);
    expect((await readdir(dir)).sort()).toEqual(names);
  });
});
