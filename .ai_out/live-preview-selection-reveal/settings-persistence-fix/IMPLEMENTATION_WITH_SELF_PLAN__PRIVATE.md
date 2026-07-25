# PRIVATE memory — selection-reveal of the marker dash

**STATUS: DONE, review round 1 answered.** Commits `0473722` (fix + tests) and the
review-response commit on `settings-persistence-fix`. Ticket
`nid_wjjrfc4a48g1yvc8s949xhklo_e` deliberately left OPEN; no `change_log` entry (TOP_LEVEL_AGENT
does both). See `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` for the original decision record and
`IMPLEMENTATION_ITERATION__PUBLIC.md` for the review response (verdict was READY; both
non-blocking items ACCEPTED).

All plan steps completed:
1. [x] `setSelection` added to `e2e/obsidianAppApi.ts` `Editor` + `ObsidianHarness`.
2. [x] Two e2e tests (forward + backwards span over `LINE_MARKED`, neither endpoint on it).
3. [x] Confirmed pre-fix FAILURE (exit 1, `Expected: true Received: false`).
4. [x] Fixed `markedEmbedLines.ts` via `linesTouchedBySelection(state)`.
5. [x] lint 0 (one pre-existing settings-tab warning), build 0, full e2e 42 passed.
6. [x] Committed.

## Things a future clone should know

- `markerDashDecoration` already declares `"selection"` as a compute dependency, so the
  decoration recomputes on selection-only transactions. The bug was purely the head-only line
  set — never a stale-cache problem. `markedEmbedLinesField` correctly stays keyed on
  `docChanged` (it holds a doc-content fact).
- The e2e spec file is `test.describe.configure({ mode: "serial" })`: a failure aborts every
  later test in the file, and tests INHERIT cursor/selection state from the one before. Any
  new selection test must leave the cursor collapsed off the marked line.
- `npm run test:e2e -- <file>` narrows to one spec; verbose output belongs in `.tmp/`.
- Playwright artifacts land in `.tmp/e2e-artifacts/` (gitignored).
- The reveal rule is now a per-marked-line overlap test (`isTouchedBySelection`), NOT a set of
  touched line numbers — deliberately, so cost scales with MARKED lines, not selected ones.
  `from <= line.to && to >= line.from` is provably identical to the old
  `lineAt(from).number .. lineAt(to).number` membership (line numbers are monotone in position
  and `L.to + 1` starts line `L + 1`). Do not "simplify" it back into a Set.
- VERIFIED empirically (e2e `#19`): Obsidian's `editor.setSelection` does NOT normalise
  direction — `getCursor("head")` still reports the earlier position for a backwards selection.
