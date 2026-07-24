# IMPLEMENTATION — private memory

Rehydration notes for a clone of me. Task is DONE; this is state, not a to-do list.

## Where things stand

Branch `master`, tree clean. Commits (oldest→newest):

```
fbaf5d7  Scope reading-mode e2e locator to .markdown-reading-view      (Commit A)
ba86831  Extract the shared foldable-embed DOM contract into EmbedFoldDom (Commit B)
e01b39c  Make embeds foldable in Live Preview (CM6 editor extension)   (Commit C)
a3ebedf  Document Live Preview support and its two deliberate limitations (Commit D)
1511026  Create follow-up ticket for a unit-test harness
bcd36b8  Fix nested-embed folding and the posAtDOM contract in LP  (review round 1)
c26874f  Record implementation convergence check (both roles ready)
(HEAD)   Narrow two Live Preview module APIs (Pareto CUTs)
```

Pareto round: applied ONLY the two CUT rows (5, 6) from
`PARETO_COMPLEXITY_ANALYSIS__PUBLIC.md` — dropped `export` from `explicitFoldAt`
(`foldStateField.ts`) and `MarkedEmbedLine` (`markedEmbedLines.ts`). Grep-confirmed no
outside consumer. lint 0 / build 0 / e2e 23/23. TICKET rows 12, 13, 15 deliberately NOT
acted on — TOP_LEVEL_AGENT owns tickets.

Review round 1: all 11 findings FIXED, none rejected. Suite is now 23 tests (was 22).
Details in `IMPLEMENTATION_ITERATION__PUBLIC.md`.

Deliberately NOT done (TOP_LEVEL_AGENT owns): `change_log` entry, closing
`_tickets/implement-live-preview-foldable-embeds-cm6.md`.

Follow-up ticket created: `_tickets/add-a-unit-test-harness-for-pure-fold-logic.md`
(id `nid_lcehddb2tdcq6qxztmhvhpgga_e`).

## Environment — everything works, no infra excuses needed

- `npm run test:e2e` runs a REAL Obsidian 1.12.7 headless (cached binary, auto-downloaded).
  Full suite ≈ 3 s of test time after a ~20 s boot. Ran it 6+ times; zero flakes.
- `npm run lint` (exit 0, silent) and `npm run build` (tsc + esbuild, exit 0) both clean.
- Always redirect to `.tmp/` — the shell prints ~20 lines of env-setup noise per call.
- Single spec: `npm run test:e2e -- <spec>.e2e.ts`.
- `@codemirror/state` + `@codemirror/view` were ALREADY in `node_modules` (obsidian
  peerDeps); I added them to `devDependencies` pinned to `6.5.0` / `6.38.6`. eslint never
  complained about `import/no-extraneous-dependencies`, so the plan's `dependencies`
  fallback was not needed.

## Hard-won facts about Obsidian Live Preview (1.12.7) — verified by probe, not guessed

1. **A line that is nothing but `![[note]]` becomes a BLOCK widget replacing the whole
   `.cm-line`.** That embed is a direct child of `.cm-content` and has NO `.cm-line`
   ancestor. A line with the marker (`![[note]]-`) is not a pure embed line, so it renders
   as an inline embed INSIDE its `.cm-line`. Any `closest(".cm-line")` assertion only works
   for the second shape. `sync()` is unaffected — it queries `contentDOM` for
   `.internal-embed`, which catches both.
2. **`app.vault.setConfig("livePreview", false)` does NOT affect an already-open view.**
   Not after `setMarkdownViewMode` preview→source, not after `workspace.updateOptions()`.
   `.markdown-source-view.is-live-preview` persists and `editorLivePreviewField` stays true.
   The working lever is the leaf view state's `source` flag:
   `leaf.setViewState({ ...vs, state: { ...vs.state, source: true } })` → `is-live-preview`
   drops and raw markdown renders verbatim. `setLivePreviewEnabled` now sets both.
3. `Inline ![[child]]- tail text.` DOES render a widget mid-paragraph.
4. A code-span `` `![[child]]-` `` renders no widget and keeps literal text.

## Two real bugs I hit in my OWN tests (do not reintroduce)

- **Test 8 poisoned the fixture.** Typing `x` at the start of `![[child]]-` makes it
  `x![[child]]-` — correctly NOT a whole-line marker anymore, so the dash stays visible for
  the rest of the run. That broke test 11's baseline and, in an earlier iteration, made
  test 11 pass for the wrong reason. Test 8 now deletes the char again (hence the
  `replaceRange(text, from, to?)` signature) and re-asserts the fold.
- **Test 11 was initially over-specified**, demanding Obsidian stop rendering its widget in
  Source mode. Not our behaviour. Now: park the cursor off the line, assert
  `linesEndingWithDash() === 0` (LP on) → `=== 1` (source mode).

## Facts learned in review round 1 (verified, not guessed)

- `posAtDOM` THROWS a `RangeError` for an unmappable node (`@codemirror/view` `posFromDOM`);
  it has no negative-sentinel path. An escaping throw inside `ViewPlugin.update()` makes CM6
  deactivate the plugin instance for the rest of the session — hence the `try/catch`.
- A nested `![[x]]` inside an embed BODY resolves via `posAtDOM` to the OUTER embed's line.
  Live Preview must skip nested embeds (`topLevelEmbeds()`), in `destroy()` too — otherwise
  teardown would also strip the post-processor's chevron from them.
- Embed bodies go through the markdown post-processor EVEN IN THE EDITOR: a nested embed is
  already `fen-embed` in Live Preview and folds via `FoldStateStore`. So skipping them costs
  no capability. Probed on 1.12.7.
- The old teardown test round-tripped the view mode before asserting, which rebuilds the
  editor DOM and hides any leak. Assert while the plugin is OFF (`setPluginEnabled(false)`)
  — proven falsifiable by removing the `unmark` loop.

## Design points I would defend in review

- `effectiveFold` is the single fold rule; `toggle()` inverts STATE, never the DOM class.
  Without it the first click on a default-folded marked embed reads `!undefined === true`
  and looks dead. Test "the FIRST click … UNFOLDS it" is the guard — keep it.
- Fold read/write is line-RANGE, not exact position. Zero-length anchors map to AFTER text
  inserted at a line start. Test 8 is the guard.
- `wiredTitles` WeakSet, not "does a chevron exist" — a re-enabled plugin can meet a leftover
  chevron whose listener died with the old view. Test 10 is the guard.
- Observer is `childList`+`subtree` only, never `attributes`: our writes are class toggles,
  so no feedback loop. Chevron insertion costs exactly one extra no-op `sync()`.
- `unmark` lives in `EmbedFoldDom` (not the LP module) so it stays in lockstep with
  `markFoldable`/`ensureChevron`, even though only LP calls it.

## If something regresses later

- Reading-mode locator scoping (`.markdown-reading-view`) is load-bearing now — the plugin
  marks embeds in the hidden editor DOM of the same leaf.
- `playwright.config.ts`'s `workers: 1` + `fullyParallel: false` is load-bearing for TWO
  suites sharing one vault copy and one app window.
- R12 (`sync()` writing DOM inside `update()`) never materialised. If it ever does, the fix
  is `view.requestMeasure({ write })`, never a `setTimeout`.
- If a late-arriving embed is ever missed (R6), fall back to a reading-mode-style per-embed
  observer — never to a sleep.
