---
id: nid_zf4num1ja4c9tpwpgj672ijgn_e
title: "Reading mode: a fold made before Obsidian finishes indexing the vault is lost on the next render"
status: open
deps: []
links: [nid_7qbtubxk89team9oadnl3hanr_e]
created_iso: 2026-07-25T06:28:41Z
status_updated_iso: 2026-07-25T06:28:41Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

MEASURED on Obsidian 1.12.7 while implementing nid_7qbtubxk89team9oadnl3hanr_e.

`src/embedFoldKeys.ts` identifies a reading-mode embed by its OCCURRENCE, read from `app.metadataCache` via the `ReadEmbeds` port wired in `src/main.ts`. For the first render(s) after Obsidian launches, `metadataCache.getCache(path)` returns null (the vault index is still being built), so those embeds get the WEAK positional fallback key (`sourcePath::L<line>::<src>::#<index>`). A fold made in that window is therefore dropped by the next render, which keys the same embed by occurrence.

Evidence: with a temporary `console.log` in `EmbedFoldKeys.keyFor`, 1 full e2e run in 4 logged `"cached":null,"embeds":[]` for `parent.md` on the FIRST render after boot, and the pre-existing test `e2e/foldable-embeds.e2e.ts` "fold state survives leaving the note and coming back" failed in exactly those runs. `ObsidianHarness.openFile` (e2e/obsidianHarness.ts) now waits for `metadataCache.getCache(path) !== null` so the suite stops racing the index — that makes the SUITE deterministic, it does not fix the product behaviour.

Narrow window (app start only), but a REGRESSION against the line key it replaced, which was cache-independent and kept that fold. Filed rather than fixed in that ticket; see the note below for the fix.

## Design

Options, none of them free:
- Wire the embed but recompute/repair its key once the cache resolves (`metadataCache.on("resolved"/"changed")`) — needs the store to be able to RENAME a key, which today it cannot (`src/foldStateStore.ts` is a bare Map).
- Defer wiring until the cache answers — delays the fold projection, and must not hang on a file that never gets a cache entry.
- Decide it is not worth fixing and simply document it (it is already documented on `EmbedFoldKeys` and in `CLAUDE.md`).

## Acceptance Criteria

An e2e that folds an embed in the first render after launch (no index wait) and re-renders, asserting the fold survives — or an explicit decision, recorded in the ticket, to keep the documented limitation.


## Notes

**2026-07-25T06:52:07Z**

FIXED under nid_7qbtubxk89team9oadnl3hanr_e (review iteration 1) — kept open only for the human to confirm the close.

The occurrence key now also reports the positional key it SUPERSEDES (`EmbedFoldKey.superseded`, src/embedFoldKeys.ts), and `FoldStateStore.adoptRecordingOf` (src/foldStateStore.ts) moves a fold recorded under the cold-cache positional key onto the occurrence key on the first render that can derive one, deleting the old entry so nothing else inherits it. Option 1 of the design, without the metadata-cache event: the takeover needs no notification, only the next render.

`ObsidianHarness.openFile`'s index wait is REVERTED, so the acceptance criterion is met by the pre-existing e2e `e2e/foldable-embeds.e2e.ts` "fold state survives leaving the note and coming back", which races the index by construction. MEASURED on Obsidian 1.12.7: that test was red in 2 of 6 runs before the fix; after it, 8 of 8 green, and instrumentation showed the takeover firing (`parent.md::L4::child::#0` -> `parent.md::occ::child::#0`) in 2 of 6 runs — the same proportion, i.e. the previously-failing path is the one now repaired.

REMAINING (documented on EmbedFoldKeys, not a regression against the line key): a fold made during the cold window AND followed by an edit before any re-render can still land on whatever embed now occupies that line — exactly what the line key did unconditionally.

Also corrected here: the claim "strictly less lossy than the line key it replaces" in this ticket's body was FALSE and is retracted.
