---
id: nid_78cl6bo3t8umqbndughsbjez9_e
title: "Reading mode: unresolved embeds accumulate MutationObservers without bound"
status: open
deps: []
links: [nid_1ngosntduq5baizn9b7056h34_e]
created_iso: 2026-07-25T00:44:49Z
status_updated_iso: 2026-07-25T00:44:49Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

`whenMarkdownEmbedReady` (`src/foldableEmbedsPostProcessor.ts:142-169`) registers an observer for any embed lacking `.markdown-embed`, and disconnects it only when a title appears or when a MUTATION reveals a media class (`:158`). An unresolved `![[typo]]` renders as `internal-embed is-loaded file-embed mod-empty` — and `file-embed` is NOT in `MEDIA_EMBED_CLASSES` (`:11`), so nothing ever disconnects it. `liveObservers` keeps it (plus the closure over `embed`, `ctx`, `sectionEl`) until unload. The `isMediaEmbed` check also never runs on the synchronous path (`:146-150`).

MEASURED: a note with two unresolved embeds, re-rendered three times -> live observers 2 -> 4 -> 6, monotonic, each retaining a detached section subtree. (Media embeds measured CLEAN: 0 growth, because Obsidian does mutate them afterwards.)

The doc comment at `:33` anticipates "a never-resolving `![[missing]]`" but not the per-re-render accumulation.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Two small changes:
1. Bail BEFORE creating the observer when the embed is already a resolved non-note embed — add `file-embed` to the non-note class list and run that check on the synchronous path too.
2. Tie each observer's life to its render rather than to plugin unload: `ctx.addChild(new MarkdownRenderChild(el))` whose `onunload` disconnects. This is the same hook the nested-embed teardown ticket needs — do them together if convenient.

## Acceptance Criteria

- Re-rendering a note containing `![[does-not-exist]]` several times does not grow the number of live observers.
- Resolved note embeds and media embeds still behave exactly as today.
- lint, build and full e2e green.

