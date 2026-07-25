# REVIEW REHYDRATION NOTES — trailing-space fold marker (`eebd621`)

## State at end of review

Verdict READY. 0 BLOCKING, 2 SHOULD-FIX (SF1 `currentLineOf` ambiguity, SF2 DRY of the
`.cm-line` guard), 2 suggestions (S1 follow-up ticket for indented embeds, S2 nit).
Public artifact written alongside this file. No code touched (read-only role).

## What I actually verified (do not redo blindly)

- `npm run lint` exit 0 (1 pre-existing settings-tab warning), `npm run build` exit 0.
- `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts` → 15/15 passed in ~1.7s.
  Cheap; re-run if anything changes. Full suite NOT re-run (implementer reported 40 passed).

## The central correctness question, settled

`lastIndexOf("-")` is provably the marker dash because the regex tail is `[ \t]*$` — no dash
can follow the marker, and target dashes precede `]]`. I hunted for a counterexample
(`![[my-note]]-`, `![[a-b]]-   `, tabs, `![[--]]-`, `![[x]]--`) and there is none. If a future
change widens the tail beyond `[ \t]`, this must be rechecked — that is the only fragility.

`Decoration.replace` width stayed 1; only the POSITION was wrong before. The e2e exact-string
assertion `markdownAfterEmbed === " "` is what pins the position (a `trimEnd` check would not).

## Where the remaining divergences are (if asked again)

Reading mode `stripFoldMarker` (`src/foldableEmbedsPostProcessor.ts:94`) is dash-after-`]]`
anywhere; Live Preview is whole-line-only, deliberately (code-span safety, documented at
`src/livePreview/markedEmbedLines.ts:9-13`). Two consequences remain, both pre-existing:
`![[x]]- tail` and indented `- ![[x]]-`. The first is covered by the AC3 test at
`e2e/live-preview-foldable-embeds.e2e.ts:253`; the second is uncovered → S1.

## Facts that took effort to establish

- SF1: fixture line 10 `![[child]]- ` TRIMS to the same string as line 4, and `currentLineOf`
  (`:420`) matches on `.trim()`. Safe today only via `findIndex` first-match ordering.
- Test ordering claim in the implementer's doc is TRUE: the only line-inserting test is
  `fold state survives an edit that shifts every position below it` (`:266`), which sits
  after both new tests (`:234`, `:240`). The typing test (`:281`) inserts a char, not a line.
- `markdownAfterEmbed`'s `findIndex === -1` path is unreachable and would fail loudly anyway.
- Source-mode test's LP baseline `toBe(0)` (`:337`) is an independent second detector of a
  revert — worth remembering if someone proposes deleting one of the new tests as redundant.
