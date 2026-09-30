---
name: obsidian-recall
description: Use this skill when the user wants to find, search, or resume prior work captured in their Obsidian vault. TRIGGER on phrases like "recall from obsidian", "find my notes on X", "search my obsidian", "what did I capture about X", "resume the X thread", "pick up where we left off on X", "what was I doing with X", "pull up my notes on X", "obsidian recall", or any request to retrieve prior captured context. Searches via the obsidian-brain MCP server and loads the selected note's Resume Prompt + Key Learnings back into the session.
---

# obsidian-recall (Desktop / claude.ai)

Find and resume prior work captured in the user's Obsidian vault.

## How searching works here

This variant has no filesystem access and no ripgrep. Use the **obsidian-brain** MCP server's read-only tools:

- **`search_notes`** — `{query?, area?, type?, tag?, modified_within_days?, limit?}`. Does the ranking for you: title matches beat tag and area matches, which beat other frontmatter, which beats the Summary section, which beats the body; ties break toward the most recently modified note.
- **`list_recent`** — `{n?}` for "what was I just working on".
- **`read_note`** — `{path}` returns the note's title, frontmatter, and parsed sections.

If the obsidian-brain tools are not available, say so plainly and stop — there is no other route to the vault from this session.

## Query interpretation

The user's request may contain:
- Keywords: `victron mppt` → `query`
- A tag or area filter: `#van`, `area:homestead` → `tag` / `area` (areas are `van`, `motorcycles`, `cycling`, `sailing`, `automotive`, `home-automation`, `homestead`, `spa-rpa`, `ai-learning`, `diy`, `family`, `work`, `general`)
- A type filter → `type`, one of: `learning`, `idea`, `research`, `how-to`, `project-note`
- A time hint: `last month`, `recent`, `this week` → `modified_within_days`
- Nothing specific → `list_recent`

## Steps

1. **Parse the request** into the tool arguments above. Prefer a broad `query` with one filter over a long keyword string — the ranking handles relevance.

2. **Call `search_notes`.** If the response comes back with `fallback: "recent"`, nothing matched: say that plainly and present the results as "here's what's recent instead", not as hits.

3. **Display matches** as a numbered list using the fields the tool returns (`title`, `date`, `areas`, `summary`). Cap at what the tool returned; don't pad.

   ```
   1. Victron MPPT charge profile for lithium bank
      2026-03-14 · van
      Worked out absorption voltage and tail current for the Battle Born bank.

   2. Solar panel wiring — series vs parallel
      2026-02-28 · van
      Compared tradeoffs given partial shade from the roof rack.
   ```

4. **Ask which one** (or ones) to load. Accept a number, several numbers, or "all".

5. **Call `read_note`** with the selected `path` and surface:
   - The **Resume Prompt** verbatim, prominently
   - The **Key Learnings** bullets
   - The **Ideas / Follow-ups** if present

6. **Offer to continue.** Say something like: "Ready to pick up here. Want me to start from the resume prompt, or do you have a different angle?"

## Guidelines

- If zero matches: broaden before reporting nothing found — drop the tag/area filter, or try fewer keywords — then try again.
- If the query is vague, it's fine to ask one clarifying question — but run the search first and show what you found.
- Recall is read-only. The server has no edit or delete tool; never try to "fix" a note from here.
- Results should fit on one screen. The `sections` from `read_note` include the whole note — surface the Resume Prompt and Key Learnings, not the raw body, unless the user asks for it.
