---
closed_iso: 2026-07-24T22:51:05Z
id: nid_tto6kyjdm8dsi86mvvnqey2sh_e
title: "Reading mode: post-processor leaves chevrons behind on plugin unload"
status: closed
deps: []
links: []
created_iso: 2026-07-24T22:25:18Z
status_updated_iso: 2026-07-24T22:51:05Z
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


## Notes

**2026-07-24T22:51:05Z**

Not reproducible on Obsidian 1.12.7: MEASURED that toggling the plugin makes Obsidian discard the rendered reading-view DOM entirely (elements stamped with a data attribute before the disable are all detached afterwards), so no chevron/fold-class remnant is ever user-visible. No unmark-on-unload path added — a registry/sweep would be complexity for a defect that does not exist (unlike Live Preview, whose embed DOM Obsidian REUSES, which is why its ViewPlugin.destroy() must unmark). The acceptance criterion is now covered as an OUTCOME test in e2e/foldable-embeds.e2e.ts ('disabling the plugin leaves no injected DOM in the reading view'), which will start failing if a future Obsidian begins reusing reading-view DOM.

**2026-07-25T05:45:19Z**

CROSS-REFERENCE (does not reopen this ticket). The conclusion here — a genuine READING VIEW's
DOM is discarded wholesale on plugin unload, so reading mode needed no removal path — is still
true. But ticket nid_1ngosntduq5baizn9b7056h34_e found the case this one did not cover: the
post-processor also renders embed BODIES inside LIVE PREVIEW widgets, and that DOM is Obsidian's
and REUSED. Reading mode therefore now DOES have a real unmark path (`src/foldableEmbedMark.ts` +
`FoldableEmbedsPostProcessor.teardown()`), so do not read this closed ticket as contradicting
the code.
