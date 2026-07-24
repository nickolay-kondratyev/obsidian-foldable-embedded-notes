# IMPLEMENTATION — Live Preview foldable embeds (CM6)

Status: **COMPLETE**, review round 1 addressed. Plan `DETAILED_PLANNING__PUBLIC.md` rev 2
executed in full. Working tree clean; commits `fbaf5d7`..`1511026` plus `bcd36b8`
(review response — see `IMPLEMENTATION_ITERATION__PUBLIC.md` for the per-finding table).

No blocking questions. Two DEVIATIONS, both in the e2e harness, both forced by verified
Obsidian behaviour — see §4.

**Post-review deltas to the description below** (all in `bcd36b8`, all 11 findings fixed,
none rejected): Live Preview wires only TOP-LEVEL embeds (a nested one anchored to its
parent's line and folded the parent); `anchorLineStart` catches `posAtDOM`'s throw instead
of testing a sentinel that CM never returns; `.internal-embed` / `markdown-embed` live in
`EmbedFoldDom` and Live Preview uses reading mode's note-embed rule; `setLineFold` maps its
position; the marked-line scan uses `iterLines`. In e2e: `reloadPlugin()` →
`setPluginEnabled()` with the teardown asserted WHILE the plugin is off, the
position-mapping assertion de-vacuumed, the line-text helper throws instead of returning
`""`, plus one new nested-embed test. Suite is now **23 passed**.

---

## 1. What was built

| File | Responsibility |
|---|---|
| `src/embedFoldDom.ts` **NEW** | The DOM contract shared by BOTH modes: the four class names that must match `styles.css`, `markFoldable`, idempotent `ensureChevron` (`setIcon`), `applyFoldState`, `onTitleClick` (owns the one copy of the preventDefault/stopPropagation WHY) and `unmark` (the exact inverse, for Live Preview teardown). Stateless static class. |
| `src/livePreview/markedEmbedLines.ts` **NEW** | `WHOLE_LINE_MARKED_EMBED` regex + `findMarkedEmbedLines`, cached in `markedEmbedLinesField` (rescan only on `docChanged`), `isMarkedLine`, and `markerDashDecoration` — a replace decoration over the dash, skipped on the cursor's line and gated on `editorLivePreviewField`. |
| `src/livePreview/foldStateField.ts` **NEW** | `ExplicitFold` RangeValue, `setLineFold` effect, `explicitFoldField` (positions map through edits; line-RANGE filter on update), `explicitFoldAt` (line-RANGE read, `undefined` = never toggled), and `effectiveFold` — THE rule, one function, two callers. `foldStateExtension` bundles the two fields. |
| `src/livePreview/livePreviewFoldExtension.ts` **NEW** | `LivePreviewFoldView` ViewPlugin: `contentDOM` MutationObserver (`childList` + `subtree` only) → idempotent `sync()`; title presence is the sole readiness gate (and the free media-embed filter); `wiredTitles` WeakSet keyed wiring; `toggle()` inverts STATE not DOM; `destroy()` disconnects, aborts all listeners via one `AbortController`, and `unmark`s every embed. `livePreviewFoldExtension()` factory. |
| `src/foldableEmbedsPostProcessor.ts` | Refactored onto `EmbedFoldDom`. Kept: post-processor entry, strict DOM marker parse, per-occurrence keys, readiness observers, `FoldStateStore` wiring. Zero behaviour change. |
| `src/main.ts` | +1 `registerEditorExtension(livePreviewFoldExtension())`, with the WHY-no-onunload comment. |
| `e2e/live-preview-foldable-embeds.e2e.ts` **NEW** | 11 tests, all from the plan's table. No fixed sleeps anywhere. |
| `e2e/obsidianHarness.ts` | +`setLivePreviewEnabled`, `setCursor`, `replaceRange`, `reloadPlugin`, `EditorPosition`. |
| `e2e/foldable-embeds.e2e.ts` | Reading-mode locator scoped to `.markdown-reading-view` (Commit A, landed and verified BEFORE the feature). |
| `package.json` | `@codemirror/state@6.5.0`, `@codemirror/view@6.38.6` → **devDependencies** (externalised at bundle time, provided by Obsidian at runtime). Lint did NOT complain, so no move to `dependencies` was needed. |
| `README.md`, `CLAUDE.md` | Docs, §5 of the plan. |

Commits: A `fbaf5d7` (e2e scoping) → B `ba86831` (extract `EmbedFoldDom`) → C `e01b39c`
(feature + suite together, never a red commit) → D `a3ebedf` (docs) → `1511026` (follow-up
ticket). `change_log` and closing the ticket are left to TOP_LEVEL_AGENT as instructed.

---

## 2. Test results — VERBATIM

Every number below is from a real run; nothing was skipped, weakened or deleted.

**Commit A** (scoping only, feature not yet written) — `npm run test:e2e`: **11 passed**.
Proves the locator change is behaviour-neutral on its own.

**Commit B** (pure refactor) — lint clean, build clean, `npm run test:e2e`: **11 passed**.

**Commit C, new suite run BEFORE implementing** — `1 failed` at the `beforeAll` gate
(`expect(locator).toBeAttached() failed / element(s) not found`): red for the right reason,
no `.fen-embed` exists in `.cm-content` yet.

**Commit C final** — `npm run lint`: exit 0, no output. `npm run build`: exit 0.
`npm run test:e2e`: **22 passed** (8 reading-mode + 3 hello-world + 11 Live Preview), then
repeated twice more back-to-back: **22 passed**, **22 passed**. Three consecutive clean runs;
no flakiness observed, including test 10 (`reloadPlugin`), which the plan flagged as the
likely flake candidate — it did NOT need downgrading to a manual check.

All 11 Live Preview tests from the plan's table are present and green, including test 8
(fold survives typing at the line start) and test 10 (fold still works after
disable→enable, i.e. teardown + rewiring).

---

## 3. Probe result the plan asked for (test 6 / review F8)

Probed against real Obsidian 1.12.7 before writing the test. Findings, all now encoded in
the spec's header comment:

- `Inline ![[child]]- tail text.` **DOES** render an embed widget mid-paragraph → test 6
  takes the "widget renders" branch: it is `fen-embed`, click-foldable, NOT folded by
  default, and its line keeps the literal `- tail text.`.
- **Unexpected and worth knowing:** a line that is NOTHING BUT `![[child]]` becomes a
  **block widget that replaces the whole `.cm-line`** — that embed is a direct child of
  `.cm-content` with no `.cm-line` ancestor at all. A line with the marker (`![[child]]-`)
  is not a pure embed line, so it renders as an INLINE embed inside its `.cm-line`.
  Consequence: any assertion using `closest(".cm-line")` works only for the marked/inline
  embeds. This is documented in the spec; nothing in `src/` depends on it (`sync()` queries
  `contentDOM` for `.internal-embed`, which finds both shapes).
- The code-span line produces no widget and keeps its literal text (test 9).

---

## 4. DEVIATIONS

### D1 — `setLivePreviewEnabled` toggles the leaf's view state, not just the vault config

The plan (§4.2) specified `app.vault.setConfig("livePreview", enabled)` plus a re-entry into
editing mode. **Verified against Obsidian 1.12.7: that does not work.** After
`setConfig(false)` the open view stayed on `.markdown-source-view.is-live-preview` — through
a reading↔editing round-trip AND through `workspace.updateOptions()` — so
`editorLivePreviewField` never flipped and test 11 could not observe the guard at all.

The lever an open view actually reacts to is the leaf view state's `source` flag
(`setViewState({ state: { ..., source: !enabled } })`); with it, `is-live-preview` drops and
the raw `![[child]]-` renders verbatim, dash included. The helper now sets **both** (view
state for the open view, vault config for views created later) and documents why.

**This deviation is what proved the `editorLivePreviewField` guard (§3.6) actually works.**
Under the plan's original lever the test would have passed for a while by accident and
asserted nothing.

### D2 — `replaceRange(text, from, to?)` instead of the plan's flat `(text, line, ch)`

The flat signature can only insert. Test 8 types `x` at the start of the marked line, which
correctly makes it `x![[child]]-` — **no longer a whole-line marker**, so the dash becomes
visible from then on. Left in place, that silently disarmed the marker for every later test
and made test 11's assertion tautological (it "passed" for the wrong reason in an
intermediate run — caught and fixed, not shipped). Test 8 now deletes the character again
and re-asserts the fold, which needs a real range replace. The signature matches Obsidian's
own `editor.replaceRange`.

