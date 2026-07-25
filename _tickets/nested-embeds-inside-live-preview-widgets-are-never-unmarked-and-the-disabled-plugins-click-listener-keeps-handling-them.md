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

