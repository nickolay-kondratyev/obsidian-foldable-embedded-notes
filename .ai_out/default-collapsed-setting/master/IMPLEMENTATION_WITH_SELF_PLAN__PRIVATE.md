# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE (working memory)

State: **COMPLETE + committed**. All plan steps done; lint/build/e2e green (see PUBLIC).

## Plan (all done)
1. [x] `src/settings/foldableEmbedsSettings.ts` — shape + `DEFAULT_SETTINGS` + `ReadSettings`
       + `foldedByDefault(settings, hasFoldMarker)`.
2. [x] `src/settings/foldableEmbedsSettingsStore.ts` — load/save over `SettingsPersistence`.
3. [x] `src/settings/foldableEmbedsSettingTab.ts` — one toggle, save on change.
4. [x] Reading mode threading (ctor arg + line 62).
5. [x] Live Preview threading (`effectiveFold(..., settings)`, `ViewPlugin.define` closure).
6. [x] `main.ts` async onload + `addSettingTab`.
7. [x] `e2e/start-collapsed-setting.e2e.ts` + harness `openPluginSettingsTab`/`closeSettings`.
8. [x] CLAUDE.md + README.
9. [x] Gates + follow-up ticket for the declarative-settings-API lint warning.

## Decisions (and WHY), for a future clone
- **Closure accessor, not a Facet/Compartment**: requirement said next render is enough; the
  closure reads the CURRENT value at sync time so it is not stale either. `ViewPlugin.define`
  replaces `fromClass` purely to pass the accessor.
- **`foldedByDefault` extracted into the settings module**: it IS the truth table
  (`startCollapsed || hasFoldMarker`). Two call sites would otherwise duplicate the rule AND
  its WHY. Nothing else was shared between the modes — that separation is intentional.
- **`SettingsPersistence` port** rather than depending on `Plugin`: `Plugin` structurally
  satisfies it, and it keeps `any` out of the store (`loadData(): Promise<any>`).
- **Settings tab has no heading / no reset**: one row; the `obsidian-settings` skill forbids a
  top-level heading and reset scope is only needed once it can be ambiguous.
- **Test falsifiability was verified**, not assumed: neutering `foldedByDefault` failed the
  reading-mode and live-preview "starts folded" tests. Do this again if these tests change.
  Note the persistence test deliberately restores the setting to ON before `relaunch()` —
  asserting "expanded after restart" would be satisfied by the default and prove nothing.

## Gotchas found
- The harness wipes `data.json` and THEN layers `extraFixtures`, so seeding
  `.obsidian/plugins/<id>/data.json` via `extraFixtures` works (and only that way).
- `relaunch()` returns a NEW harness object — reassign both `harness` and `page`.
- Obsidian's toggle DOM: `.setting-item` → `.checkbox-container`, class `is-enabled` when on;
  the tab is opened with `app.setting.open()` + `app.setting.openTabById(<plugin id>)`.
- Playwright serial mode skips the rest of the file after the first failure — to falsify a
  later test, re-run with `--grep`.
