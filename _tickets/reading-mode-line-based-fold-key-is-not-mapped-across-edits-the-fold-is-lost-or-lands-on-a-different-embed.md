---
id: nid_7qbtubxk89team9oadnl3hanr_e
title: "Reading mode: line-based fold key is not mapped across edits — the fold is lost, or lands on a DIFFERENT embed"
status: in_progress
deps: []
links: [nid_zqaxj18jbxwnazzz8aeggz91u_e, nid_zf4num1ja4c9tpwpgj672ijgn_e]
created_iso: 2026-07-25T00:44:48Z
status_updated_iso: 2026-07-25T06:11:15Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

The reading-mode fold key embeds the raw source line (`src/foldableEmbedsPostProcessor.ts:127`, `ctx.getSectionInfo(sectionEl)?.lineStart`). Unlike Live Preview's `RangeSet` (whose positions map through changes — see `src/livePreview/foldStateField.ts:22-28`), nothing maps this line across an edit, so an edit ABOVE an embed silently re-assigns identity.

MEASURED:
- LOSS: reading mode -> fold an embed -> switch to editing, insert two lines at the top -> back to reading -> the embed is UNFOLDED.
- MISATTRIBUTION: `shift.md` with `![[g]]` at line 2 (A) and line 4 (B). Fold A, delete the heading+blank above, re-render -> `#0=false #1=true`: A is expanded and B, which the user never touched, is folded.

The doc comment at `:112-119` currently claims the source line is "stable across re-renders" without noting that any edit above reassigns it.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Key the OCCURRENCE rather than the line — e.g. `sourcePath::src::#nthOccurrenceOfThatSrcInTheFile`, derivable from `metadataCache.getFileCache(file).embeds` ordering, which is stable under insertions and deletions above.

80/20 alternative if that is judged too costly: keep the line-based key but FIX THE DOC so the tradeoff is explicit (fold state is lost by edits above the embed). Do not leave the current comment, which overstates stability. Note this ticket interacts with the nested-embed key ticket — decide the key shape once, for both.

## Acceptance Criteria

- Fold an embed, insert lines above it, re-render: the SAME embed is still folded and no other embed changed state. (Or, if the documented-tradeoff route is chosen: the doc states it and an e2e pins the actual behaviour.)
- e2e coverage for "fold, then edit above, then re-render" — currently absent from the suite.
- lint, build and full e2e green.


## Notes

**2026-07-25T06:28:48Z**

Implemented the occurrence key (src/embedFoldKeys.ts + ReadEmbeds port from src/main.ts); e2e/reading-mode-fold-key.e2e.ts covers both measured scenarios and was failing-first. Cold-metadata-cache window at app launch filed separately as nid_zf4num1ja4c9tpwpgj672ijgn_e.

**2026-07-25T06:54:00Z**

Review iteration 1 response (IMPLEMENTATION_WITH_SELF_PLAN).

BLOCKING B1 (the cold-cache window was a REGRESSION against the line key, not just an unfixed edge) is fixed in the PRODUCT, not the harness: `EmbedFoldKey.superseded` + `FoldStateStore.adoptRecordingOf` let the first render that can derive an occurrence key take over the fold recorded under the cold-cache positional key. `ObsidianHarness.openFile`'s index wait is reverted, so `e2e/foldable-embeds.e2e.ts` "fold state survives leaving the note and coming back" guards the boot window again (MEASURED red 2-of-6 before, green 8-of-8 after, takeover observed firing in 2-of-6).

A third e2e case pins the per-link ordinal (`inserting an UNRELATED embed above a folded one keeps the fold`), verified to go RED when the key derivation is forced onto the positional fallback.

Doc corrections: the false "strictly less lossy than the line key it replaces" claim is retracted; the z4jq inheritance is now described with its changed FREQUENCY; the nested-embed mechanism is marked UNMEASURED; CLAUDE.md is trimmed to a pointer at the module doc.
