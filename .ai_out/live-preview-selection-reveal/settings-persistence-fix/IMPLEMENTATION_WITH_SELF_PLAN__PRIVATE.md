# PRIVATE plan — selection-reveal of the marker dash

**Goal**: reveal the `![[x]]-` dash on every line a selection TOUCHES, not just the head's line.

**Steps**
1. [ ] e2e: add `setSelection` to `e2e/obsidianAppApi.ts` `Editor` + `ObsidianHarness.setSelection`.
2. [ ] e2e: two failing tests in `e2e/live-preview-foldable-embeds.e2e.ts` (forward + reversed
   selection spanning `LINE_MARKED`, neither endpoint on it).
3. [ ] Confirm FAILURE: `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts`.
4. [ ] Fix `src/livePreview/markedEmbedLines.ts:90` — union of lines per range `from..to`.
5. [ ] Confirm PASS; then `npm run lint`, `npm run build`, full `npm run test:e2e`.
6. [ ] Commit; write PUBLIC file. Do NOT close ticket, no change_log.

**State**: started.
