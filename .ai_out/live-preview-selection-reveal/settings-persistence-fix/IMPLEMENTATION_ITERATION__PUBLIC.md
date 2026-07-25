# Implementation iteration — response to `IMPLEMENTATION_REVIEW__PUBLIC.md`

Ticket `nid_wjjrfc4a48g1yvc8s949xhklo_e`. Branch `settings-persistence-fix`.
Ticket left OPEN, no `change_log` entry (TOP_LEVEL_AGENT owns both).

## Item 1 — SHOULD-FIX: drop the Set, use a per-marked-line overlap test — **ACCEPTED**

Verified the equivalence myself before taking it, rather than on the reviewer's word.
Line numbers are monotone in position, and position `L.to + 1` is the first position of line
`L + 1`, so:

- `lineAt(p).number <= L.number` ⟺ `p <= L.to`
- `lineAt(p).number >= L.number` ⟺ `p >= L.from`

Applying the first to `range.from` and the second to `range.to` turns
`lineAt(from).number <= L.number <= lineAt(to).number` into `from <= L.to && to >= L.from`
term-for-term. Both boundary cases the review flagged check out:

- **Bare cursor** (`from === to === p`): reduces to `p >= L.from && p <= L.to` — cursor on the
  line, exactly the pre-existing behaviour, still with no special-case branch.
- **Selection ending exactly at a line start** (`to === L.from`): `to >= L.from` holds at
  equality, so line `L` is still revealed — the SAME answer `lineAt(to)` gave. The restructure
  is behaviour-preserving, not a quiet fix of the NIT-2 boundary case.

`linesTouchedBySelection(state) -> Set<number>` became
`isTouchedBySelection(state, line: Line) -> boolean` (`src/livePreview/markedEmbedLines.ts`).
`lineAt` call count is unchanged; the Set and the per-line loop are gone. The `selectedLines`
local at the call site disappears with the Set, so the filter now reads
`!isTouchedBySelection(state, state.doc.lineAt(marked.lineFrom))`.

Comments after the restructure, as required:
- The WHY (Obsidian reveals its own raw `![[x]]` under a selection, so a hidden dash makes the
  display contradict the file) **survives verbatim**.
- The **WHY-NOT `anchor`/`head` survives verbatim** — it is if anything more load-bearing now,
  since `from`/`to` appear directly in the expression.
- Added a WHY-NOT for the Set itself, so the next reader does not "helpfully" reintroduce it.
- Added a WHAT comment naming the expression as the standard CM6 overlap test and stating its
  inclusive-at-both-ends consequence — the equality case is non-obvious from the operators.
- The decoration's own doc ("except on the lines the selection touches") still reads correctly
  and was left alone.

## Item 2 — NIT: nothing asserts the backwards selection is backwards — **ACCEPTED (strengthened)**

I did not reject this: a test whose name says BACKWARDS while proving nothing of the sort
violates "behaviour must match naming", and the fix turned out to be three small pieces.

- `e2e/obsidianAppApi.ts` — `Editor` gains `getCursor(mode?: "head" | "anchor" | "from" | "to")`.
- `e2e/obsidianHarness.ts` — `getSelectionHead()`, mirroring `setSelection`'s `page.evaluate`
  shape and returning a plain `{line, ch}` (Obsidian's position object carries internals that
  would break `toEqual`).
- The backwards test now asserts `getSelectionHead()` is `LINE_ABOVE_MARKED` — i.e. the moving
  end really is BEFORE the anchor — before polling for the reveal.

**This was not a formality: the assertion passing is new information.** It establishes that
Obsidian's `editor.setSelection` does NOT normalise direction, which is precisely the premise
the review could only assume. The test is now honest about being a regression guard against a
return to head/anchor logic, and it can no longer decay into a silent duplicate of the forward
test.

## Item 3 — Docs — **NOTHING TO DO** (reviewer agrees with the original no-change decision)

Re-confirmed after the restructure: CLAUDE.md describes `markedEmbedLines.ts` as "whole-line
scan + decoration hiding the marker dash, gated on `editorLivePreviewField`". Nothing there
mentioned cursor-vs-selection reveal or a Set, so nothing went stale.

## Verification after these changes (actual observed output)

| Command | Result |
|---|---|
| `npm run lint` | `LINT_EXIT=0` — `1 problem (0 errors, 1 warning)`; the warning is the PRE-EXISTING `obsidianmd/settings-tab/prefer-setting-definitions` on `src/settings/foldableEmbedsSettingTab.ts`, untouched here |
| `npm run build` | `BUILD_EXIT=0` (`tsc -noEmit` + esbuild) |
| `npm run test:e2e` | `E2E_EXIT=0` — **42 passed (7.0s)**, including `#18 … a selection spans its line (11ms)` and `#19 a BACKWARDS selection spanning the marked line reveals the dash too (13ms)` |

Acceptance criteria re-checked: the spanning-selection reveal, the pre-existing
cursor-on-line reveal (`#17`) and the Source-mode literal-dash test (`#27`) all pass.

## Disagreements

None. Both actionable items accepted.
