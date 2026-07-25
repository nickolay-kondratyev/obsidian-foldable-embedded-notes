---
id: nid_7qbtubxk89team9oadnl3hanr_e
title: "Reading mode: line-based fold key is not mapped across edits — the fold is lost, or lands on a DIFFERENT embed"
status: in_progress
deps: []
links: [nid_zqaxj18jbxwnazzz8aeggz91u_e]
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

