---
date: 2026-03-14
type: how-to
areas: [van, homestead]
tags: ["victron", 'mppt', lithium-battery]
source: claude
status: inbox
custom_key: kept-as-extra
---

# Victron MPPT charge profile for the lithium bank

## Summary

Worked out absorption voltage and tail current for the Battle Born bank. It matters
because the factory profile was cooking the cells.

## Key Learnings

- Absorption at 14.4 V, tail current 5 A
- The MPPT's lithium preset assumes a 100 Ah bank

## Resume Prompt

> Paste into a new Claude session to continue.

I was setting the Victron MPPT charge profile for a 200 Ah Battle Born bank.

## Context

The batteries were getting warm on long solar days.
