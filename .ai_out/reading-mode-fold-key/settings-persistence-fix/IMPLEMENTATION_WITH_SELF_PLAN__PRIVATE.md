# PRIVATE working memory — reading-mode fold key

Status: **DONE through review iteration 1**. Ticket `nid_7qbtubxk89team9oadnl3hanr_e` left OPEN
per instructions (notes added). No change_log entry (TOP_LEVEL_AGENT owns that).

## Iteration 1 (fresh instance) — plan, as executed

1. Rehydrated; read the review. Concluded B1 was right and worth fixing in the PRODUCT.
2. Reverted the harness index wait FIRST, then re-measured the flake: 2 red in 6 runs of
   `foldable-embeds.e2e.ts` — that IS the failing-first evidence (a pre-existing behaviour test).
3. Implemented the takeover (`EmbedFoldKey.superseded` + `FoldStateStore.adoptRecordingOf`).
4. 8 green runs; then instrumented `adoptRecordingOf` to PROVE it fires in the runs that used to
   fail (2 of 6, same proportion, `L4` → `occ`). Removed instrumentation.
5. Doc fixes (S2/S3/S5/S6 + NITs), third e2e case, 4 full-suite runs, ticket notes.

## Working notes worth keeping

- **NEVER `git checkout <file>` to undo temporary instrumentation while that file has real
  uncommitted work** — it wiped every edit to `src/embedFoldKeys.ts` and they had to be redone.
  Use `cp file .tmp/file.backup` and copy back.
- `tsconfig` has `noUncheckedIndexedAccess`: `embeds[i]` is `T | undefined`. That is why
  `scanForOccurrence` is a single `for…of` pass carrying a `Map<link, count>`.
- Serial mode SKIPS the rest of a file after a failure; to exercise test N alone use
  `npm run test:e2e -- <file> -g "<substring>"`.
- Instrumentation recipe: `console.log("FENDEBUG", …)` in src + `page.on("console", …)` in the
  spec's `beforeAll`; renderer console reaches Playwright. Patch/unpatch with python.
- To prove a fold-key e2e can actually fail, force the fallback path:
  `const cached = null as CachedOccurrence | null; void this.cachedOccurrenceOf;` in `keyFor`.
  That is a faithful simulation of the old line key.
- Each spec FILE launches its own Obsidian, so the boot/cold-cache window is per file. Cold hits
  `foldable-embeds.e2e.ts` (opens in `beforeAll`) but measured 0/6 in
  `reading-mode-fold-key.e2e.ts` (opens inside the first test).
- Timings: `foldable-embeds.e2e.ts` ~35 s per run, full suite ~60 s.

## If picked up again

- `FoldStateStore` now has ONE mutation beyond get/set (`adoptRecordingOf`). If
  `nid_z4jq8me8mhstojozeua8fufdr_e` needs per-file invalidation, design that API alongside it.
- `EmbedFoldKeys` + `adoptRecordingOf` are the natural first subjects when the unit runner lands
  (`nid_lcehddb2tdcq6qxztmhvhpgga_e`): both are pure over injected data, no DOM.
