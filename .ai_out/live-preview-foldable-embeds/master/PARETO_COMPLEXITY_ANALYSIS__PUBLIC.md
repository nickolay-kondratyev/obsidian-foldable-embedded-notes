# PARETO_COMPLEXITY_ANALYSIS — Live Preview foldable embeds

## Verdict: **YES — the complexity is justified** (MOSTLY, with 2 trivial CUTs and 3 TICKETs)

**Value delivered:** embeds are now foldable in the mode most people actually spend their day in
(Live Preview), with the `-` fold-by-default marker working for whole-line embeds, fold state that
survives edits, and clean teardown. That is the whole feature the human asked for.

**Complexity cost:** +412 lines of `src/` (of which a large share is WHY-comments), one new 3-module
directory, one shared 89-line DOM contract, +12 e2e tests inside an already-running Obsidian instance,
+4 harness methods. No settings, no options, no migration, no second behaviour, no persistence layer,
no syntax-tree hackery. Nothing was built for a hypothetical future consumer.

**Ratio: High.** The design repeatedly took the cheap 80% option where the 100% option was expensive:
whole-line-only marker (vs. private syntax-tree nodes), per-mode fold state (vs. cross-mode key
translation), per-LINE anchoring (vs. fighting `posAtDOM`'s line accuracy), reuse of the existing
`styles.css` classes (zero CSS churn), and a full re-scan on `docChanged` instead of incremental
diffing. Those are exactly the calls I would have wanted made.

## Answers to the specific questions

**Is `src/embedFoldDom.ts` earning its keep?** Yes. It has two real consumers today (not a speculative
one), and what it holds is the one thing that MUST NOT diverge: the four class names that are a
contract with `styles.css`, the chevron glyph, and the "swallow the title click or Obsidian navigates
away" rule. Two independent copies would duplicate *knowledge*, not just code — a rename in
`styles.css` would then silently half-break one mode. It is also correctly scoped: readiness waiting,
fold identity and marker parsing were deliberately left OUT because they genuinely differ. This is the
smallest honest extraction, not an abstraction layer.

**Is the 3-module split under `src/livePreview/` proportionate?** Yes. 87 / 84 / 152 lines with clean
seams (text scan + dash decoration | fold state + fold rule | DOM projection). Collapsing them gives
one ~320-line file mixing CM6 state, decorations and DOM/MutationObserver work — over the repo's own
200-300 line guidance and harder to reason about. Splitting further (e.g. decoration into its own
file) would separate the scan from its only other consumer for no gain.

**Is the 23-test suite proportionate?** Yes — 23 is the repo total (8 reading + 3 smoke + 12 new LP).
All 12 LP tests share ONE Obsidian launch and one vault, so marginal cost per test is seconds, and
each maps to a distinct risk: default fold, first-click inversion, dash reveal, position mapping,
line-start insertion, source-mode gating, code-span literal, nested-embed anchoring, teardown/rewire.
The only mild overlap is the toggle round-trip inside the mid-paragraph test, which is 3 lines on an
already-open instance. Not worth removing.

**Could a meaningfully simpler design deliver ~the same value?** I looked for one and did not find it.
The two candidates both fail concretely: (a) a plain `Map<lineNumber, boolean>` instead of a
`StateField`/`RangeSet` — cheaper by ~20 lines but loses position mapping, so every fold jumps to the
wrong embed the moment you type above it (a test already proves this direction); (b) reusing the
reading-mode post-processor's marker parsing on editor text — cannot work, only raw text is available
in CM6 and it false-positives inside code spans (verified in exploration). The MutationObserver, the
`try/catch` around `posAtDOM`, and the nested-embed exclusion each correspond to a behaviour that was
observed in real Obsidian, not defended against in the abstract.

## Observations

| # | Observation | file:line | Class | Rationale |
|---|---|---|---|---|
| 1 | `EmbedFoldDom` shared contract | `src/embedFoldDom.ts:15-89` | ACCEPT-AS-IS | Two real consumers; holds only the `styles.css` contract that must not drift. Smallest honest extraction. |
| 2 | `EmbedFoldDom.unmark` used by Live Preview only | `src/embedFoldDom.ts:85` | ACCEPT-AS-IS | Single consumer, but it is the exact inverse of `markFoldable`+`ensureChevron`; splitting it out is what would cause drift. 4 lines. |
| 3 | `options?: AddEventListenerOptions` param used by one caller | `src/embedFoldDom.ts:67` | ACCEPT-AS-IS | Pass-through of the standard DOM signature, zero indirection, no branch. |
| 4 | 3-module `src/livePreview/` split | `src/livePreview/` | ACCEPT-AS-IS | Proportionate; merging exceeds the repo's file-size guidance and mixes CM state with DOM work. |
| 5 | `explicitFoldAt` exported but used only inside its own module | `src/livePreview/foldStateField.ts:60` | CUT | Drop `export` (one word). Public surface should be `effectiveFold` + `setLineFold` + the extension; a second entry point invites a caller that bypasses the fold rule — the exact bug the file's own doc warns about. |
| 6 | `MarkedEmbedLine` interface exported, no external consumer | `src/livePreview/markedEmbedLines.ts:21` | CUT | Drop `export` (one word). Keeps the module's API to `markedEmbedLinesField` / `isMarkedLine` / `markerDashDecoration`. |
| 7 | `tr.changes.mapPos(effect.value.lineFrom)` — documented as a no-op for every caller that exists today | `src/livePreview/foldStateField.ts:38` | ACCEPT-AS-IS | The one genuinely speculative line in the diff, but it is a single call whose absence is a silent correctness bug for any future change-bundling dispatch. Cost ≈ 0, and the comment is honest about it. |
| 8 | Whole-document re-scan on every `docChanged` | `src/livePreview/markedEmbedLines.ts:56-58` | ACCEPT-AS-IS | Deliberate 80/20: one `iterLines` walk per keystroke is sub-millisecond for normal notes; incremental invalidation would be far more code for no felt gain. Correct call. |
| 9 | `wiredTitles` WeakSet instead of inferring from "a chevron exists" | `src/livePreview/livePreviewFoldExtension.ts:25` | ACCEPT-AS-IS | Not defensive theatre — the disable/re-enable e2e test fails without it. |
| 10 | `try/catch` around `posAtDOM` | `src/livePreview/livePreviewFoldExtension.ts:141` | ACCEPT-AS-IS | Reachable state (Obsidian renders widgets outside CM's cycle) and an escaping throw would kill the ViewPlugin for the session. Real, not hypothetical. |
| 11 | Nested-embed exclusion (`topLevelEmbeds`/`isNested`) | `src/livePreview/livePreviewFoldExtension.ts:103-111` | ACCEPT-AS-IS | 8 lines that fix a real observed bug (clicking a nested title folded the parent); covered by a test. |
| 12 | **Whole-line `![[x]]-` inside a fenced code block still gets its dash hidden** | `src/livePreview/markedEmbedLines.ts:19` | TICKET | The WHY comment only reasons about code *spans*. A line that is nothing but `![[x]]-` inside a ```` ``` ```` block matches the regex, so the decoration deletes a character from what should be verbatim code. Low severity (no fold happens, only the dash vanishes), and the fix is ~5 lines: track fence toggling in the existing `iterLines` loop. Not now, but it will be reported eventually. |
| 13 | Marker is inert with a trailing space (`![[x]]- `) | `src/livePreview/markedEmbedLines.ts:19` | TICKET | Invisible-to-the-user difference silently disables fold-by-default; reading mode accepts it (marker followed by whitespace). Cheap to align, but changes `dashFrom` arithmetic — do it deliberately, with a test. |
| 14 | LP suite is `mode: "serial"` with tests that mutate shared document state for later tests | `e2e/live-preview-foldable-embeds.e2e.ts:31` | ACCEPT-AS-IS | Real cost (no test runs in isolation, one failure cascades), but it is the price of one Obsidian launch — the right trade at this suite size. The file documents the coupling and restores mutated lines. |
| 15 | No unit tests for the pure logic (`WHOLE_LINE_MARKED_EMBED`, line-range lookup) | — | TICKET (already filed) | `_tickets/add-a-unit-test-harness-for-pure-fold-logic.md` covers it. Correctly deferred: today the e2e suite does assert both behaviours, just slowly. |
| 16 | No LP coverage of a media embed (`![[img.png]]`) | `e2e/live-preview-foldable-embeds.e2e.ts` | ACCEPT-AS-IS | The gate is the same one-line `.markdown-embed` class check the reading-mode path uses and that path is tested. Adding a fixture would protect little. |
| 17 | Comment-to-code ratio is high across the new modules | `src/livePreview/*`, `src/embedFoldDom.ts` | ACCEPT-AS-IS | Nearly all of it is WHY/WHY-NOT about non-obvious Obsidian/CM6 behaviour that cost real exploration time to learn. This is the documentation the next maintainer needs; it is not padding. |

## What I would tell the human

Ship it. This is a well-Pareto'd piece of work: the expensive 100% options (syntax-tree marker
parsing, cross-mode shared fold state, exact-position anchoring, incremental scanning, a settings
toggle) were all identified and all declined, each with a written reason. The one shared abstraction
has two real consumers and holds exactly the knowledge that must not diverge; the module split and the
test count are both proportionate to the risk.

Two one-word CUTs worth doing while you are in the file (`export` on
`foldStateField.ts:60` and `markedEmbedLines.ts:21` — neither has an outside consumer, and the first
one is a way to accidentally bypass the fold rule).

The one thing that was under-done: a whole-line `![[x]]-` **inside a fenced code block** still has its
dash hidden. The design note only reasoned about inline code *spans*. It is minor and cheap to fix
later (fence tracking in the loop that already walks every line) — file it, do not hold the release.
