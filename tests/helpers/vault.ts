/**
 * Test vault factory. Tests build the vault they need in a temp directory rather than
 * sharing one mutable fixture, and set mtimes explicitly — recency ranking must not
 * depend on checkout order or wall-clock timing (TST-FIXTURES-02, -04).
 */

import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface NoteSpec {
  /** Vault-relative path, e.g. `Inbox/2026-08-05 victron-mppt.md`. */
  path: string;
  content: string;
  /** Modification time in ms. Defaults to a fixed epoch so ordering is explicit. */
  mtimeMs?: number;
}

export const BASE_TIME = Date.UTC(2026, 0, 1);
export const DAY = 86_400_000;

export interface NoteFields {
  title?: string;
  date?: string;
  type?: string;
  areas?: string[];
  tags?: string[];
  summary?: string;
  learnings?: string[];
  resume?: string;
  context?: string;
  /** Extra frontmatter keys, for exercising the "other frontmatter" scoring zone. */
  extra?: Record<string, string>;
}

/** Build a well-formed note body; every field has a boring default to override. */
export function noteContent(fields: NoteFields = {}): string {
  const {
    title = "Untitled capture",
    date = "2026-01-01",
    type = "learning",
    areas = ["general"],
    tags = [],
    summary = "A capture with nothing special in it.",
    learnings = ["Something was learned."],
    resume = "I was doing a thing. Pick up from the next thing.",
    context = "It came up while testing.",
    extra = {},
  } = fields;

  const list = (key: string, values: string[]): string =>
    [`${key}:`, ...values.map((v) => `  - ${v}`)].join("\n");

  return [
    "---",
    `date: ${date}`,
    `type: ${type}`,
    list("areas", areas),
    list("tags", tags),
    "source: claude",
    "status: inbox",
    ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`),
    "---",
    "",
    `# ${title}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Key Learnings",
    "",
    ...learnings.map((l) => `- ${l}`),
    "",
    "## Resume Prompt",
    "",
    "> Paste into a new Claude session to continue.",
    "",
    resume,
    "",
    "## Context",
    "",
    context,
    "",
  ].join("\n");
}

export interface TestVault {
  root: string;
  cleanup: () => Promise<void>;
}

/** Create a temp vault containing exactly the given notes. */
export async function makeVault(notes: NoteSpec[] = []): Promise<TestVault> {
  const root = await mkdtemp(join(tmpdir(), "obsidian-brain-test-"));
  for (const dir of ["Inbox", "Areas", "Resources", "Archive"]) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const note of notes) {
    const absolute = join(root, note.path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, note.content, "utf8");
    const seconds = (note.mtimeMs ?? BASE_TIME) / 1000;
    await utimes(absolute, seconds, seconds);
  }
  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
