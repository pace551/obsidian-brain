/**
 * Editing an existing note in place.
 *
 * Edits are surgical line operations, not a re-render: a note may carry frontmatter keys,
 * sections, or formatting added by hand in Obsidian, and an edit to the Summary must not
 * cost the user any of that. Only `source: claude` notes are editable, and only when the
 * caller's content hash still matches — a stale model must not clobber a hand edit.
 */

import { createHash } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { bullets, normalizeTitle, yamlList } from "./note.js";
import type { NoteEdits } from "./schema.js";
import { VaultError, parseNote, resolveNotePath } from "./vault.js";

const IDEAS = "Ideas / Follow-ups";
/** A line that would start a new title or section — the structure the edit relies on. */
const STRUCTURAL_HEADING = /^#{1,2}\s/mu;

let tempCounter = 0;

export function contentHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Apply `edits` to a note's text and return the new text. Throws on an empty edit, a
 * value that would inject a `#`/`##` heading, or a section the note does not have.
 */
export function applyEdits(raw: string, edits: NoteEdits): string {
  if (!Object.values(edits).some((value) => value !== undefined)) {
    throw new VaultError("nothing to update: pass at least one field to change");
  }
  if (edits.key_learnings !== undefined && edits.add_key_learnings !== undefined) {
    throw new VaultError("pass key_learnings or add_key_learnings, not both");
  }
  if (edits.ideas !== undefined && edits.add_ideas !== undefined) {
    throw new VaultError("pass ideas or add_ideas, not both");
  }
  for (const [field, value] of Object.entries(edits)) {
    const texts: unknown[] = Array.isArray(value) ? value : [value];
    if (texts.some((t) => typeof t === "string" && STRUCTURAL_HEADING.test(t))) {
      throw new VaultError(`${field} must not contain a "#" or "##" heading line`);
    }
  }

  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.replace(/\r\n/gu, "\n").split("\n");
  const bodyStart = editFrontmatter(lines, edits);

  if (edits.title !== undefined) {
    const h1 = lines.findIndex((line, i) => i >= bodyStart && /^#\s/u.test(line));
    if (h1 === -1) throw new VaultError('note has no "# " title line to replace');
    lines[h1] = `# ${normalizeTitle(edits.title)}`;
  }
  if (edits.summary !== undefined) replaceSection(lines, "Summary", edits.summary.trim());
  if (edits.key_learnings !== undefined) {
    replaceSection(lines, "Key Learnings", bullets(edits.key_learnings));
  }
  if (edits.add_key_learnings !== undefined) {
    appendToSection(lines, "Key Learnings", edits.add_key_learnings);
  }
  if (edits.ideas !== undefined) setIdeas(lines, edits.ideas);
  if (edits.add_ideas !== undefined) {
    if (findSection(lines, IDEAS) === null) setIdeas(lines, edits.add_ideas);
    else appendToSection(lines, IDEAS, edits.add_ideas);
  }
  if (edits.resume_prompt !== undefined) replaceResumePrompt(lines, edits.resume_prompt);
  if (edits.context !== undefined) replaceSection(lines, "Context", edits.context.trim());

  return lines.join(eol);
}

/**
 * Rewrite the frontmatter keys named in `edits`, in place. Returns the index of the
 * first body line so body searches never match inside the frontmatter.
 */
function editFrontmatter(lines: string[], edits: NoteEdits): number {
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const updates: [string, string][] = [];
  if (edits.type !== undefined) updates.push(["type", `type: ${edits.type}`]);
  if (edits.areas !== undefined) updates.push(["areas", yamlList("areas", edits.areas)]);
  if (edits.tags !== undefined) updates.push(["tags", yamlList("tags", edits.tags)]);
  if (edits.status !== undefined) updates.push(["status", `status: ${edits.status}`]);

  if (updates.length > 0 && close === -1) {
    throw new VaultError("note has no frontmatter to update");
  }
  let end = close;
  for (const [key, rendered] of updates) {
    const replacement = rendered.split("\n");
    const at = lines.findIndex(
      (line, i) => i > 0 && i < end && line.startsWith(`${key}:`),
    );
    if (at === -1) {
      lines.splice(end, 0, ...replacement);
      end += replacement.length;
      continue;
    }
    let extent = 1;
    while (at + extent < end && /^\s*-\s/u.test(lines[at + extent] ?? "")) extent += 1;
    lines.splice(at, extent, ...replacement);
    end += replacement.length - extent;
  }
  return end + 1;
}

/** `[heading line, first line of the next title/section)`, or null if absent. */
function findSection(
  lines: string[],
  name: string,
): { start: number; end: number } | null {
  const start = lines.findIndex((line) => {
    const match = /^##\s+(.+)$/u.exec(line);
    return match !== null && (match[1] ?? "").trim() === name;
  });
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s/u.test(lines[end] ?? "")) end += 1;
  return { start, end };
}

