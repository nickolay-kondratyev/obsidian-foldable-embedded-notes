# Exploration: reveal marker dash on every line a selection touches

Ticket: nid_wjjrfc4a48g1yvc8s949xhklo_e — bug in
`src/livePreview/markedEmbedLines.ts`.

## 1. `src/livePreview/markedEmbedLines.ts` — current structure

- `WHOLE_LINE_MARKED_EMBED` (line 24): regex `^!\[\[[^\]\n]+\]\]-[ \t]*$` matching a whole-line `![[x]]-` (marker dash, optional trailing blanks).
- `MarkedEmbedLine` (26-31): `{ lineFrom, dashFrom }` — doc positions of line start and the dash.
- `findMarkedEmbedLines(doc: Text)` (40-53): single `doc.iterLines()` pass with a running `lineFrom` offset (avoids O(n log n) indexed `doc.line(n)` lookups). Returns all marked lines in doc order.
- `markedEmbedLinesField` (63-66): a `StateField<readonly MarkedEmbedLine[]>`.
  - `create`: `findMarkedEmbedLines(state.doc)`.
  - `update: (lines, tr) => (tr.docChanged ? findMarkedEmbedLines(tr.state.doc) : lines)`.
  - **This is the crux of why the bug is invisible to the cache**: the field only recomputes on `tr.docChanged`. A selection-only change (arrow keys, mouse click, shift-click to extend selection) does NOT set `docChanged`, so `markedEmbedLinesField`'s cached array is untouched — which is fine, because it holds the SET OF MARKED LINES (a doc-content fact), not the reveal state. The reveal state itself is NOT stored in this field.
- `isMarkedLine(state, lineFrom)` (69-71): looked up elsewhere (fold DOM sync) — unrelated to the bug.
- `markerDashDecoration` (84-96): `EditorView.decorations.compute([markedEmbedLinesField, editorLivePreviewField, "selection"], ...)`.
  - Declaring `"selection"` as a dependency means CodeMirror recomputes this decoration set on EVERY selection change (cursor move or selection extend), independent of `markedEmbedLinesField`'s own `docChanged` gate. So selection-only changes DO trigger recompute of the decoration — the bug is NOT a stale-cache/missed-invalidation issue, it is purely in the logic at line 90.
  - Gate: `if (!state.field(editorLivePreviewField)) return Decoration.none;` — Source mode always renders literally (no hiding at all), matching the "in plain Source mode the marker dash renders literally" e2e test.
  - **Bug site, line 90**: `const cursorLines = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number));` — only `range.head` (the moving end) is considered. A selection whose `head` is off the marked line but whose `from`/`to` span still covers it leaves that line's dash hidden even though Obsidian reveals raw syntax under any touched selection range.
  - Lines 91-94 then filter `markedEmbedLinesField` entries whose line number is NOT in `cursorLines`, and replace-decorate the dash character (`marked.dashFrom` to `+1`).

### Desired fix
Iterate every line each selection RANGE touches, not just `head`:
```ts
const cursorLines = new Set<number>();
for (const range of state.selection.ranges) {
	const fromLine = state.doc.lineAt(range.from).number;
	const toLine = state.doc.lineAt(range.to).number;
	for (let n = fromLine; n <= toLine; n++) cursorLines.add(n);
}
```
`range.from`/`range.to` are always `from <= to` regardless of selection direction (unlike `anchor`/`head`, which can be reversed) — CodeMirror's `SelectionRange` guarantees `from`/`to` ordering, so no extra `Math.min/max` needed.

## 2. Existing unit tests

None found. `grep -rl "markedEmbedLines\|cursorLines\|WHOLE_LINE_MARKED_EMBED" src` matches only the three source files (`markedEmbedLines.ts`, `livePreviewFoldExtension.ts`, `foldStateField.ts`) — no `*.test.ts` files exist anywhere in the repo (`find . -iname "*.test.ts"` returns nothing). There is no unit-test runner configured in `package.json` (`scripts`: `dev`, `build`, `version`, `lint`, `setup:obsidian`, `setup:dev-vault`, `test:e2e`). All behavioral coverage for this plugin is via the Playwright e2e suite in `e2e/`.

## 3. e2e harness patterns

File: `e2e/live-preview-foldable-embeds.e2e.ts`. Fixture `lp-embeds.md` build in `NOTE_CONTENT` (lines 40-54); relevant constants: `LINE_MARKED = 4` (`![[child]]-`), `LINE_ELSEWHERE = 0`, `EMBED_MARKED = 1`.

**Existing cursor-reveal test** (lines 236-242):
```ts
test("the marker dash is revealed while the cursor is on its line", async () => {
	await harness.setCursor(LINE_MARKED, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(true);

	await harness.setCursor(LINE_ELSEWHERE, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(false);
});
```

**Existing Source-mode literal-dash test** (lines 342-356), uses `linesEndingWithDash()` (421-428, counts `.cm-line` elements whose trimmed text ends in `-`) and `setLivePreviewEnabled(false)`.

