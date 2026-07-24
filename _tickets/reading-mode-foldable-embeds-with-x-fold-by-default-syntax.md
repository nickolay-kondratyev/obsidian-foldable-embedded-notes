---
closed_iso: 2026-07-24T18:47:16Z
id: nid_66x3rkvxdjjaddrtm9u0v72ah_e
title: "Reading-mode foldable embeds with ![[x]]- fold-by-default syntax"
status: closed
deps: []
links: []
created_iso: 2026-07-24T17:59:47Z
status_updated_iso: 2026-07-24T18:47:16Z
type: feature
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [reading-mode, core]
---

## Goal
Make embedded notes (`![[note]]`) foldable in READING MODE, with `![[note]]-` marking an embed folded by default. Approach is FULLY VALIDATED by throwaway prototyping against real Obsidian 1.12.7 via the repo e2e harness (see PROTOTYPE-VALIDATED FACTS below) — implementation risk is low.

## Product decisions (confirmed with Human 2026-07-24)
- Fold UI: reuse the NATIVE `.markdown-embed-title` bar as click target + add a rotating collapse chevron (callout-like). Force the title bar visible on foldable embeds even when a theme hides it.
- Fold-state persistence: SESSION MEMORY only — in-memory store, survives re-renders/mode switches, resets on app restart. The `-` syntax is the default on first render of a session; the store overrides after user interaction.
- Marker parsing: STRICT — `-` counts as fold marker ONLY when immediately after `]]` AND followed by whitespace or end-of-line. `![[x]]-like` keeps its literal dash.
- No settings tab, no ribbon/status-bar UI for v1 (commands come in a separate ticket).
- Live Preview / editing mode: OUT OF SCOPE for v1 (the `-` shows literally there; documented limitation, follow-up ticket exists).

## PROTOTYPE-VALIDATED FACTS (real Obsidian 1.12.7, all e2e-proven)
1. Reading view renders `![[child]]` as `span.internal-embed.markdown-embed.inline-embed` (attr `src="child"`) inside `p`, containing: `div.embed-title.markdown-embed-title` (text = note name), `div.markdown-embed-content` (rendered child note), `div.markdown-embed-link` (open icon).
2. `![[child]]-` renders as that SAME span followed by a literal `-` TEXT NODE (nodeType 3) as `nextSibling` — the marker is detectable and strippable in the postprocessor, no parser hooks needed.
3. A plugin `registerMarkdownPostProcessor((el, ctx) => ...)` fires WITH the embed span already present in `el` (embed content itself loads async — irrelevant, we only touch the container).
4. CSS `.fen-folded > .markdown-embed-content { display: none; }` collapses embed 188px -> 24px; the title bar stays visible.
5. Real pointer click on `.markdown-embed-title` (with preventDefault+stopPropagation to suppress embed navigation) toggles the class — verified via Playwright click.

## Design
Modules (keep src/main.ts lifecycle-only per repo CLAUDE.md):
- `src/main.ts`: onload registers the postprocessor; strip ALL sample-plugin scaffolding (ribbon, status bar, sample commands/modal). Keep settings.ts plumbing only if trivially small — v1 has NO settings; prefer deleting `src/settings.ts` and the tab entirely.
- `src/foldableEmbedsPostProcessor.ts`: finds `span.internal-embed.markdown-embed` in the section el; STRICT marker parse on nextSibling text node (strip leading `-` only if followed by whitespace/EOL); applies initial fold state (session store wins over syntax default); injects chevron `span.collapse-icon` into `.markdown-embed-title` via obsidian `setIcon(el, "right-triangle")` and toggles `is-collapsed` like core callouts; click handler on title toggles fold + records into store. Skip NON-note embeds (images/PDF): only elements with `.markdown-embed` class.
- `src/foldStateStore.ts`: session-scoped Map. Key: `ctx.sourcePath + "::" + sectionLineStart + "::" + src` (use `ctx.getSectionInfo(el)?.lineStart`; fall back to occurrence index within file if section info is null). Plain class, no persistence.
- `styles.css`: `.fen-folded > .markdown-embed-content { display: none; }`; cursor:pointer on title; chevron rotation (`.collapse-icon.is-collapsed svg` transform, consistent with core); force `.fen-embed .markdown-embed-title { display: flex; }` (or equivalent) so theme-hidden titles stay clickable.

## Edge cases to cover
- Multiple embeds of the same note in one file (independent fold state — key includes line/occurrence).
- `![[note#heading]]-` and `![[note^block]]-` (src attr carries the ref; marker logic identical).
- `![[x]]-like` NOT folded, dash preserved (strict rule).
- Marker `-` at end of line vs followed by space + text.
- Image/media embeds must be untouched.
- Re-render (mode switch preview->source->preview): manual fold state restored from session store.

## Testing (e2e harness already in repo: e2e/obsidianHarness.ts, run via `npm run test:e2e`)
Create `e2e/foldable-embeds.e2e.ts` (serial, one Obsidian instance; use `ObsidianHarness.launch({extraFixtures})` for marker-variant notes; force reading mode via `leaf.setViewState` with `state.mode = "preview"` — pattern proven in prototyping):
- unmarked embed renders unfolded; `![[child]]-` renders folded AND no visible `-` remains
- strict-marker negative case (`![[child]]-x` stays unfolded, dash visible)
- click title folds/unfolds (real pointer click)
- fold survives mode switch within session (store)
- chevron element present and rotates (class assertion)
Note: `.dev-vault/parent.md` fixture already contains both `![[child]]` and `![[child]]-`.

## Acceptance
- `npm run build` and `npm run lint` clean; all e2e green (`npm run test:e2e`).
- Sample-plugin scaffolding removed; main.ts lifecycle-only.

## Acceptance Criteria

Reading mode: unmarked embeds foldable via title-bar click with chevron; ![[x]]- folded by default with marker hidden; strict marker rule honored; session fold-state survives re-renders; e2e suite green; lint+build clean; sample scaffolding removed.

