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

Narrow window (app start only) and strictly less lossy than the line key it replaced, hence filed rather than fixed in that ticket.

## Design

Options, none of them free:
- Wire the embed but recompute/repair its key once the cache resolves (`metadataCache.on("resolved"/"changed")`) — needs the store to be able to RENAME a key, which today it cannot (`src/foldStateStore.ts` is a bare Map).
- Defer wiring until the cache answers — delays the fold projection, and must not hang on a file that never gets a cache entry.
- Decide it is not worth fixing and simply document it (it is already documented on `EmbedFoldKeys` and in `CLAUDE.md`).

## Acceptance Criteria

An e2e that folds an embed in the first render after launch (no index wait) and re-renders, asserting the fold survives — or an explicit decision, recorded in the ticket, to keep the documented limitation.

