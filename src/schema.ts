/**
 * The note contract. These enums are the reason this is an MCP server and not a prompt:
 * a client that invents an area or a type gets a validation error, not a stray note.
 *
 * Changing NOTE_TYPES or AREAS is a breaking change to the vault's taxonomy — the four
 * SKILL.md files list the same values and `tests/skills.test.ts` fails if they drift.
 */

import { z } from "zod";

export const NOTE_TYPES = [
  "learning",
  "idea",
  "research",
  "how-to",
  "project-note",
] as const;

export const AREAS = [
  "van",
  "motorcycles",
  "cycling",
  "sailing",
  "automotive",
  "home-automation",
  "homestead",
  "spa-rpa",
  "ai-learning",
  "diy",
  "family",
  "work",
  "general",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];
export type Area = (typeof AREAS)[number];

/** Lowercase, hyphen-separated, starts alphanumeric. Same shape as the area keys. */
export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const tag = z
  .string()
  .regex(TAG_PATTERN, "tags must be lowercase, hyphenated, and start alphanumeric");

const nonEmpty = (label: string) =>
  z.string().trim().min(1, `${label} must not be empty`);

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const captureNoteShape = {
  title: nonEmpty("title").max(200).describe("Concise descriptive title, sentence case"),
  type: z.enum(NOTE_TYPES).describe("What kind of note this is"),
  areas: z
    .array(z.enum(AREAS))
    .min(1, "at least one area is required")
    .describe("Life domains this note belongs to"),
  tags: z
    .array(tag)
    .default([])
    .describe("Specific topic tags, lowercase and hyphenated — distinct from areas"),
  summary: nonEmpty("summary").describe(
    "2-3 sentences on what this was about and why it matters",
  ),
  key_learnings: z
    .array(nonEmpty("key learning"))
    .min(1, "at least one key learning is required")
    .describe("Concrete, specific, reusable insights — one per bullet"),
  ideas: z
    .array(nonEmpty("idea"))
    .default([])
    .describe("Follow-ups and open questions; omit rather than pad"),
  resume_prompt: nonEmpty("resume_prompt").describe(
    "First-person, dense note from past-you to future-you; assumes zero context",
  ),
  context: nonEmpty("context").describe("One short paragraph on what prompted this"),
  slug: z
    .string()
    .regex(TAG_PATTERN, "slug must be lowercase, hyphenated, and start alphanumeric")
    .max(80)
    .optional()
    .describe("Filename slug; derived from the title when omitted"),
  date: z
    .string()
    .regex(ISO_DATE_PATTERN, "date must be YYYY-MM-DD")
    .optional()
    .describe("Note date; today when omitted"),
};

export const CaptureNoteInput = z.object(captureNoteShape);
export type CaptureNoteInput = z.infer<typeof CaptureNoteInput>;

export const searchNotesShape = {
  query: z.string().optional().describe("Free-text keywords; omit to list recent notes"),
  area: z.enum(AREAS).optional().describe("Restrict to one area"),
  type: z.enum(NOTE_TYPES).optional().describe("Restrict to one note type"),
  tag: z.string().optional().describe("Restrict to notes carrying this tag"),
  modified_within_days: z
    .number()
    .int()
    .positive()
    .max(3650)
    .optional()
    .describe("Only notes modified in the last N days"),
  limit: z.number().int().positive().max(10).default(10).describe("Max results (≤10)"),
};

export const SearchNotesInput = z.object(searchNotesShape);
export type SearchNotesInput = z.infer<typeof SearchNotesInput>;

export const listRecentShape = {
  n: z.number().int().positive().max(25).default(10).describe("How many notes (≤25)"),
};

export const ReadNoteInput = z.object({
  path: nonEmpty("path").describe(
    "Vault-relative path to a .md note, e.g. Inbox/2026-08-05 my-note.md",
  ),
});
export type ReadNoteInput = z.infer<typeof ReadNoteInput>;

export const readNoteShape = ReadNoteInput.shape;
