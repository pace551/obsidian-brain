/**
 * Vault access: every path this server touches is resolved through here, and every note
 * it reads is parsed here. Nothing else in the codebase joins a caller-supplied string
 * onto the vault root.
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { SEARCH_DIRS, SKIP_DIRS } from "./config.js";

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

/** The vault root, canonicalized. Fails loudly if it is missing or not a directory. */
export async function assertVaultRoot(root: string): Promise<string> {
  let real: string;
  try {
    real = await realpath(root);
  } catch {
    throw new VaultError(
      `vault root does not exist: ${root} (set OBSIDIAN_VAULT_ROOT to the right path)`,
    );
  }
  const info = await stat(real);
  if (!info.isDirectory()) throw new VaultError(`vault root is not a directory: ${root}`);
  return real;
}

/**
 * Turn a caller-supplied vault-relative path into an absolute one, or refuse.
 *
 * Refuses absolute paths, `..` traversal, NUL bytes, non-`.md` files, and — after
 * resolving symlinks on whatever part of the path already exists — anything that lands
 * outside the real vault root. The symlink step is what stops `Inbox/escape.md` from
 * being a link to `~/.ssh/id_rsa` (SEC-INPUT-04).
 */
export async function resolveNotePath(
  realRoot: string,
  relPath: string,
): Promise<string> {
  const raw = relPath.trim();
  if (raw === "") throw new VaultError("path must not be empty");
  if (raw.includes("\0")) throw new VaultError("path must not contain NUL bytes");
  if (isAbsolute(raw)) throw new VaultError(`path must be vault-relative: ${relPath}`);
  if (raw.split(/[\\/]/u).includes("..")) {
    throw new VaultError(`path must not traverse upward: ${relPath}`);
  }
  if (!raw.toLowerCase().endsWith(".md")) {
    throw new VaultError(`path must point at a .md note: ${relPath}`);
  }

  const candidate = resolve(realRoot, raw);
  if (!isInside(realRoot, candidate)) {
    throw new VaultError(`path escapes the vault: ${relPath}`);
  }

  const canonical = await realpath(candidate).catch(() => null);
  if (canonical === null) throw new VaultError(`note not found: ${relPath}`);
  if (!isInside(realRoot, canonical)) {
    throw new VaultError(`path escapes the vault via a symlink: ${relPath}`);
  }
  return canonical;
}

function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

export interface VaultFile {
  /** Vault-relative path, e.g. `Inbox/2026-08-05 victron-mppt.md`. */
  path: string;
  absolute: string;
  mtimeMs: number;
}

/**
 * Every `.md` file under the searchable top-level directories. Templates, `.obsidian`,
 * and dotfiles are skipped; symlinked directories are not followed, so the walk cannot
 * wander out of the vault.
 */
export async function walkVault(realRoot: string): Promise<VaultFile[]> {
  const found: VaultFile[] = [];
  await Promise.all(
    SEARCH_DIRS.map(async (dir) => {
      await walkDir(realRoot, join(realRoot, dir), found);
    }),
  );
  return found;
}

async function walkDir(realRoot: string, dir: string, found: VaultFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) return; // Vaults legitimately lack some of the PARA folders.

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkDir(realRoot, absolute, found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const info = await stat(absolute).catch(() => null);
      if (info === null) continue;
      found.push({
        path: relative(realRoot, absolute),
        absolute,
        mtimeMs: info.mtimeMs,
      });
    }
  }
}

export interface Frontmatter {
  date?: string;
  type?: string;
  areas: string[];
  tags: string[];
  source?: string;
  status?: string;
  /** Any key the note carries that this server does not model. */
  extra: Record<string, string>;
}

export interface ParsedNote {
  title: string;
  frontmatter: Frontmatter;
  /** `## Heading` → section body, in document order. */
  sections: Record<string, string>;
  /** Everything after the frontmatter. */
  body: string;
}

const LIST_KEYS = new Set(["areas", "tags"]);

/**
 * Parse the subset of YAML this vault actually uses — scalars, `- item` block lists, and
 * `[a, b]` inline lists. A full YAML dependency would buy nothing: notes are written by
 * this server, and a hand-edited note that breaks the shape should degrade to "no
 * frontmatter" rather than crash a search over the whole vault.
 */
export function parseNote(raw: string, fallbackTitle: string): ParsedNote {
  const { frontmatterText, body } = splitFrontmatter(raw);
  const frontmatter = parseFrontmatter(frontmatterText);
  const sections = parseSections(body);
  const titleMatch = /^#\s+(.+)$/mu.exec(body);
  const title = titleMatch?.[1]?.trim() ?? fallbackTitle;
  return { title, frontmatter, sections, body };
}

function splitFrontmatter(raw: string): { frontmatterText: string; body: string } {
  const normalized = raw.replace(/\r\n/gu, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatterText: "", body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { frontmatterText: "", body: normalized };
  return {
    frontmatterText: normalized.slice(4, end),
    body: normalized.slice(end + 4).replace(/^\n/u, ""),
  };
}

function parseFrontmatter(text: string): Frontmatter {
  const fm: Frontmatter = { areas: [], tags: [], extra: {} };
  if (text === "") return fm;

  let currentList: string[] | null = null;
  for (const line of text.split("\n")) {
    const listItem = /^\s*-\s+(.*)$/u.exec(line);
    if (listItem !== null && currentList !== null) {
      const value = unquote(listItem[1] ?? "");
      if (value !== "") currentList.push(value);
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (pair === null) continue;
    const key = (pair[1] ?? "").toLowerCase();
    const value = (pair[2] ?? "").trim();
    currentList = null;

    if (LIST_KEYS.has(key)) {
      const list = key === "areas" ? fm.areas : fm.tags;
      if (value === "") {
        currentList = list;
      } else {
        list.push(...parseInlineList(value));
      }
      continue;
    }

    const scalar = unquote(value);
    if (key === "date") fm.date = scalar;
    else if (key === "type") fm.type = scalar;
    else if (key === "source") fm.source = scalar;
    else if (key === "status") fm.status = scalar;
    else if (scalar !== "") fm.extra[key] = scalar;
  }
  return fm;
}

function parseInlineList(value: string): string[] {
  const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return inner
    .split(",")
    .map((part) => unquote(part.trim()))
    .filter((part) => part !== "");
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(["'])(.*)\1$/su.exec(trimmed);
  return (quoted?.[2] ?? trimmed).trim();
}

function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (heading !== null) sections[heading] = buffer.join("\n").trim();
    buffer = [];
  };

  for (const line of body.split("\n")) {
    const match = /^##\s+(.+)$/u.exec(line);
    if (match !== null) {
      flush();
      heading = (match[1] ?? "").trim();
    } else if (heading !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** First sentence of the Summary section — the one-liner shown in search results. */
export function firstSentence(text: string, max = 160): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat === "") return "";
  const stop = /[.!?](\s|$)/u.exec(flat);
  const sentence = stop?.index === undefined ? flat : flat.slice(0, stop.index + 1);
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}
