/**
 * End-to-end over the real interface: a client speaking MCP to the server as a child
 * process over stdio, exactly as Claude Desktop launches it (TST-VERIFY-02). Everything
 * runs against a temp vault — tests never touch the real one.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { BASE_TIME, makeVault, noteContent } from "./helpers/vault.js";
import type { TestVault } from "./helpers/vault.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(REPO_ROOT, "node_modules/.bin/tsx");
const ENTRYPOINT = join(REPO_ROOT, "src/index.ts");

let vault: TestVault;
let client: Client;

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  if (first === undefined || first.type !== "text")
    throw new Error("expected text content");
  return first.text;
}

function jsonOf(result: CallToolResult): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

beforeAll(async () => {
  vault = await makeVault([
    {
      path: "Areas/van/2026-03-14 existing-solar-note.md",
      content: noteContent({
        title: "Existing solar note",
        areas: ["van"],
        tags: ["solar"],
        summary: "A note that was already in the vault before this session.",
      }),
      mtimeMs: BASE_TIME,
    },
  ]);

  client = new Client({ name: "obsidian-brain-e2e", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: TSX,
      args: [ENTRYPOINT],
      env: { ...process.env, OBSIDIAN_VAULT_ROOT: vault.root },
      stderr: "ignore",
    }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
  await vault.cleanup();
});

describe("tool surface", () => {
  test("advertises exactly the five tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "capture_note",
      "list_recent",
      "read_note",
      "search_notes",
      "update_note",
    ]);
  });

  test("marks update_note as the one destructive tool", async () => {
    const { tools } = await client.listTools();
    const destructive = tools.filter((t) => t.annotations?.destructiveHint === true);
    expect(destructive.map((t) => t.name)).toEqual(["update_note"]);
  });

  test("publishes the area and type enums in capture_note's schema", async () => {
    const { tools } = await client.listTools();
    const capture = tools.find((t) => t.name === "capture_note");
    const schema = JSON.stringify(capture?.inputSchema);

    expect(schema).toContain("project-note");
    expect(schema).toContain("home-automation");
    expect(schema).toContain("resume_prompt");
  });
});

describe("capture → search → read round trip", () => {
  const captureArgs = {
    title: "Victron MPPT charge profile for the lithium bank",
    type: "how-to",
    areas: ["van"],
    tags: ["victron", "mppt"],
    summary: "Worked out absorption voltage and tail current for the Battle Born bank.",
    key_learnings: ["Absorption at 14.4 V", "Tail current 5 A"],
    ideas: ["Check the BMS logs next"],
    resume_prompt: "I was setting the MPPT charge profile for a 200 Ah bank.",
    context: "The batteries were getting warm on long solar days.",
    date: "2026-08-05",
  };

  test("capture_note writes a correctly formatted Inbox note", async () => {
    const result = jsonOf(await call("capture_note", captureArgs));

    expect(result["path"]).toBe(
      "Inbox/2026-08-05 victron-mppt-charge-profile-for-the.md",
    );
    const raw = await readFile(String(result["created"]), "utf8");
    expect(raw).toContain("date: 2026-08-05\ntype: how-to\nareas:\n  - van\n");
    expect(raw).toContain("source: claude\nstatus: inbox");
    expect(raw).toContain("# Victron MPPT charge profile for the lithium bank");
    expect(raw).toContain(
      "## Key Learnings\n\n- Absorption at 14.4 V\n- Tail current 5 A",
    );
    expect(raw).toContain("## Ideas / Follow-ups\n\n- Check the BMS logs next");
    expect(raw).toContain("## Resume Prompt");
  });

  test("a repeat capture suffixes -2 instead of overwriting", async () => {
    const result = jsonOf(await call("capture_note", captureArgs));
    expect(result["path"]).toBe(
      "Inbox/2026-08-05 victron-mppt-charge-profile-for-the-2.md",
    );
  });

  test("search_notes finds the captured note", async () => {
    const result = jsonOf(await call("search_notes", { query: "victron mppt" }));
    const results = result["results"] as { path: string; title: string }[];

    expect(result["fallback"]).toBeNull();
    expect(results[0]?.title).toBe("Victron MPPT charge profile for the lithium bank");
  });

  test("read_note returns the parsed sections", async () => {
    const search = jsonOf(await call("search_notes", { query: "victron", limit: 1 }));
    const [top] = search["results"] as { path: string }[];

    const note = jsonOf(await call("read_note", { path: top?.path ?? "" }));
    const sections = note["sections"] as Record<string, string>;

    expect(note["title"]).toBe("Victron MPPT charge profile for the lithium bank");
    expect(sections["Resume Prompt"]).toContain(
      "I was setting the MPPT charge profile for a 200 Ah bank.",
    );
    expect(sections["Key Learnings"]).toContain("Absorption at 14.4 V");
    expect(note["frontmatter"]).toMatchObject({ type: "how-to", areas: ["van"] });
  });

  test("list_recent puts the newest capture first", async () => {
    const result = jsonOf(await call("list_recent", { n: 5 }));
    const results = result["results"] as { path: string }[];
    expect(results[0]?.path).toContain("victron-mppt-charge-profile");
    expect(results.some((r) => r.path.includes("existing-solar-note"))).toBe(true);
  });
});

describe("validation and path safety at the protocol boundary", () => {
  test("rejects an area outside the enum", async () => {
    const result = await call("capture_note", {
      title: "Bad area",
      type: "learning",
      areas: ["quantum-basket-weaving"],
      summary: "s",
      key_learnings: ["k"],
      resume_prompt: "r",
      context: "c",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/areas/u);
  });

  test("rejects a note type outside the enum", async () => {
    const result = await call("capture_note", {
      title: "Bad type",
      type: "shopping-list",
      areas: ["general"],
      summary: "s",
      key_learnings: ["k"],
      resume_prompt: "r",
      context: "c",
    });
    expect(result.isError).toBe(true);
  });

  test("rejects a capture with no key learnings", async () => {
    const result = await call("capture_note", {
      title: "No learnings",
      type: "learning",
      areas: ["general"],
      summary: "s",
      key_learnings: [],
      resume_prompt: "r",
      context: "c",
    });
    expect(result.isError).toBe(true);
  });

  test("rejects an uppercase tag", async () => {
    const result = await call("capture_note", {
      title: "Bad tag",
      type: "learning",
      areas: ["general"],
      tags: ["Victron"],
      summary: "s",
      key_learnings: ["k"],
      resume_prompt: "r",
      context: "c",
    });
    expect(result.isError).toBe(true);
  });

  test.each([
    ["../../etc/hosts", /traverse|\.md/u],
    ["/etc/hosts", /vault-relative|\.md/u],
    ["/etc/passwd.md", /vault-relative/u],
    ["Inbox/../../secrets.md", /traverse/u],
  ])("read_note rejects %s", async (path, expected) => {
    const result = await call("read_note", { path });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(expected);
  });

  test("read_note reports a missing note without leaking the absolute path", async () => {
    const result = await call("read_note", { path: "Inbox/nope.md" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("note not found: Inbox/nope.md");
  });

  test("caps search_notes limit at 10", async () => {
    const result = await call("search_notes", { query: "victron", limit: 50 });
    expect(result.isError).toBe(true);
  });
});

describe("update_note over stdio", () => {
  const PATH = "Areas/van/2026-03-14 existing-solar-note.md";

  test("read → update → read round-trips, and a stale hash is refused", async () => {
    const before = jsonOf(await call("read_note", { path: PATH }));
    const updated = jsonOf(
      await call("update_note", {
        path: PATH,
        expected_hash: before["hash"],
        add_key_learnings: ["Added over stdio."],
        tags: ["solar", "edited"],
      }),
    );
    expect(updated["hash"]).not.toBe(before["hash"]);

    const after = jsonOf(await call("read_note", { path: PATH }));
    expect(after["hash"]).toBe(updated["hash"]);
    expect((after["sections"] as Record<string, string>)["Key Learnings"]).toContain(
      "- Added over stdio.",
    );
    expect(after["frontmatter"]).toMatchObject({ tags: ["solar", "edited"] });

    const stale = await call("update_note", {
      path: PATH,
      expected_hash: before["hash"],
      summary: "Should not land.",
    });
    expect(stale.isError).toBe(true);
    expect(textOf(stale)).toMatch(/changed since it was read/u);
  });

  test("rejects an area outside the enum", async () => {
    const note = jsonOf(await call("read_note", { path: PATH }));
    const result = await call("update_note", {
      path: PATH,
      expected_hash: note["hash"],
      areas: ["quantum-basket-weaving"],
    });
    expect(result.isError).toBe(true);
  });

  test("refuses to escape the vault", async () => {
    const result = await call("update_note", {
      path: "../../etc/hosts.md",
      expected_hash: "0".repeat(64),
      summary: "x",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/traverse/u);
  });
});
