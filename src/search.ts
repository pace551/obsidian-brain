/**
 * Ranked scan over the vault. No index: a personal vault is a few hundred small files,
 * and a stale index would be a worse failure than a 50ms full read.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type { SearchNotesInput } from "./schema.js";
import { firstSentence, parseNote, walkVault } from "./vault.js";
import type { ParsedNote, VaultFile } from "./vault.js";

/** Zone weights, mirroring the ranking the obsidian-recall skill has always described. */
const WEIGHT = {
  title: 100,
  tagOrArea: 60,
  frontmatter: 40,
  summary: 20,
  body: 10,
} as const;

const MS_PER_DAY = 86_400_000;

export interface SearchResult {
  path: string;
  title: string;
  date: string | null;
  type: string | null;
  areas: string[];
  tags: string[];
  summary: string;
  modified: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  /** `"recent"` when the results are a recency listing rather than query matches. */
  fallback: "recent" | null;
  scanned: number;
}

interface LoadedNote {
  file: VaultFile;
  note: ParsedNote;
}

async function loadAll(realRoot: string): Promise<LoadedNote[]> {
  const files = await walkVault(realRoot);
  const loaded = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(file.absolute, "utf8").catch(() => null);
      if (raw === null) return null;
      return { file, note: parseNote(raw, basename(file.path, ".md")) };
    }),
  );
  return loaded.filter((entry): entry is LoadedNote => entry !== null);
}

/** `"#van victron mppt"` → `["van", "victron", "mppt"]`. */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/u)
    .map((term) => term.replace(/^#/u, "").trim())
    .filter((term) => term.length > 1);
}

function scoreNote(entry: LoadedNote, terms: string[]): number {
  const { note, file } = entry;
  const fm = note.frontmatter;
  const zones: [string, number][] = [
    [`${note.title} ${basename(file.path, ".md")}`, WEIGHT.title],
    [[...fm.areas, ...fm.tags].join(" "), WEIGHT.tagOrArea],
    [
      [fm.type, fm.date, fm.status, fm.source, ...Object.values(fm.extra)]
        .filter((v): v is string => v !== undefined)
        .join(" "),
      WEIGHT.frontmatter,
    ],
    [note.sections["Summary"] ?? "", WEIGHT.summary],
    [note.body, WEIGHT.body],
  ];
  const haystacks = zones.map(([text, weight]) => [text.toLowerCase(), weight] as const);

  // Each term scores once, in the highest-value zone it appears in.
  let total = 0;
  for (const term of terms) {
    for (const [text, weight] of haystacks) {
      if (text.includes(term)) {
        total += weight;
        break;
      }
    }
  }
  return total;
}

function matchesFilters(
  entry: LoadedNote,
  input: SearchNotesInput,
  now: number,
): boolean {
  const fm = entry.note.frontmatter;
  if (input.area !== undefined && !fm.areas.includes(input.area)) return false;
  if (input.type !== undefined && fm.type !== input.type) return false;
  if (input.tag !== undefined) {
    const wanted = input.tag.toLowerCase().replace(/^#/u, "");
    if (!fm.tags.some((t) => t.toLowerCase() === wanted)) return false;
  }
  if (input.modified_within_days !== undefined) {
    const cutoff = now - input.modified_within_days * MS_PER_DAY;
    if (entry.file.mtimeMs < cutoff) return false;
  }
  return true;
}

function toResult(entry: LoadedNote, score: number): SearchResult {
  const fm = entry.note.frontmatter;
  return {
    path: entry.file.path,
    title: entry.note.title,
    date: fm.date ?? null,
    type: fm.type ?? null,
    areas: fm.areas,
    tags: fm.tags,
    summary: firstSentence(entry.note.sections["Summary"] ?? ""),
    modified: new Date(entry.file.mtimeMs).toISOString(),
    score,
  };
}

/**
 * Filter, then rank. An empty query — or a query nothing matches — degrades to the most
 * recently modified notes that still satisfy the filters, flagged `fallback: "recent"`
 * so the caller can say "nothing matched, here's what's fresh" instead of implying hits.
 */
export async function searchNotes(
  realRoot: string,
  input: SearchNotesInput,
  now: number = Date.now(),
): Promise<SearchResponse> {
  const loaded = await loadAll(realRoot);
  const candidates = loaded.filter((entry) => matchesFilters(entry, input, now));
  const terms = queryTerms(input.query ?? "");

  if (terms.length > 0) {
    const scored = candidates
      .map((entry) => ({ entry, score: scoreNote(entry, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.entry.file.mtimeMs - a.entry.file.mtimeMs);

    if (scored.length > 0) {
      return {
        results: scored
          .slice(0, input.limit)
          .map(({ entry, score }) => toResult(entry, score)),
        fallback: null,
        scanned: loaded.length,
      };
    }
  }

  return {
    results: byRecency(candidates, input.limit).map((entry) => toResult(entry, 0)),
    fallback: "recent",
    scanned: loaded.length,
  };
}

function byRecency(entries: LoadedNote[], limit: number): LoadedNote[] {
  return [...entries].sort((a, b) => b.file.mtimeMs - a.file.mtimeMs).slice(0, limit);
}

/** The N most recently modified notes, newest first. */
export async function listRecent(realRoot: string, n: number): Promise<SearchResult[]> {
  const loaded = await loadAll(realRoot);
  return byRecency(loaded, n).map((entry) => toResult(entry, 0));
}
