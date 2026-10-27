/**
 * The temp-file step of capture and update must never follow an entry that is already
 * sitting at its name. `randomBytes` is pinned so a symlink can be planted at exactly the
 * name the next write will pick — the case a random name alone makes improbable, which
 * the exclusive-create flag must still make safe.
 */

import { lstat, readFile, readdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { contentHash, updateNote } from "../src/edit.js";
import { writeNoteAtomic } from "../src/note.js";
import { makeVault, noteContent } from "./helpers/vault.js";
import type { TestVault } from "./helpers/vault.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: (size: number) => Buffer.alloc(size, 0xab) };
});

const TEMP_NAME = `.obsidian-brain-${"ab".repeat(16)}.tmp`;

let vault: TestVault | null = null;
let elsewhere: TestVault | null = null;

afterEach(async () => {
  await vault?.cleanup();
  await elsewhere?.cleanup();
  vault = null;
  elsewhere = null;
});

describe("temp file symlink planted at the next temp name", () => {
  test("capture fails and leaves the link target untouched", async () => {
    vault = await makeVault();
    elsewhere = await makeVault([{ path: "victim.md", content: "untouched\n" }]);
    const victim = join(elsewhere.root, "victim.md");
    const inbox = join(vault.root, "Inbox");
    await symlink(victim, join(inbox, TEMP_NAME));

    await expect(writeNoteAtomic(inbox, "2026-08-05", "solar", "body\n")).rejects.toThrow(
      /EEXIST/u,
    );
    expect(await readFile(victim, "utf8")).toBe("untouched\n");
    expect(await readdir(inbox)).toEqual([TEMP_NAME]);
  });

  test("update fails and leaves both the note and the link target untouched", async () => {
    const path = "Inbox/2026-01-01 victron.md";
    const content = noteContent({ summary: "Original summary." });
    vault = await makeVault([{ path, content }]);
    elsewhere = await makeVault([{ path: "victim.md", content: "untouched\n" }]);
    const victim = join(elsewhere.root, "victim.md");
    await symlink(victim, join(vault.root, "Inbox", TEMP_NAME));

    await expect(
      updateNote(await realpath(vault.root), path, contentHash(content), {
        summary: "Updated.",
      }),
    ).rejects.toThrow(/EEXIST/u);
    expect(await readFile(victim, "utf8")).toBe("untouched\n");
    expect((await lstat(join(vault.root, path))).isFile()).toBe(true);
    expect(await readFile(join(vault.root, path), "utf8")).toBe(content);
  });
});
