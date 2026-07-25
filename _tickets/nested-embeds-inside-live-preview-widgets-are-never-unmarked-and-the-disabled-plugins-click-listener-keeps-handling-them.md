---
id: nid_1ngosntduq5baizn9b7056h34_e
title: "Nested embeds inside Live Preview widgets are never unmarked, and the DISABLED plugin's click listener keeps handling them"
status: open
deps: []
links: [nid_78cl6bo3t8umqbndughsbjez9_e]
created_iso: 2026-07-25T00:44:48Z
status_updated_iso: 2026-07-25T00:44:48Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

`src/foldableEmbedsPostProcessor.ts:65-78` injects the foldable class, a chevron and a click listener with NO removal path, and `src/embedFoldDom.ts:80-90` shows reading mode passes no `AbortSignal`. `src/main.ts:34-36` only disconnects observers on unload. That was accepted because Obsidian DISCARDS reading-view DOM on plugin toggle — see the closed ticket `_tickets/reading-mode-post-processor-leaves-chevrons-behind-on-plugin-unload.md`.

But the post-processor also renders every embed BODY, including bodies inside LIVE PREVIEW widgets, and that DOM is Obsidian's and IS reused (exactly why `LivePreviewFoldView.destroy()` exists). `destroy()` (`src/livePreview/livePreviewFoldExtension.ts:53-62`) unmarks only `topLevelEmbeds()` (`:112-115`), so nested embeds keep everything.

MEASURED (LP on a parent embedding a child that embeds `sibling`, elements stamped to prove identity):
- nested folded: outer `{fenEmbed=true, chevrons=2}`, nested `{fenEmbed=true, fenFolded=true, chevrons=1}`
- after disabling the plugin: outer `{fenEmbed=false, chevrons=1}`, nested UNCHANGED — keeps `fen-embed`, `fen-folded` and its chevron (now an unstyled stray triangle, since styles.css is gone).
- clicking that nested title STILL folds it, via the DISABLED instance's listener. So the unloaded plugin object and its `FoldStateStore` stay retained, fold clicks are recorded into a store nobody reads, and the leaked `preventDefault()`/`stopPropagation()` means the click no longer opens the embedded note even with the plugin off.
- on re-enable, the leftover `fen-embed` class makes BOTH guards bail (`src/foldableEmbedsPostProcessor.ts:58` and `:143`), so the NEW instance can never rewire it.

The repo's own teardown assertion (`e2e/live-preview-foldable-embeds.e2e.ts:233`) would fail on a nested fixture; it passes only because that spec's note has no nested embeds.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Three parts, all small:
1. Give the post-processor a teardown: wrap per-section work in a `MarkdownRenderChild` via `ctx.addChild(...)` (or hand it a plugin-level `AbortController`) and call the existing `EmbedFoldDom.unmark` from its `onunload`; pass the signal into `EmbedFoldDom.onTitleClick` (it already accepts `AddEventListenerOptions`).
2. Stop using a CSS CLASS as the wiring guard (`:58`, `:143`) — a leftover class from a dead instance blocks rewiring. Use a `WeakSet` of wired embeds/titles, exactly as Live Preview already does and documents (`src/livePreview/livePreviewFoldExtension.ts:22-26`).
3. In `destroy()`, unmark ALL `.internal-embed` under `contentDOM`, not just top-level ones.

## Acceptance Criteria

- Add a NESTED-embed fixture to the Live Preview teardown test; after disabling the plugin, `.fen-embed` / `.fen-folded` / `.fen-collapse-icon` counts under `.cm-content` are 0, including the nested embed.
- After disable, clicking a nested embed's title does NOT fold it (no zombie listener) and behaves as unpatched Obsidian.
- After disable+re-enable, a nested embed is foldable again by one click (proves rewiring).
- lint, build and full e2e green.


## Notes

**2026-07-25T03:35:41Z**

MEASURED (Obsidian 1.12.7) while evaluating whether Live Preview could simply be deleted: with src/main.ts:30 (registerEditorExtension) commented out, the editor is NOT left untouched. In Live Preview the top-level embed gets nothing (fen-embed=false, 0 chevrons, title click is Obsidian's own behaviour) while the NESTED embed still gets fen-embed + a chevron and its title click still folds it — 1 of 2 embeds wired. The session FoldStateStore is also shared: a fold applied through the editor's widget DOM was still in effect when the note was reopened in reading mode. Consequences: (1) removing the LP extension degrades the feature into an inconsistent half-feature in Obsidian's DEFAULT editing mode rather than turning it off, and would additionally require scoping the post-processor out of editor DOM; (2) it reinforces this ticket — the post-processor genuinely needs its own teardown, because destroy() can never own those nested marks.

**2026-07-25T05:45:16Z**

REVIEW OUTCOME (review of 622a483: SHIP WITH FIXES).

1. Part 3 (`LivePreviewFoldView.destroy()` should unmark ALL embeds, nested included) is
   deliberately NOT implemented, and the reviewer accepted the rejection. WHY, so it is not
   "re-fixed" later: (a) redundant — an embed carries this instance's marks iff a live
   `FoldableEmbedMark` sits in the post-processor registry, and `teardown()` unloads them all;
   (b) actively harmful — `destroy()` also runs while the plugin is ALIVE (view recreation),
   and unmarking a nested embed there strips `fen-embed`/chevron out from under a still-live
   post-processor listener, leaving an embed that looks unfoldable but still toggles
   `fen-folded` (styles.css collapses on `.fen-folded > .markdown-embed-content` without
   requiring `.fen-embed`). Live Preview must not undo marks it did not make.

2. KNOWN LIMITATION on acceptance criterion 3 ("nested embed foldable again after re-enable"),
   MEASURED on Obsidian 1.12.7: it holds only after the note is REOPENED. A preview<->source
   round trip REUSES an already-rendered embed body, so the re-enabled plugin's post-processor
   is never invoked over it. Since a plugin UPDATE is a disable+enable, after an update a
   user's open notes have nested embeds that are silently not foldable until reopened.
   Live Preview top-level embeds do not have this (registerEditorExtension rebuilds open
   editors), so the inconsistency is user-visible. Follow-up filed: "adopt already-rendered
   embeds on plugin load". Human should confirm this ship-state for AC3 before closing.