function requireSection(lines: string[], name: string): { start: number; end: number } {
  const section = findSection(lines, name);
  if (section === null) throw new VaultError(`note has no "${name}" section to update`);
  return section;
}

/** Heading, blank, content, blank — the spacing capture_note writes. */
function replaceSection(lines: string[], name: string, content: string): void {
  const { start, end } = requireSection(lines, name);
  lines.splice(start + 1, end - start - 1, "", ...content.split("\n"), "");
}

function appendToSection(lines: string[], name: string, items: readonly string[]): void {
  const { start, end } = requireSection(lines, name);
  let last = end - 1;
  while (last > start && (lines[last] ?? "").trim() === "") last -= 1;
  const added = bullets(items).split("\n");
  if (last === start) lines.splice(start + 1, end - start - 1, "", ...added, "");
  else lines.splice(last + 1, 0, ...added);
}

/** An empty list removes the section: an empty Ideas section reads as an unfinished to-do. */
function setIdeas(lines: string[], ideas: readonly string[]): void {
  const existing = findSection(lines, IDEAS);
  if (existing !== null) {
    if (ideas.length === 0) lines.splice(existing.start, existing.end - existing.start);
    else replaceSection(lines, IDEAS, bullets(ideas));
    return;
  }
  if (ideas.length === 0) return;
  const before = findSection(lines, "Resume Prompt") ?? findSection(lines, "Context");
  const block = [`## ${IDEAS}`, "", ...bullets(ideas).split("\n"), ""];
  if (before !== null) {
    lines.splice(before.start, 0, ...block);
  } else {
    while (lines.length > 0 && (lines.at(-1) ?? "").trim() === "") lines.pop();
    lines.push("", ...block);
  }
}

/** Keeps the leading `> Paste into a new Claude session…` hint if the note has one. */
function replaceResumePrompt(lines: string[], text: string): void {
  const { start, end } = requireSection(lines, "Resume Prompt");
  const hint = lines.slice(start + 1, end).find((line) => line.trim() !== "");
  const content =
    hint?.startsWith(">") === true ? `${hint}\n\n${text.trim()}` : text.trim();
  replaceSection(lines, "Resume Prompt", content);
}

/**
 * Apply `edits` to the note at `relPath` if it is a `source: claude` note whose content
 * still hashes to `expectedHash`. Returns the new hash so the caller can chain edits.
 */
export async function updateNote(
  realRoot: string,
  relPath: string,
  expectedHash: string,
  edits: NoteEdits,
): Promise<{ path: string; hash: string }> {
  const absolute = await resolveNotePath(realRoot, relPath);
  const raw = await readFile(absolute, "utf8");
  const note = parseNote(raw, basename(relPath, ".md"));
  if (note.frontmatter.source !== "claude") {
    throw new VaultError(
      `refusing to edit ${relPath}: only notes with source: claude are editable ` +
        "(edit hand-written notes in Obsidian)",
    );
  }
  assertUnchanged(raw, expectedHash, relPath);
  const updated = applyEdits(raw, edits);

  // Same temp-then-rename discipline as capture: Obsidian never sees a half-written file.
  // The hash is re-checked just before the rename to narrow the window for a hand edit.
  tempCounter += 1;
  const temp = join(
    dirname(absolute),
    `.obsidian-brain-${String(process.pid)}-${String(tempCounter)}.tmp`,
  );
  const mode = (await stat(absolute)).mode & 0o777;
  await writeFile(temp, updated, { encoding: "utf8", mode });
  try {
    assertUnchanged(await readFile(absolute, "utf8"), expectedHash, relPath);
    await rename(temp, absolute);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  return { path: relPath, hash: contentHash(updated) };
}

function assertUnchanged(raw: string, expectedHash: string, relPath: string): void {
  if (contentHash(raw) !== expectedHash) {
    throw new VaultError(
      `${relPath} changed since it was read: call read_note again and re-apply the edit`,
    );
  }
}