### D3 (cosmetic) — `anchorLineStart` is a private method, not a module function

Needs `this.view`; a private method is the same code with less plumbing and matches CLAUDE.md's
preference for cohesive classes. No behavioural difference.

### D4 — test 11's assertion shape

The plan says "the marked line shows the literal `-`". Asserted as **"exactly one `.cm-line`
ends with `-`"** (0 in Live Preview with the cursor parked away → 1 in Source mode) rather
than matching the full literal `![[child]]-`. Reason: whether Obsidian keeps rendering its
embed widget after a runtime Live Preview toggle is Obsidian's behaviour, not the plugin's,
and the test should not encode it. The cursor is explicitly parked off the line first,
otherwise the cursor-reveal path would make the assertion tautological.

---

## 5. Nothing broken, nothing left undone

- No behaviour-capturing test was removed, skipped or weakened.
- Reading mode is untouched: same 8 tests, same assertions, green.
- No Obsidian private markdown syntax-tree node names are used anywhere.
- Both temporary probe specs (`e2e/probe-tmp.e2e.ts`) were deleted; nothing under `.ai_out/`
  was deleted.
- Left for TOP_LEVEL_AGENT per instructions: the `change_log` entry and closing
  `_tickets/implement-live-preview-foldable-embeds-cm6.md`.

