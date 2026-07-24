# PARETO_COMPLEXITY_ANALYSIS — private notes

## What I actually read
- Ticket `_tickets/implement-live-preview-foldable-embeds-cm6.md` (scope was human-aligned and tight).
- `git diff 031c396..HEAD --stat`, then full reads of `src/embedFoldDom.ts`, `src/livePreview/*` (3 files),
  `src/foldableEmbedsPostProcessor.ts`, `src/main.ts`, `e2e/live-preview-foldable-embeds.e2e.ts`,
  and the diffs of `e2e/obsidianHarness.ts`, `e2e/foldable-embeds.e2e.ts`, `README.md`, `CLAUDE.md`, `package.json`.
- Skimmed only headings/verdict lines of IMPLEMENTATION_REVIEW__PUBLIC.md (did not read PRIVATE files of other roles).

## Test count reconciliation
"23-test suite" = repo total: foldable-embeds 8 + hello-world 3 + live-preview 12. The LP addition is 12.

## Hunting for over-engineering — what I checked and rejected as findings
- `EmbedFoldDom`: two real consumers verified by grep, not aspirational. Constants are a styles.css contract.
- `foldStateExtension` array: 1-line grouping, documented, used once — too small to be worth an opinion.
- `update()` gating on three conditions: each needed; a fold dispatch changes no DOM so only `update()` sees it.
- `RangeSet`/`StateField` vs plain Map: mapping through changes is the whole point and is e2e-tested.
- `sectionHash` djb2: pre-existing reading-mode code, out of this diff's scope.

## Real findings I stand behind
1. Two stray `export`s with no external consumer (foldStateField.ts:60, markedEmbedLines.ts:21). Trivial CUT.
2. Fenced code block false positive on `WHOLE_LINE_MARKED_EMBED` — genuinely not considered anywhere in the
   planning/review trail (grepped for "fenc"/"code block": zero hits). Only the code-SPAN case was reasoned about.
   Severity low: no embed widget renders in a code block, so the only symptom is a missing `-` character in
   verbatim code. Fix is cheap (fence toggle in the existing iterLines walk) but needs a test → TICKET not CUT.
3. Trailing-whitespace marker divergence vs reading mode. Genuinely user-visible-but-invisible; TICKET.

## Confidence
High on 1 and 3 (read directly from code). High on 2's mechanism (regex + decoration path are both
unconditional on fence state); did NOT run Obsidian to confirm the visual symptom — stated as such implicitly
by keeping it a TICKET.

## Judgement call
Resisted proposing a merge of the 3 LP modules or a split of markedEmbedLines. Both would be
opinion-for-opinion's-sake. The diff is disciplined; saying so plainly is the correct output here.
