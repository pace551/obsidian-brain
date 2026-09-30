/**
 * In-process protocol tests over a linked transport pair. The stdio e2e suite proves the
 * real launch path; this one exercises the same handlers where the coverage instrumenter
 * can see them, and covers the failure branches that are awkward to stage in a subprocess
 * (a vault that does not exist, an unreadable note).
 */

import { chmod, rm } from "node:fs/promises";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, test } from "vitest";

import { createServer } from "../src/index.js";
import { makeVault, noteContent } from "./helpers/vault.js";
import type { TestVault } from "./helpers/vault.js";

let vault: TestVault | null = null;
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (c) => c.close()));
  await vault?.cleanup();
  vault = null;
});

async function connect(vaultRoot: string): Promise<Client> {
  const client = new Client({ name: "obsidian-brain-inproc", version: "0.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    createServer(vaultRoot).connect(serverSide),
    client.connect(clientSide),
  ]);
  clients.push(client);
  return client;
}

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  if (first === undefined || first.type !== "text") throw new Error("expected text");
  return first.text;
}

const MINIMAL_CAPTURE = {
  title: "A capture with only the required fields",
  type: "learning",
  areas: ["general"],
  summary: "It has no tags and no ideas.",
  key_learnings: ["Defaults are applied server-side."],
  resume_prompt: "I was checking that optional fields really are optional.",
  context: "Writing tests.",
};

describe("capture_note", () => {
  test("defaults tags and ideas when they are omitted", async () => {
    vault = await makeVault();
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "capture_note",
      arguments: { ...MINIMAL_CAPTURE, date: "2026-08-05" },
    })) as CallToolResult;
    const { created } = JSON.parse(textOf(result)) as { created: string };

    const read = (await client.callTool({
      name: "read_note",
      arguments: { path: `Inbox/${created.split("/").pop() ?? ""}` },
    })) as CallToolResult;
    const note = JSON.parse(textOf(read)) as {
      frontmatter: { tags: string[] };
      sections: Record<string, string>;
    };

    expect(note.frontmatter.tags).toEqual([]);
    expect(note.sections["Ideas / Follow-ups"]).toBeUndefined();
  });

  test("honors an explicit slug", async () => {
    vault = await makeVault();
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "capture_note",
      arguments: { ...MINIMAL_CAPTURE, slug: "chosen-name", date: "2026-08-05" },
    })) as CallToolResult;

    expect(JSON.parse(textOf(result))).toMatchObject({
      path: "Inbox/2026-08-05 chosen-name.md",
    });
  });

  test("rejects a slug that could escape the Inbox", async () => {
    vault = await makeVault();
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "capture_note",
      arguments: { ...MINIMAL_CAPTURE, slug: "../../escaped" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
  });

  test("rejects a malformed date", async () => {
    vault = await makeVault();
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "capture_note",
      arguments: { ...MINIMAL_CAPTURE, date: "5 August 2026" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
  });

  test("creates the Inbox when the vault does not have one yet", async () => {
    vault = await makeVault();
    await rm(join(vault.root, "Inbox"), { recursive: true, force: true });
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "capture_note",
      arguments: MINIMAL_CAPTURE,
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
  });
});

describe("failure handling", () => {
  test("a missing vault is a tool error naming the env var, not a crash", async () => {
    const client = await connect("/definitely/not/a/vault");

    const result = (await client.callTool({
      name: "list_recent",
      arguments: {},
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/OBSIDIAN_VAULT_ROOT/u);
  });

  test("an unreadable note surfaces as a tool error", async () => {
    vault = await makeVault([{ path: "Inbox/locked.md", content: noteContent() }]);
    const locked = join(vault.root, "Inbox/locked.md");
    await chmod(locked, 0o000);
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "read_note",
      arguments: { path: "Inbox/locked.md" },
    })) as CallToolResult;

    await chmod(locked, 0o644); // so cleanup can remove it
    expect(result.isError).toBe(true);
  });

  test("search skips a note it cannot read instead of failing the whole scan", async () => {
    vault = await makeVault([
      { path: "Inbox/readable.md", content: noteContent({ title: "Victron notes" }) },
      { path: "Inbox/locked.md", content: noteContent({ title: "Victron secrets" }) },
    ]);
    const locked = join(vault.root, "Inbox/locked.md");
    await chmod(locked, 0o000);
    const client = await connect(vault.root);

    const result = (await client.callTool({
      name: "search_notes",
      arguments: { query: "victron" },
    })) as CallToolResult;

    await chmod(locked, 0o644);
    const { results } = JSON.parse(textOf(result)) as { results: { path: string }[] };
    expect(results.map((r) => r.path)).toEqual(["Inbox/readable.md"]);
  });
});

describe("server metadata", () => {
  test("reports its name, version, and usage instructions", async () => {
    vault = await makeVault();
    const client = await connect(vault.root);

    expect(client.getServerVersion()).toMatchObject({ name: "obsidian-brain" });
    expect(client.getInstructions()).toContain("capture_note");
  });
});
