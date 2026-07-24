# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE (working memory)

State: **iteration 2 COMPLETE + committed.** Both blockers fixed, both SHOULD-FIXes fixed,
4 of 5 NICE-TO-HAVEs taken. Gates: lint 0 errors / build clean / **e2e 34 passed**.
Next steps if picked up again: none outstanding — see PUBLIC's disposition table.

## Plan (iteration 2)
1. [x] B1 root fix: `EmbedFoldDom.isFolded()` = "what the user SEES"; LP `toggle()` inverts the
       PROJECTION, not the recomputed effective state. Reading mode already did exactly this
       (`foldableEmbedsPostProcessor.ts:73`) — so this also unifies the two modes on one helper.
       Rewrite the now-wrong WHY comments (`livePreviewFoldExtension.ts:91-92`, `foldStateField.ts:76-80`).
2. [x] B1 e2e: flip the setting ON with a Live Preview pane open, then assert the FIRST click
       inverts what is displayed. Assert "changed", not "folded" — the invariant is
       "a click is never a no-op", and that stays true whether or not a resync happened.
3. [x] B2: `ObsidianHarness.readPersistedPluginData()` (path knowledge stays in the harness) +
       a spec that asserts `data.json` on disk right after the tab writes. Mutation-prove it.
4. [x] SF-1: `parseSettings()` in the settings module — no cast, `typeof === "boolean"`, default
       projected from `DEFAULT_SETTINGS`.
5. [x] SF-2: marker-strip assertion must not be vacuous when there is no sibling.
6. [x] NTH: `load()` tolerates a read failure (keep defaults); `onChange` Notice on save failure;
       truth-table row 4 assertion; harness note about undocumented internals.
7. [x] Gates: lint, build, full e2e. Falsifiability evidence for every touched/added test.

## Decisions carried forward (iteration 1)
- Closure accessor, not a Facet/Compartment — clarification decision 2.
- `foldedByDefault` lives in the settings module: it IS the shared truth table.
- `SettingsPersistence` port rather than depending on `Plugin`.
- Settings tab: one row, no heading, no reset.

## Iteration-2 decisions (and WHY)
- **B1 fixed by inverting the PROJECTION.** The two things that could disagree are "what state
  says now" and "what the DOM shows"; the user clicked on the DOM, so the DOM is the correct
  operand. State stays authoritative for RENDERING (`sync()` still projects `effectiveFold`),
  it just stops being the operand of the inversion. No `Compartment`, no forced re-render —
  the excluded machinery was not needed, so no `#QUESTION_FOR_HUMAN` was raised.
- **B1 test asserts "the displayed state changed"**, not a concrete end state: a test that
  hardcodes "folds" would break if Obsidian ever resyncs the pane on modal close, and would
  then be testing the resync, not the dead click.
- **B2 solved with reviewer option 1** (assert `data.json` on disk). Option 2 (land on the
  value opposite the seed) would also work but proves it only indirectly.

## Gotchas found
- The harness wipes `data.json` and THEN layers `extraFixtures`, so seeding
  `.obsidian/plugins/<id>/data.json` via `extraFixtures` works (and only that way).
- `relaunch()` returns a NEW harness object — reassign both `harness` and `page`.
- Obsidian's toggle DOM: `.setting-item` → `.checkbox-container`, class `is-enabled` when on;
  the tab is opened with `app.setting.open()` + `app.setting.openTabById(<plugin id>)`.
- Playwright serial mode skips the rest of the file after the first failure — to falsify a
  later test, re-run with `--grep`.
- `saveData` is async and fire-and-forget from the click, so the disk assertion must POLL.
