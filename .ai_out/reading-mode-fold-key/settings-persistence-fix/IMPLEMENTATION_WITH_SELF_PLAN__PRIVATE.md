# PRIVATE working memory — reading-mode fold key

Status: **DONE**. Ticket `nid_7qbtubxk89team9oadnl3hanr_e` left OPEN (in_progress) per instructions;
a note was added to it. No change_log entry written (TOP_LEVEL_AGENT owns that).

## Plan, as executed

1. Read exploration docs (they were accurate; re-explored nothing except the obsidian `.d.ts`).
2. Wrote `e2e/reading-mode-fold-key.e2e.ts` FIRST; ran it; both tests failed on
   `expectFolded(nth(0), true)` after the re-render. Committed as `e5970b3`.
3. Implemented `src/embedFoldKeys.ts`; wired through the post-processor and `main.ts`.
4. Full suite → the pre-existing reopen test flaked; instrumented, measured, root-caused
   (cold metadata cache at boot); harness readiness wait + ticket + docs.
5. lint / build / 7× full e2e. Committed as `83a79a6`.

## Working notes worth keeping

- `tsconfig` has `noUncheckedIndexedAccess`: `embeds[i]` is `T | undefined`. That is why
  `scanForOccurrence` is a single `for…of` pass carrying a `Map<link, count>` instead of an
  index-then-lookup. Do not "simplify" it back.
- Serial mode means a failing test SKIPS the rest of the file; to see test 2 fail I ran
  `npm run test:e2e -- reading-mode-fold-key.e2e.ts -g "does not move the fold"`.
- Instrumentation recipe (repeat if ever needed): `console.log("FENDEBUG", JSON.stringify(...))`
  in `EmbedFoldKeys.keyFor`, plus `page.on("console", …)` in the spec's `beforeAll`, then
  `npm run test:e2e`. Obsidian renderer console reaches Playwright. Remove both afterwards
  (`git checkout` the spec; the src edit was scripted out with python).
- Full-suite flake rate BEFORE the harness wait: 1 failure in 4 runs, always
  `foldable-embeds.e2e.ts:130`. AFTER: 0 in 7.
- `renderedSectionText` is `""` for the ref-parent sections at wiring time (embed body not yet in
  `textContent`) — another reason the `S<hash>` fallback is weak. Only reachable when
  `getSectionInfo` returns null, which nothing in the suite reproduces.

## If picked up again

- The obvious next unit of work is the follow-up ticket `nid_zf4num1ja4c9tpwpgj672ijgn_e`
  (cold cache). It needs `FoldStateStore` to grow a rename/delete, which also unblocks
  `nid_z4jq8me8mhstojozeua8fufdr_e`. Decide the store's API once, for both.
- `EmbedFoldKeys` is the natural first test subject when the unit runner lands
  (`nid_lcehddb2tdcq6qxztmhvhpgga_e`): construct it with a literal `EmbedCache[]`, no DOM.
