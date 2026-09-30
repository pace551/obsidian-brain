---
name: obsidian-capture
description: Use this skill when the user wants to save the current Claude session (or a part of it) to their Obsidian vault as a structured note. TRIGGER on phrases like "save this to obsidian", "capture this in obsidian", "save to my notes", "obsidian capture", "capture this session", "save this conversation", "put this in my vault", "save the learnings", or any request to write a summary/takeaway to Obsidian. Also fires when user types `/obsidian-capture`. Writes a note with frontmatter, Key Learnings, Ideas, a first-person Resume Prompt, and Context to `~/Documents/Obsidian/Personal/Inbox/`.
---

# obsidian-capture

Save the useful content of this conversation to the user's Obsidian vault so it can be found and resumed later.

## Vault location

`~/Documents/Obsidian/Personal/Inbox/`

Files are named `YYYY-MM-DD <slug-title>.md` where the date is today and the slug is 3-6 lowercase words, hyphenated.

## Arguments / scope

If the user's request includes a scope hint (e.g. "just the Victron MPPT part", "focus on the mortgage RPA idea"), narrow the capture to that scope. Otherwise summarize the whole session.

## Steps

1. **Read the conversation.** Identify the substantive content worth keeping: insights, decisions, research findings, ideas sparked, how-to steps, snippets that took real thought to arrive at. Skip pleasantries, failed tangents, and routine tool output.

2. **Classify.** Pick:
   - `type` — one of: `learning`, `idea`, `research`, `how-to`, `project-note`
   - `areas` — one or more from: `van`, `motorcycles`, `cycling`, `sailing`, `automotive`, `home-automation`, `homestead`, `spa-rpa`, `ai-learning`, `diy`, `family`, `work`, `general`
   - `tags` — freeform lowercase topic tags, hyphenated (e.g. `victron`, `mppt`, `lithium-battery`). Distinct from areas — these are specific topics, not life domains.

3. **Draft the note** in this exact format:

```markdown
---
date: <today in YYYY-MM-DD>
type: <type>
areas:
  - <area>
tags:
  - <tag>
source: claude
status: inbox
---

# <Concise descriptive title, sentence case>

## Summary
2-3 sentences on what this session was about and why it matters.

## Key Learnings
- Main insight — concrete, specific, reusable
- Supporting detail or nuance
- Another keeper

## Ideas / Follow-ups
- Thing this sparked worth exploring
- Open question not yet answered
(Omit this section if there's nothing worth listing — don't pad.)

## Resume Prompt
> Paste into a new Claude session to continue.

I was exploring <specific topic>. We established <key conclusion 1> and <key conclusion 2>. The open thread is <specific question or next step>. Relevant context: <versions, configs, constraints that matter>. Pick up from <concrete jumping-off point>.

## Context
One short paragraph on what prompted this — the problem, situation, or question that kicked off the session.
```

4. **Show the user the full draft** before writing. Ask if they want to adjust the title, type, areas, tags, or any section.

5. **Once confirmed, write the file** to `~/Documents/Obsidian/Personal/Inbox/<YYYY-MM-DD> <slug>.md` using the Write tool.

6. **Confirm with the file path** so they know where it landed.

## Guidelines

- Write the resume prompt in **first person** ("I was exploring…"). It's a note from past-you to future-you.
- The resume prompt should be **dense**. Assume whoever reads it (human or Claude) has zero context — every sentence must carry weight.
- Use specific names, versions, numbers. Avoid hedging language.
- If the session produced nothing worth keeping, say so and don't create a note. Don't fabricate value.
- Never write to a path outside `~/Documents/Obsidian/Personal/Inbox/`.