**Helper: `lineEndsWithDash(nth)`** (178-180) → `lineTextOfEmbed(nth).then(text => text.trimEnd().endsWith("-"))`.
**Helper: `lineTextOfEmbed(nth)`** (172-175) and the underlying **`embedLineText(nth)`** (152-170) — reads the nth embed's `.cm-line` ancestor's `textContent`, throws if the embed has no `.cm-line` ancestor (block-widget case). Use `embeds().nth(EMBED_MARKED)` (locator factory at 130-132: `.cm-content .internal-embed.fen-embed`) to select.
**Helper: `markdownAfterEmbed(nth)`** (191-193) — exact raw text rendered after the embed widget on its line (used for trailing-space precision, e.g. asserting `-${TRAILING_SPACE}` vs `TRAILING_SPACE`).

**Setting cursor/selection — `ObsidianHarness` (`e2e/obsidianHarness.ts`)**:
```ts
/** Places the editor cursor (0-based line/ch) in the active markdown editor. */
async setCursor(line: number, ch: number): Promise<void>          // line 288-293
async replaceRange(text: string, from: EditorPosition, to?: EditorPosition): Promise<void>  // 300-305
```
Both `page.evaluate` into `window.app.workspace.getMostRecentLeaf().view.editor`.

**No `setSelection` helper exists yet.** Obsidian's own `Editor` API DOES have it (`node_modules/obsidian/obsidian.d.ts:2366`): `abstract setSelection(anchor: EditorPosition, head?: EditorPosition): void;` (and `setSelections` at 2371). The harness's typed facade `e2e/obsidianAppApi.ts` `Editor` interface (26-30) currently only declares `getValue`, `setCursor`, `replaceRange` — a selection-spanning test will need `setSelection` added to that interface AND a new `ObsidianHarness.setSelection(anchor, head)` method mirroring the `setCursor` pattern (page.evaluate calling `editor.setSelection(edit.anchor, edit.head)`).

`EditorPosition` type already exported from `obsidianAppApi.ts` (16-19): `{ readonly line: number; readonly ch: number }`.

`expectFolded` lives in `e2e/foldAssertions.ts` (27-35) — unrelated to this bug but is the file's fold-state assertion pattern (positive `toHaveClass`, negative uses explicit `toBeAttached()` + `not.toHaveClass` because a negated matcher can pass vacuously on a missing element — MEASURED against Playwright 1.61.1, per file comment).

## 4. Running lint / build / e2e

- Lint: `npm run lint` → `eslint .` (config `eslint.config.*`). `.ai_out` and `e2e` are both in `globalIgnores` — `e2e` because the `obsidianmd` plugin ruleset targets shipped plugin source, not Node-side test tooling; `.ai_out` is explicitly excluded as throwaway exploration output, so this exploration doc will not be linted.
- Build/typecheck: `npm run build` → `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`.
- e2e: `npm run test:e2e` → `bash scripts/run-e2e.sh`.
  - If `OBSIDIAN_PATH` unset, auto-runs `scripts/setup-obsidian-bin.sh` (Linux-only; downloads pinned Obsidian 1.12.7 tarball, caches under `${XDG_CACHE_HOME:-$HOME/.cache}/obsidian-e2e`, prints binary path). Non-Linux must set `OBSIDIAN_PATH` manually.
  - Headless (no `$DISPLAY`/`$WAYLAND_DISPLAY`): auto-sets `OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"`.
  - Then: `npm run setup:dev-vault`, `npx tsc -p e2e/tsconfig.json`, `npx playwright test --config e2e/playwright.config.ts "$@"` — extra args pass through, e.g. `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts`.
  - `e2e/playwright.config.ts` sets `workers: 1` + `fullyParallel: false` (load-bearing per file comment — one Obsidian instance/vault-copy per spec file; concurrent instances would fight over sandbox-config dirs).

## 5. Pitfalls / read-only observations

- **`range.from`/`range.to` vs `range.anchor`/`range.head`**: `from`/`to` are always ordered (`from <= to`) by CodeMirror's `SelectionRange` regardless of selection direction; `anchor`/`head` are direction-dependent (`head` may be `<` or `>` `anchor`). The fix must use `from`/`to`, matching the ticket's stated approach.
- **Multi-range selections** (multiple cursors / Alt-click): `state.selection.ranges` is an array; the existing code already `.map`s over all ranges, so a fix must keep unioning line numbers across every range, not just the primary one.
- **Rectangular/column selection**: CodeMirror represents this as multiple `SelectionRange`s too (one per visual row), each with its own `from`/`to` on that row — the same per-range `lineAt(from)..lineAt(to)` loop handles it without special-casing, since each range already stays within one line for a rectangular selection.
- **Cost**: for a selection spanning many lines, the loop is O(lines touched) per range — bounded by document size per recompute, same order as `findMarkedEmbedLines` itself; not a concern since this decoration already recomputes on every selection change (`"selection"` is already a declared dependency at line 85).
- **Test author must add `setSelection` to both `obsidianAppApi.ts`'s `Editor` interface and a new `ObsidianHarness.setSelection` method** before an e2e test can drive a real multi-line selection (see §3) — no existing helper does this; only `setCursor` (collapsed selection) exists today.
- A new e2e test for this ticket would extend `LINE_MARKED`'s existing reveal test with a selection anchored off the marked line and extended to cover it (or vice-versa), asserting `lineEndsWithDash(EMBED_MARKED)` stays `true` for as long as the selection's span touches that line, using the pattern at lines 236-242.
