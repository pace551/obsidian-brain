---
name: obsidian-recall
description: Use this skill when the user wants to find, search, or resume prior work captured in their Obsidian vault. TRIGGER on phrases like "recall from obsidian", "find my notes on X", "search my obsidian", "what did I capture about X", "resume the X thread", "pick up where we left off on X", "what was I doing with X", "pull up my notes on X", "obsidian recall", or any request to retrieve prior captured context. Also fires when user types `/obsidian-recall`. Searches `~/Documents/Obsidian/Personal/` with ripgrep, shows ranked matches, and loads the selected note's Resume Prompt + Key Learnings back into the session.
---

# obsidian-recall

Find and resume prior work captured in the user's Obsidian vault.

## Vault location

`~/Documents/Obsidian/Personal/` — search across all subfolders (Inbox, Areas, Resources, Archive).

## Query interpretation

The user's request may contain:
- Keywords: `victron mppt`
- A tag or area filter: `#van`, `area:homestead`
- A time hint: `last month`, `recent`, `this week`
- Natural language: `what was I doing with the mortgage RPA`
- Nothing specific → show the 10 most recently modified notes

## Steps

1. **Parse the request.** Extract keywords, any `#tag` / `area:X` filters, and any date hints.

2. **Search the vault** using ripgrep for speed. Search matches against:
   - Filename
   - Frontmatter (`areas`, `tags`, `type`, `date`)
   - Note body (especially `## Summary` and `## Key Learnings`)

   Starting pattern:
   ```bash
   rg -l --type md -i "<keywords>" ~/Documents/Obsidian/Personal/
   ```

   If the query has a date hint, also filter by file modification time:
   ```bash
   find ~/Documents/Obsidian/Personal/ -name "*.md" -mtime -30
   ```

   If no query, list the 10 most recently modified `.md` files.

3. **Rank results.** Prefer: exact title/tag matches > frontmatter matches > Summary section hits > body hits. Cap at 10 results.

4. **Display matches** as a numbered list. For each:
   - Number
   - Title (the `# Heading` in the note, or filename if missing)
   - Date + primary area
   - One-line summary (first sentence of the `## Summary` section)

   Example:
   ```
   1. Victron MPPT charge profile for lithium bank
      2026-03-14 · van
      Worked out absorption voltage and tail current for the Battle Born bank.

   2. Solar panel wiring — series vs parallel
      2026-02-28 · van
      Compared tradeoffs given partial shade from the roof rack.
   ```

5. **Ask which one** (or ones) to load. Accept a number, several numbers, or "all".

6. **Read the selected note(s)** with the Read tool and surface:
   - The **Resume Prompt** verbatim, prominently
   - The **Key Learnings** bullets
   - The **Ideas / Follow-ups** if present

7. **Offer to continue.** Say something like: "Ready to pick up here. Want me to start from the resume prompt, or do you have a different angle?"

## Guidelines

- Default to ripgrep (`rg`) — fast and handles markdown well.
- If zero matches: broaden the search (drop tag filters, try partial-word matches) and try again before reporting nothing found.
- If the query is vague, it's fine to ask one clarifying question — but try the search first and show what you found.
- Never modify notes as a side effect of recall. When the user asks to change a note, use the obsidian-brain `update_note` tool (after `read_note` for its `hash`, and after the user confirms the change) rather than Write/Edit on the file — it keeps the note format and refuses hand-written notes and notes that changed underneath you.
- Results should fit on one screen. Don't dump entire note bodies into the conversation unless asked — the Resume Prompt + Key Learnings is usually enough to continue.
