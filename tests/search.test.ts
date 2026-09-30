import { afterEach, describe, expect, test } from "vitest";

import { SearchNotesInput } from "../src/schema.js";
import { listRecent, queryTerms, searchNotes } from "../src/search.js";
import { assertVaultRoot } from "../src/vault.js";
import { BASE_TIME, DAY, makeVault, noteContent } from "./helpers/vault.js";
import type { NoteSpec, TestVault } from "./helpers/vault.js";

let vault: TestVault | null = null;

afterEach(async () => {
  await vault?.cleanup();
  vault = null;
});

function input(overrides: Partial<SearchNotesInput> = {}): SearchNotesInput {
  return SearchNotesInput.parse({ ...overrides });
}

/** One note per scoring zone, so ranking order is the only thing under test. */
const ZONE_NOTES: NoteSpec[] = [
  {
    path: "Inbox/body-hit.md",
    content: noteContent({
      title: "Something else entirely",
      summary: "Nothing to see.",
      learnings: ["An aside about victron wiring buried in the body."],
    }),
    mtimeMs: BASE_TIME + 4 * DAY,
  },
  {
    path: "Inbox/summary-hit.md",
    content: noteContent({
      title: "Something else entirely",
      summary: "This one is about victron gear.",
    }),
    mtimeMs: BASE_TIME + 3 * DAY,
  },
  {
    path: "Inbox/frontmatter-hit.md",
    content: noteContent({
      title: "Something else entirely",
      type: "project-note",
      extra: { project: "victron-install" },
      summary: "Nothing to see.",
    }),
    mtimeMs: BASE_TIME + 2 * DAY,
  },
  {
    path: "Inbox/tag-hit.md",
    content: noteContent({
      title: "Something else entirely",
      tags: ["victron"],
      summary: "Nothing to see.",
    }),
    mtimeMs: BASE_TIME + DAY,
  },
  {
    path: "Inbox/title-hit.md",
    content: noteContent({ title: "Victron charge profile", summary: "Nothing to see." }),
    mtimeMs: BASE_TIME,
  },
];

describe("queryTerms", () => {
  test("lowercases, strips a leading #, and drops single characters", () => {
    expect(queryTerms("#Van Victron a MPPT")).toEqual(["van", "victron", "mppt"]);
  });

  test("returns nothing for an empty query", () => {
    expect(queryTerms("   ")).toEqual([]);
  });
});

describe("searchNotes ranking", () => {
  test("orders title > tag/area > other frontmatter > summary > body", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    const { results, fallback } = await searchNotes(root, input({ query: "victron" }));

    expect(fallback).toBeNull();
    expect(results.map((r) => r.path)).toEqual([
      "Inbox/title-hit.md",
      "Inbox/tag-hit.md",
      "Inbox/frontmatter-hit.md",
      "Inbox/summary-hit.md",
      "Inbox/body-hit.md",
    ]);
    expect(results.map((r) => r.score)).toEqual([100, 60, 40, 20, 10]);
  });

  test("scores an area match like a tag match", async () => {
    vault = await makeVault([
      {
        path: "Inbox/area-hit.md",
        content: noteContent({ title: "Unrelated", areas: ["sailing"] }),
      },
    ]);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(root, input({ query: "sailing" }));
    expect(results[0]?.score).toBe(60);
  });

  test("a filename match counts as a title match", async () => {
    vault = await makeVault([
      {
        path: "Inbox/2026-03-14 victron-mppt.md",
        content: noteContent({ title: "Untitled" }),
      },
    ]);
    const root = await assertVaultRoot(vault.root);

    expect((await searchNotes(root, input({ query: "mppt" }))).results[0]?.score).toBe(
      100,
    );
  });

  test("multiple matching terms outrank a single stronger match", async () => {
    vault = await makeVault([
      {
        path: "Inbox/one-strong.md",
        content: noteContent({ title: "Victron everything" }),
      },
      {
        path: "Inbox/two-weak.md",
        content: noteContent({ title: "Unrelated", tags: ["victron", "mppt"] }),
      },
    ]);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(root, input({ query: "victron mppt" }));
    expect(results[0]?.path).toBe("Inbox/two-weak.md");
    expect(results[0]?.score).toBe(120);
  });

  test("breaks score ties by recency", async () => {
    vault = await makeVault([
      {
        path: "Inbox/older.md",
        content: noteContent({ title: "Victron notes" }),
        mtimeMs: BASE_TIME,
      },
      {
        path: "Inbox/newer.md",
        content: noteContent({ title: "Victron notes" }),
        mtimeMs: BASE_TIME + DAY,
      },
    ]);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(root, input({ query: "victron" }));
    expect(results.map((r) => r.path)).toEqual(["Inbox/newer.md", "Inbox/older.md"]);
  });

  test("honors the limit", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    expect(
      (await searchNotes(root, input({ query: "victron", limit: 2 }))).results,
    ).toHaveLength(2);
  });
});