## 6. Notes for a reviewer

- Risk R12 (`sync()` writing DOM inside `ViewPlugin.update()`) did not materialise: no CM
  warnings, no visible thrash across three runs. `requestMeasure` remains the fix if it ever does.
- The self-terminating observer loop (R2) is real and documented in code: chevron insertion is
  a `childList` mutation, so it costs exactly one extra no-op `sync()` pass.
- Fold state in Live Preview is per CM view, so it resets on plugin reload and is independent
  of reading mode's `FoldStateStore` — settled by the ticket, asserted by test 10, documented
  in the README.

## 7. Pareto CUTs applied

Both CUT rows from `PARETO_COMPLEXITY_ANALYSIS__PUBLIC.md` (rows 5 and 6) applied — two
one-word removals, no behaviour change:

- `src/livePreview/foldStateField.ts:60` — `explicitFoldAt` is now module-private. The
  module's public surface is `effectiveFold` + `setLineFold` + `explicitFoldField`, so the
  fold rule (`explicit ?? marker`) has no bypass.
- `src/livePreview/markedEmbedLines.ts:21` — `MarkedEmbedLine` is now module-private. Its
  API is `markedEmbedLinesField` / `isMarkedLine` / `markerDashDecoration`. (`tsc` accepts
  the exported field's type referencing a private interface; no declaration emit here.)

Verified no outside consumer by grep over `src/` and `e2e/` before cutting: every reference
to either name is inside its own file.

Verification after the cuts: `npm run lint` exit 0, `npm run build` exit 0,
`npm run test:e2e` **23/23 passed** (3.3 s).

No TICKET rows (12, 13, 15) were acted on — TOP_LEVEL_AGENT owns ticket creation.
