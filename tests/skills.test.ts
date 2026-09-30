/**
 * The skills are prose, so nothing type-checks them. These tests are the substitute:
 * the taxonomy the SKILL.md files tell Claude to use must match the enums the server
 * actually enforces, or a capture fails at the tool boundary with the user watching.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { AREAS, NOTE_TYPES } from "../src/schema.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIRS = ["skills", "skills-desktop"] as const;

async function skillFiles(): Promise<{ id: string; path: string; text: string }[]> {
  const files: { id: string; path: string; text: string }[] = [];
  for (const dir of SKILL_DIRS) {
    for (const name of (await readdir(join(REPO_ROOT, dir))).sort()) {
      const path = join(REPO_ROOT, dir, name, "SKILL.md");
      files.push({ id: `${dir}/${name}`, path, text: await readFile(path, "utf8") });
    }
  }
  return files;
}

const FILES = await skillFiles();

/**
 * Backticked values on the line introducing an enum, taken from after the introducing
 * phrase so the field's own name (`areas` — one or more from: …) isn't counted.
 */
function enumeratedAfter(text: string, marker: RegExp): string[] | null {
  for (const line of text.split("\n")) {
    const match = marker.exec(line);
    if (match === null) continue;
    const tail = line.slice(match.index + match[0].length);
    const values = [...tail.matchAll(/`([a-z][a-z-]*)`/gu)].map((m) => m[1] ?? "");
    if (values.length > 0) return values;
  }
  return null;
}

const AREA_MARKER = /(one or more from:|areas are)/iu;
const TYPE_MARKER = /one of:?/iu;

describe("skill inventory", () => {
  test("both variants exist for both skills", () => {
    expect(FILES.map((f) => f.id)).toEqual([
      "skills/obsidian-capture",
      "skills/obsidian-recall",
      "skills-desktop/obsidian-capture",
      "skills-desktop/obsidian-recall",
    ]);
  });

  test.each(FILES)("$id has frontmatter with a name and description", ({ text }) => {
    expect(text.startsWith("---\n")).toBe(true);
    const frontmatter = text.slice(4, text.indexOf("\n---", 3));
    expect(frontmatter).toMatch(/^name:\s*obsidian-(capture|recall)$/mu);
    expect(frontmatter).toMatch(/^description:\s*\S/mu);
  });

  test.each(FILES)(
    "$id names the skill consistently with its directory",
    ({ id, text }) => {
      const expected = id.split("/")[1];
      expect(text).toMatch(new RegExp(`^name:\\s*${expected ?? ""}$`, "mu"));
    },
  );
});

describe("taxonomy stays in sync with the server enums", () => {
  test.each(FILES)("$id lists every area, or none at all", ({ text }) => {
    const listed = enumeratedAfter(text, AREA_MARKER);
    if (listed === null) return; // A skill that never enumerates areas is fine.
    expect(listed).toEqual([...AREAS]);
  });

  test.each(FILES)("$id lists every note type, or none at all", ({ text }) => {
    const listed = enumeratedAfter(text, TYPE_MARKER);
    if (listed === null) return;
    expect(listed).toEqual([...NOTE_TYPES]);
  });

  test("at least one variant of each skill actually enumerates the taxonomy", () => {
    const enumerating = FILES.filter(
      (f) => enumeratedAfter(f.text, AREA_MARKER) !== null,
    );
    expect(enumerating.map((f) => f.id)).toEqual([
      "skills/obsidian-capture",
      "skills-desktop/obsidian-capture",
      "skills-desktop/obsidian-recall",
    ]);
  });
});

describe("variants target the right interface", () => {
  test.each(FILES.filter((f) => f.id.startsWith("skills-desktop/")))(
    "$id drives the MCP tools, not the filesystem",
    ({ text }) => {
      expect(text).toContain("obsidian-brain");
      expect(text).toMatch(/`(capture_note|search_notes)`/u);
      // Mentioning that ripgrep is unavailable is fine; instructing its use is not.
      expect(text).not.toMatch(/\brg -|Write tool|Read tool/u);
    },
  );

  test.each(FILES.filter((f) => f.id.startsWith("skills/")))(
    "$id uses direct vault access",
    ({ text }) => {
      expect(text).toContain("~/Documents/Obsidian/Personal");
    },
  );
});