describe("searchNotes filters", () => {
  const notes: NoteSpec[] = [
    {
      path: "Inbox/van-howto.md",
      content: noteContent({
        title: "Van charge profile",
        type: "how-to",
        areas: ["van"],
        tags: ["victron"],
      }),
      mtimeMs: BASE_TIME + 10 * DAY,
    },
    {
      path: "Areas/homestead/pump.md",
      content: noteContent({
        title: "Well pump charge profile",
        type: "learning",
        areas: ["homestead"],
        tags: ["pump"],
      }),
      mtimeMs: BASE_TIME,
    },
  ];

  test("filters by area", async () => {
    vault = await makeVault(notes);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(root, input({ query: "charge", area: "van" }));
    expect(results.map((r) => r.path)).toEqual(["Inbox/van-howto.md"]);
  });

  test("filters by type", async () => {
    vault = await makeVault(notes);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(
      root,
      input({ query: "charge", type: "learning" }),
    );
    expect(results.map((r) => r.path)).toEqual(["Areas/homestead/pump.md"]);
  });

  test("filters by tag, tolerating a leading #", async () => {
    vault = await makeVault(notes);
    const root = await assertVaultRoot(vault.root);

    const { results } = await searchNotes(
      root,
      input({ query: "charge", tag: "#victron" }),
    );
    expect(results.map((r) => r.path)).toEqual(["Inbox/van-howto.md"]);
  });

  test("filters by modification recency", async () => {
    vault = await makeVault(notes);
    const root = await assertVaultRoot(vault.root);
    const now = BASE_TIME + 12 * DAY;

    const { results } = await searchNotes(
      root,
      input({ query: "charge", modified_within_days: 5 }),
      now,
    );
    expect(results.map((r) => r.path)).toEqual(["Inbox/van-howto.md"]);
  });
});

describe("searchNotes fallback", () => {
  test("an empty query returns recent notes flagged as a fallback", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    const { results, fallback, scanned } = await searchNotes(root, input());
    expect(fallback).toBe("recent");
    expect(scanned).toBe(5);
    expect(results[0]?.path).toBe("Inbox/body-hit.md"); // newest
  });

  test("a query that matches nothing falls back to recent", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    const { results, fallback } = await searchNotes(root, input({ query: "kombucha" }));
    expect(fallback).toBe("recent");
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  test("the fallback still respects filters", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    const { results, fallback } = await searchNotes(
      root,
      input({ query: "kombucha", type: "project-note" }),
    );
    expect(fallback).toBe("recent");
    expect(results.map((r) => r.path)).toEqual(["Inbox/frontmatter-hit.md"]);
  });

  test("an empty vault returns no results rather than erroring", async () => {
    vault = await makeVault();
    const root = await assertVaultRoot(vault.root);

    const { results, fallback } = await searchNotes(root, input({ query: "anything" }));
    expect(results).toEqual([]);
    expect(fallback).toBe("recent");
  });
});

describe("search results", () => {
  test("carry the fields the recall skill displays", async () => {
    vault = await makeVault([
      {
        path: "Inbox/2026-03-14 victron.md",
        content: noteContent({
          title: "Victron MPPT charge profile",
          date: "2026-03-14",
          type: "how-to",
          areas: ["van", "homestead"],
          tags: ["victron", "mppt"],
          summary:
            "Worked out absorption voltage. A second sentence that should be dropped.",
        }),
        mtimeMs: BASE_TIME,
      },
    ]);
    const root = await assertVaultRoot(vault.root);

    const [result] = (await searchNotes(root, input({ query: "victron" }))).results;
    expect(result).toMatchObject({
      path: "Inbox/2026-03-14 victron.md",
      title: "Victron MPPT charge profile",
      date: "2026-03-14",
      type: "how-to",
      areas: ["van", "homestead"],
      tags: ["victron", "mppt"],
      summary: "Worked out absorption voltage.",
      modified: new Date(BASE_TIME).toISOString(),
    });
  });
});

describe("listRecent", () => {
  test("returns notes newest first, capped at n", async () => {
    vault = await makeVault(ZONE_NOTES);
    const root = await assertVaultRoot(vault.root);

    const results = await listRecent(root, 3);
    expect(results.map((r) => r.path)).toEqual([
      "Inbox/body-hit.md",
      "Inbox/summary-hit.md",
      "Inbox/frontmatter-hit.md",
    ]);
  });

  test("returns an empty list for an empty vault", async () => {
    vault = await makeVault();
    const root = await assertVaultRoot(vault.root);
    expect(await listRecent(root, 10)).toEqual([]);
  });
});
