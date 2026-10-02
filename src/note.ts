/** Rendering a capture into the vault's note format, and getting it onto disk safely. */

import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CaptureNoteInput } from "./schema.js";

const MAX_SLUG_WORDS = 6;
const MAX_COLLISION_SUFFIX = 50;

/** Distinguishes concurrent writes within one process; pid distinguishes processes. */
let tempCounter = 0;

/** Collapse any run of whitespace so a title can't smuggle newlines into the heading. */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/gu, " ").trim();
}

/**
 * `"Victron MPPT charge profile for the lithium bank"` → `victron-mppt-charge-profile`.
 * Diacritics are folded, punctuation dropped, and the result capped at six words so
 * filenames stay scannable in Obsidian's file list.
 */
export function slugify(title: string): string {
  const folded = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();
  const words = folded
    .replace(/[^a-z0-9]+/gu, "-")
    .split("-")
    .filter((w) => w !== "");
  const slug = words.slice(0, MAX_SLUG_WORDS).join("-");
  return slug === "" ? "note" : slug;
}

/** Today in the machine's local timezone — the vault is a personal, local artifact. */
export function today(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function yamlList(key: string, values: readonly string[]): string {
  // A bare `tags:` parses as null, which Obsidian's property editor renders as an empty
  // value rather than an empty list. `[]` says what it means.
  if (values.length === 0) return `${key}: []`;
  return [`${key}:`, ...values.map((v) => `  - ${v}`)].join("\n");
}

export function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item.trim()}`).join("\n");
}

/**
 * Render the exact note format the Obsidian skills describe. The `Ideas / Follow-ups`
 * section is omitted entirely when there is nothing to list — an empty section reads as
 * a to-do that was never filled in.
 */
export function renderNote(input: CaptureNoteInput, date: string): string {
  const title = normalizeTitle(input.title);
  const frontmatter = [
    "---",
    `date: ${date}`,
    `type: ${input.type}`,
    yamlList("areas", input.areas),
    yamlList("tags", input.tags),
    "source: claude",
    "status: inbox",
    "---",
  ].join("\n");

  const sections = [
    `# ${title}`,
    "## Summary",
    input.summary.trim(),
    "## Key Learnings",
    bullets(input.key_learnings),
  ];

  if (input.ideas.length > 0) {
    sections.push("## Ideas / Follow-ups", bullets(input.ideas));
  }

  sections.push(
    "## Resume Prompt",
    "> Paste into a new Claude session to continue.",
    input.resume_prompt.trim(),
    "## Context",
    input.context.trim(),
  );

  return `${frontmatter}\n\n${sections.join("\n\n")}\n`;
}

/** `2026-08-05 victron-mppt-charge-profile.md`, with `-2`, `-3`… on collision. */
export function noteFilename(date: string, slug: string, attempt: number): string {
  const suffix = attempt === 1 ? "" : `-${String(attempt)}`;
  return `${date} ${slug}${suffix}.md`;
}

/**
 * Write `content` into `dir` under the first free `noteFilename` variant.
 *
 * Obsidian watches the vault, so a half-written file is a real hazard: the content is
 * staged in a temp file in the same directory and then hard-linked into place. `link`
 * fails with EEXIST rather than clobbering, which makes the "never overwrite" guarantee
 * atomic instead of a check-then-write race.
 */
export async function writeNoteAtomic(
  dir: string,
  date: string,
  slug: string,
  content: string,
): Promise<{ filename: string; path: string }> {
  await mkdir(dir, { recursive: true });
  tempCounter += 1;
  const stamp = `${String(process.pid)}-${String(tempCounter)}`;
  const temp = join(dir, `.obsidian-brain-${stamp}.tmp`);
  await writeFile(temp, content, { encoding: "utf8", mode: 0o644 });

  try {
    for (let attempt = 1; attempt <= MAX_COLLISION_SUFFIX; attempt++) {
      const filename = noteFilename(date, slug, attempt);
      const target = join(dir, filename);
      try {
        await link(temp, target);
        return { filename, path: target };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    throw new Error(
      `refusing to write: ${String(MAX_COLLISION_SUFFIX)} notes already exist for "${date} ${slug}"`,
    );
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}
