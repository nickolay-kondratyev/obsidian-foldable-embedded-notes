# Implementation review — reveal the marker dash on every line a selection touches

Ticket `nid_wjjrfc4a48g1yvc8s949xhklo_e`. Commits `0473722` (fix + tests), `d49ab6d` (notes).
Reviewed on branch `settings-persistence-fix`.

## Summary

`markerDashDecoration` built its reveal set from `range.head` only, so a selection whose head
sat off the marked line left the dash hidden while Obsidian revealed its own raw `![[child]]`
on that same line — displayed source contradicting the file, with an invisible character
inside the range about to be typed over. The fix extracts `linesTouchedBySelection(state)`,
which unions `lineAt(range.from).number .. lineAt(range.to).number` over every selection
range, and renames the call-site set to `selectedLines`. e2e gains
`ObsidianHarness.setSelection` plus two tests (forward and backwards spanning selection).

The fix is correct, minimal, matches the ticket's design, and preserves every existing
behaviour. No functionality removed, no tests deleted, no anchor points touched.

## Independent verification (actually run, output observed)

| Command | Result |
|---|---|
| `npm run lint` | exit **0** — `1 problem (0 errors, 1 warning)`; the warning is the PRE-EXISTING `obsidianmd/settings-tab/prefer-setting-definitions` on `src/settings/foldableEmbedsSettingTab.ts`, untouched by this change |
| `npm run build` | exit **0** (`tsc -noEmit -skipLibCheck` + esbuild production) |
| `npm run test:e2e` | exit **0** — **42 passed (6.9s)**, including `#18 the marker dash is revealed while a selection spans its line` (14ms) and `#19 a BACKWARDS selection spanning the marked line reveals the dash too` (11ms) |

No `sanity_check.sh` exists in this repo. The implementer's reported numbers match what I
observed; nothing was overstated.

## 🚨 BLOCKING

None.

## ⚠️ SHOULD-FIX

**1. The reveal set is O(lines-in-selection); an O(marked-lines) overlap test is both cheaper
and simpler** — `src/livePreview/markedEmbedLines.ts:84-94`

`linesTouchedBySelection` materialises one Set entry per selected line. Select-all in a large
note allocates one entry per document line on every rebuild, and the rebuild is unbounded by
document size. This is below the bar the module sets for itself: `findMarkedEmbedLines`
(`:36-39`) carries an explicit WHY comment about avoiding an O(n log n) per-keystroke scan.

The information actually needed is "does any selection range overlap THIS marked line", which
is answerable without a Set and without a loop over lines — and it already has the `lineAt`
call it needs at `:116`:

```ts
/** Whether any selection range touches the given line — a bare cursor included (empty range). */
function isTouchedBySelection(state: EditorState, line: { from: number; to: number }): boolean {
	// from/to (not anchor/head): direction-independent, and a range ending exactly at a line
	// start still counts as touching it — the convention Obsidian's own reveal follows.
	return state.selection.ranges.some((range) => range.from <= line.to && range.to >= line.from);
}
```

Call site becomes:

```ts
.filter((marked) => !isTouchedBySelection(state, state.doc.lineAt(marked.lineFrom)))
```

Same `lineAt` count as today, no Set allocation, no per-line loop, identical semantics
(including the boundary case below). Strictly less code for strictly less work — worth taking,
though I would not hold the change for it.

## 💡 NITs / observations

**2. Boundary case — a selection ending exactly at a line start reveals that next line.**
`{line: 5, ch: 0}` as `to` makes `lineAt(to)` resolve to line 5 even though nothing of it is
selected, so a marked line 5 would un-hide its dash. I checked this deliberately: it is the
same answer the conventional CM6 overlap test gives (`range.to >= line.from` is true at
equality), so it is the idiomatic semantic rather than an off-by-one, and the visible effect
is at most one extra revealed dash. **Acceptable as-is** — calling it out per the brief, not
asking for a change.

**3. The BACKWARDS test cannot prove the selection is backwards.**
`e2e/live-preview-foldable-embeds.e2e.ts:261-268` relies on Obsidian's `editor.setSelection`
preserving `head < anchor`. If Obsidian normalised it, the test would silently be a duplicate
of the forward one and still pass. Under the new `from`/`to` logic both directions are
equivalent by construction, so its only value is guarding a regression back to head/anchor
logic — cheap and harmless, but do not read it as independent evidence.

Related honesty point, since it was raised as a question: the implementer only observed the
FORWARD test failing pre-fix (serial mode aborted the rest). The backwards test also fails
pre-fix **by construction** — the old line was `lineAt(range.head).number`, and its head is
`LINE_ABOVE_MARKED` (blank line 3), so the marked line was never in the reveal set. That
reasoning is airtight against a one-line predecessor; no separate demonstration needed.

**4. Test placement and state hygiene are right.** Both new tests sit before the test at
`:302` that inserts lines (so the `LINE_MARKED`-derived constants still hold — matching the
existing comment at `:90-93`), and both end with `setCursor(LINE_ELSEWHERE, 0)`, which keeps
the later Source-mode test's `linesEndingWithDash === 0` baseline (`:373`) honest. The
"…and it hides again" second half of each test is a real assertion (the reveal is
selection-driven, not a permanent un-hide), not just cleanup. Good.

**5. Harness plumbing is right-sized.** `setSelection` (`e2e/obsidianHarness.ts:295-305`)
mirrors `setCursor`'s `page.evaluate` shape exactly, and `obsidianAppApi.ts:29` declares only
the method actually used. Nothing over-built.

## Code quality

- SRP: the helper does one thing and the decoration reads better for it. Naming
  (`linesTouchedBySelection`, `selectedLines`) is honest about what it holds.
- The WHY comment at `:77-82` states the real motivation (Obsidian reveals its own raw
  syntax, so a hidden dash makes the display contradict the file) rather than restating the
  code, and the WHY-NOT for `anchor`/`head` is exactly the kind of note CLAUDE.md asks for.
  Not redundant with the decoration's own doc, which was correctly updated from "the line the
  cursor is on" to "the lines the selection touches".
- Gate and cache interactions are untouched: the `editorLivePreviewField` early return still
  precedes all work (`:110-112`), `markedEmbedLinesField` is still keyed on `docChanged`, and
  the decoration ranges remain in document order, so `Decoration.set` without `sort` stays
  valid.

## Documentation Updates Needed

**None — I agree with the implementer.** CLAUDE.md's Live Preview section documents the
`markedEmbedLines.ts` module at the level of "whole-line scan + decoration hiding the marker
dash, gated on `editorLivePreviewField`". Cursor-vs-selection reveal was never described
there, so nothing went stale, and adding it would push volatile per-line detail into a file
CLAUDE.md explicitly reserves for stable knowledge. The constraints list further down does
carry Live Preview gotchas, but those are ones that will BITE a future editor (`posAtDOM`
line-accuracy, reused widget DOM); "reveal raw syntax under the selection" is the standard
Live Preview convention, not a trap.

## Verdict

**READY**
