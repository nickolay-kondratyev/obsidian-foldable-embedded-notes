---
id: nid_ne6tlgiyeftt2vhvjj24zcqgu_e
title: "Commands: fold all / expand all embedded notes (reading mode)"
status: open
deps: [nid_66x3rkvxdjjaddrtm9u0v72ah_e]
links: []
created_iso: 2026-07-24T18:00:00Z
status_updated_iso: 2026-07-24T18:00:00Z
type: feature
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [reading-mode, commands]
---

## Goal
Two command-palette commands (NO extra UI — advanced-user feature, per Human decision 2026-07-24):
- `fold-all-embeds` — "Fold all embedded/transcluded notes"
- `expand-all-embeds` — "Expand all embedded/transcluded notes"

Depends on the core foldable-embeds ticket (postprocessor + fold classes + session store must exist).

## Prototype-validated facts (real Obsidian 1.12.7)
- Adding/removing the fold class on every `.markdown-reading-view span.internal-embed.markdown-embed` element folds/unfolds them all — e2e-proven, including driving via `app.commands.executeCommandById("foldable-embedded-notes:<id>")` (harness `runCommand`).

## Design
- Add to `src/main.ts` via `this.addCommand` with `checkCallback` gated on an active MarkdownView in preview mode (command hidden otherwise).
- Scope: ACTIVE note reading view only.
- Must go through the core fold API (e.g. a method on the postprocessor/controller that also updates `src/foldStateStore.ts`) so folded-by-command state is consistent with click-toggled state and survives re-render. Do NOT bypass the store with raw DOM-only class flips.
- Command IDs are stable API once released — use exactly `fold-all-embeds` / `expand-all-embeds`.

## Testing
Extend `e2e/foldable-embeds.e2e.ts`: `harness.runCommand(...)` then assert all embeds folded / all expanded (locator counts), and that a subsequent re-render (mode switch) preserves the command-set state via the session store.

## Acceptance Criteria

Both commands appear in palette only for active reading view; fold/expand every note embed in the active view; state consistent with session store across re-render; e2e coverage green; stable command IDs.

