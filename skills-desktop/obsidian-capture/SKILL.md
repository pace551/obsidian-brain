---
name: obsidian-capture
description: Use this skill when the user wants to save the current Claude session (or a part of it) to their Obsidian vault as a structured note. TRIGGER on phrases like "save this to obsidian", "capture this in obsidian", "save to my notes", "obsidian capture", "capture this session", "save this conversation", "put this in my vault", "save the learnings", or any request to write a summary/takeaway to Obsidian. Writes the note through the obsidian-brain MCP server's `capture_note` tool.
---

# obsidian-capture (Desktop / claude.ai)

Save the useful content of this conversation to the user's Obsidian vault so it can be found and resumed later.

## How writing works here

This variant has no filesystem access. Notes are written by the **`capture_note` tool** from the **obsidian-brain** MCP server, which owns the filename, the frontmatter, and the section layout. Do not hand-format markdown and do not ask the user to paste a note anywhere — pass the fields and let the server render them.

If the obsidian-brain tools are not available, say so plainly and stop: the server is a local stdio process configured in Claude Desktop, so it cannot be reached from a session that does not have it connected. Do not fall back to printing the note and calling it saved.

## Arguments / scope

If the user's request includes a scope hint (e.g. "just the Victron MPPT part", "focus on the mortgage RPA idea"), narrow the capture to that scope. Otherwise summarize the whole session.

## Steps

1. **Read the conversation.** Identify the substantive content worth keeping: insights, decisions, research findings, ideas sparked, how-to steps, snippets that took real thought to arrive at. Skip pleasantries, failed tangents, and routine tool output.

2. **Classify.** Pick:
   - `type` — one of: `learning`, `idea`, `research`, `how-to`, `project-note`
   - `areas` — one or more from: `van`, `motorcycles`, `cycling`, `sailing`, `automotive`, `home-automation`, `homestead`, `spa-rpa`, `ai-learning`, `diy`, `family`, `work`, `general`
   - `tags` — freeform lowercase topic tags, hyphenated (e.g. `victron`, `mppt`, `lithium-battery`). Distinct from areas — these are specific topics, not life domains.

   The server enforces these lists. An invented area or type comes back as a validation error, not a note.

3. **Draft the capture** and show the user what each field will contain:

   | Field | Contents |
   |---|---|
   | `title` | Concise descriptive title, sentence case |
   | `type` / `areas` / `tags` | From step 2 |
   | `summary` | 2-3 sentences on what this session was about and why it matters |
   | `key_learnings` | Bullets — concrete, specific, reusable. At least one. |
   | `ideas` | Follow-ups and open questions. Omit entirely if there's nothing worth listing — don't pad. |
   | `resume_prompt` | First-person paragraph to paste into a future session |
   | `context` | One short paragraph on what prompted this |

4. **Ask if they want to adjust** the title, type, areas, tags, or any section before writing.

5. **Once confirmed, call `capture_note`** with those fields. Leave `slug` and `date` unset unless the user asked for a specific filename or is backdating the note.

6. **Confirm with the `path`** the tool returns so they know where it landed. If the path came back with a `-2` suffix, mention it — that means a note with the same title already existed today.

## Guidelines

- Write the resume prompt in **first person** ("I was exploring…"). It's a note from past-you to future-you.
- The resume prompt should be **dense**. Assume whoever reads it (human or Claude) has zero context — every sentence must carry weight.
- Use specific names, versions, numbers. Avoid hedging language.
- If the session produced nothing worth keeping, say so and don't create a note. Don't fabricate value.
- The tool writes to the vault's `Inbox/` only, and never overwrites an existing note. There is no delete or edit tool — a wrong note has to be fixed in Obsidian, so get confirmation before writing.
