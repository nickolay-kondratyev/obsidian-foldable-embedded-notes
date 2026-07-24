---
id: nid_tto6kyjdm8dsi86mvvnqey2sh_e
title: "Reading mode: post-processor leaves chevrons behind on plugin unload"
status: open
deps: []
links: []
created_iso: 2026-07-24T22:25:18Z
status_updated_iso: 2026-07-24T22:25:18Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

`src/foldableEmbedsPostProcessor.ts` injects a chevron, fold classes and a title-click handler into embed DOM, but has no unload-time removal (the Live Preview extension does, via its ViewPlugin `destroy()` calling `EmbedFoldDom.unmark`).

Consequence: disabling the plugin can leave a dead chevron on already-rendered embeds until the view re-renders. Pre-existing behaviour (not introduced by the Live Preview work), surfaced by IMPLEMENTATION_REVIEWER during the Live Preview review — see `.ai_out/live-preview-foldable-embeds/master/IMPLEMENTATION_REVIEW__PUBLIC.md`.

## Design

Reuse the existing `EmbedFoldDom.unmark` (in `src/embedFoldDom.ts`). Needs a way to reach the marked elements on unload — e.g. track them, or sweep the reading views on `onunload`. Keep it simple; do not add a registry if a sweep suffices.

## Acceptance Criteria

- After disabling the plugin, no `.fen-collapse-icon` / `.fen-folded` / `.fen-embed` remnants stay in reading-mode DOM.
- e2e test asserts the count is 0 while the plugin is disabled (mirror the Live Preview teardown test pattern).
- lint, build and full e2e suite green.

