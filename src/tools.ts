/** The five tools. Wiring only — the behavior lives in note/edit/vault/search. */

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { INBOX_DIR } from "./config.js";
import { contentHash, updateNote } from "./edit.js";
import { renderNote, slugify, today, writeNoteAtomic } from "./note.js";
import type { CaptureNoteInput } from "./schema.js";
import {
  captureNoteShape,
  listRecentShape,
  readNoteShape,
  searchNotesShape,
  updateNoteShape,
} from "./schema.js";
import { listRecent, searchNotes } from "./search.js";
import { assertVaultRoot, parseNote, resolveNotePath } from "./vault.js";

function ok(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Every handler resolves the vault root fresh. It costs one `realpath` per call and
 * means a vault that was not mounted at launch (or a corrected config) recovers without
 * restarting Claude Desktop. Failures come back as tool errors, never thrown: a rejected
 * path or a missing vault is something the model should read and react to.
 */
async function withVault(
  root: string,
  handler: (realRoot: string) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await handler(await assertVaultRoot(root));
  } catch (error) {
    return fail(error);
  }
}

export function registerTools(server: McpServer, vaultRoot: string): void {
  server.registerTool(
    "capture_note",
    {
      title: "Capture note to Obsidian",
      description:
        "Write a structured note to the Obsidian vault Inbox. Enforces the vault's note " +
        "format: frontmatter (date, type, areas, tags, source, status) plus Summary, Key " +
        "Learnings, optional Ideas / Follow-ups, a first-person Resume Prompt, and Context. " +
        "Never overwrites an existing note — a same-day, same-slug capture gets a -2 suffix.",
      inputSchema: captureNoteShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) =>
      withVault(vaultRoot, async (realRoot) => {
        const captured: CaptureNoteInput = input;
        const date = captured.date ?? today();
        const slug = captured.slug ?? slugify(captured.title);
        const written = await writeNoteAtomic(
          join(realRoot, INBOX_DIR),
          date,
          slug,
          renderNote(captured, date),
        );
        return ok({
          path: `${INBOX_DIR}/${written.filename}`,
          filename: written.filename,
          created: written.path,
        });
      }),
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search Obsidian notes",
      description:
        "Search the vault (Inbox, Areas, Resources, Archive) by keywords and optional " +
        "area/type/tag/recency filters. Ranks title matches over tag and area matches over " +
        "other frontmatter over Summary over body. When nothing matches, returns the most " +
        'recent notes with fallback set to "recent". Read-only.',
      inputSchema: searchNotesShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) =>
      withVault(vaultRoot, async (realRoot) => ok(await searchNotes(realRoot, input))),
  );

  server.registerTool(
    "list_recent",
    {
      title: "List recent Obsidian notes",
      description:
        "List the most recently modified notes in the vault, newest first. Read-only.",
      inputSchema: listRecentShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ n }) =>
      withVault(vaultRoot, async (realRoot) =>
        ok({ results: await listRecent(realRoot, n) }),
      ),
  );

  server.registerTool(
    "read_note",
    {
      title: "Read an Obsidian note",
      description:
        "Read one note by vault-relative path and return its title, frontmatter, and " +
        "parsed sections (Summary, Key Learnings, Resume Prompt, …) plus the raw text " +
        "and a content hash (pass it to update_note). Paths are confined to the vault. " +
        "Read-only.",
      inputSchema: readNoteShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) =>
      withVault(vaultRoot, async (realRoot) => {
        const absolute = await resolveNotePath(realRoot, path);
        const raw = await readFile(absolute, "utf8");
        const note = parseNote(raw, basename(path, ".md"));
        return ok({
          path,
          title: note.title,
          frontmatter: note.frontmatter,
          sections: note.sections,
          raw,
          hash: contentHash(raw),
        });
      }),
  );

  server.registerTool(
    "update_note",
    {
      title: "Update an Obsidian note",
      description:
        "Edit a note in place: replace or append to its sections (Summary, Key Learnings, " +
        "Ideas / Follow-ups, Resume Prompt, Context), retitle it, or change its type, " +
        "areas, tags, or status. Fields you omit are left exactly as they are, including " +
        "anything added by hand. Only notes with source: claude can be edited. Call " +
        "read_note first and pass its hash as expected_hash; the update is refused if the " +
        "note changed since. Returns the new hash.",
      inputSchema: updateNoteShape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path, expected_hash, ...edits }) =>
      withVault(vaultRoot, async (realRoot) =>
        ok(await updateNote(realRoot, path, expected_hash, edits)),
      ),
  );
}
