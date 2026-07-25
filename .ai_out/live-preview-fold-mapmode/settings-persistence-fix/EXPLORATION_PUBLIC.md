# EXPLORATION — Live Preview fold anchor survives line deletion (mapMode)

Written by TOP_LEVEL_AGENT from the Explore agent's report (that agent is read-only and
could not write this file itself). Facts below are its findings; verify line numbers before
relying on them.

## 1. `src/livePreview/foldStateField.ts` (89 lines)

- L8-12 `ExplicitFold extends RangeValue` — only `folded: boolean`. **No `mapMode` override**, so
  it inherits `MapMode.TrackDel` (`@codemirror/state/dist/index.d.ts:1399`). TrackDel drops a
  zero-length range only when a deletion spans strictly ACROSS it; a deletion STARTING at the
  anchor leaves it alive, remapped onto whatever line moved up. That is the bug.
- L20 `setLineFold = StateEffect.define<LineFoldToggle>()`.
- L29-50 `explicitFoldField: StateField<RangeSet<ExplicitFold>>`. On update: maps the set through
  `tr.changes` (L32 — where the TrackDel bug bites), then per `setLineFold` effect computes the
  post-change line (L40) and does a line-RANGE filter + re-add of a fresh zero-length anchor at
  `line.from` (L41-46). Comment L42-43 explains the range filter: an anchor can drift within its
  own line when text is inserted at the line start.
- L52-60 comment = the documented "typing at the line start" rationale; L62-70 `explicitFoldAt`
  uses `explicitFoldField.between(line.from, line.to, ...)` — a whole-line scan, NOT an exact
  position lookup. **Both write and read paths are line-range based**, so they only require the
  anchor to remain somewhere on its own line — which is exactly what `TrackAfter` preserves for
  insert-at-line-start while fixing delete-the-line.
- L81-83 `effectiveFold(state, lineFrom, settings)` = `explicitFoldAt(...) ?? foldedByDefault(...)`.
- L86 `foldStateExtension = [markedEmbedLinesField, explicitFoldField]`.

## 2. `src/livePreview/livePreviewFoldExtension.ts` (174 lines)

- `sync()` L65-83: per top-level embed, `lineFrom = anchorLineStart(embed)` (L71), then
  `effectiveFold(state, lineFrom, readSettings())` (L81) → `EmbedFoldDom.applyFoldState`.
- `anchorLineStart` L142-155: `view.posAtDOM(embed)` → `doc.lineAt(pos).from`. Comment L135-139:
  `posAtDOM` on a widget is only LINE-accurate. Never cached; recomputed every sync/toggle.
- `toggle()` L85-100 recomputes `lineFrom` before dispatching `setLineFold`.
- `update()` L42-51 re-syncs on `docChanged` / viewport change / field change — so a surviving
  misplaced anchor immediately renders the NEXT embed folded, as the ticket describes.

## 3. e2e harness

- Main spec `e2e/live-preview-foldable-embeds.e2e.ts`: `describe.configure({mode:"serial"})`, one
  shared `ObsidianHarness` (beforeAll L73-83 / afterAll). Fixture note `lp-embeds.md` from
  `NOTE_CONTENT` (L35-46) with named `LINE_*` / `EMBED_*` index constants. Second fixture pair
  `NESTED_FIXTURES` for nested embeds.
- Existing pinned test L197-211: "typing at the START of a folded embed's line keeps its fold
  state" — same-line INSERTION only; does NOT cover cross-line deletion.
- `currentLineOf(text)` L302-308 — resolves 0-based line index from `editor.getValue()`, robust to
  earlier edits shifting lines.
- `e2e/obsidianHarness.ts`: `setCursor(line, ch)` (~L288), `replaceRange(text, from, to?)` (~L296)
  wrapping Obsidian's `editor.replaceRange`. Deleting a whole line + newline =
  `replaceRange("", {line:N, ch:0}, {line:N+1, ch:0})`. Also `openFile`,
  `setMarkdownViewMode`, `setLivePreviewEnabled`, `setPluginEnabled`.
- `e2e/foldAssertions.ts`: `expectFolded(embed, folded)` — `fen-folded` class check; comments
  explain why `toBeAttached()` + scalar regex `toHaveClass` form is needed for non-vacuous
  negative assertions.
- Run: `npm run test:e2e` → `scripts/run-e2e.sh` (uses `OBSIDIAN_PATH` or
  `scripts/setup-obsidian-bin.sh`, seeds dev vault, `tsc -p e2e/tsconfig.json`, then playwright
  with `workers: 1`). Single spec: `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts`.
  LP spec estimated ~30-90s including Obsidian launch.

## 4. Unit-test infrastructure

**None.** No `*.test.ts`, no jest/vitest/mocha in `package.json`. All coverage is the Playwright
e2e suite against real Obsidian. No CM6-level unit harness exists.

## 5. `.tmp/probe/`

Still present, gitignored: `probe*.e2e.ts` (14), `pw.config.ts`, `run*.log`, `setup*.log`. The
Explore agent sampled `probe14` and judged the sampled content to be from a prior nested-embed
investigation, not this mapMode bug — the ticket, however, states this bug was reproduced with
probes there. Treat as scratch; not part of the shipped suite.
