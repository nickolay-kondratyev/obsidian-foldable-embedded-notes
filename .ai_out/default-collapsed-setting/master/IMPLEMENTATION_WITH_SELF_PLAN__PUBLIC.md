# IMPLEMENTATION_WITH_SELF_PLAN — PUBLIC

Feature: **"Start embedded notes collapsed"** setting (default OFF), both render modes.
Status: **DONE** — lint, build and the full e2e suite (31 tests) are green; committed.

## Plan (as executed)

**Goal**: change ONE term — the default used when the user has made no explicit fold choice
for an embed — in both modes, plus the settings infrastructure to hold it.

1. Settings module (shape + default + the fold-default truth table).
2. Settings store (`loadData`/`saveData`) + `PluginSettingTab` with one toggle.
3. Thread a read-time accessor into the reading-mode post-processor and the CM6 extension.
4. `main.ts`: load settings, wire, `addSettingTab` — still lifecycle-only.
5. e2e spec covering both modes ON/OFF, explicit-choice-wins, and persistence across restart.
6. Docs (CLAUDE.md, README) + follow-up ticket.

## What was built

New:
- `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes-mirror-1/src/settings/foldableEmbedsSettings.ts`
  — `FoldableEmbedsSettings { startCollapsed }`, `DEFAULT_SETTINGS` (`startCollapsed: false`,
  the ONE place a default is written), `ReadSettings` accessor type, and
  `foldedByDefault(settings, hasFoldMarker)` at :33 — the truth table (`startCollapsed ||
  hasFoldMarker`), so the marker becomes a no-op rather than changing meaning.
- `.../src/settings/foldableEmbedsSettingsStore.ts` — in-memory current value over a narrow
  `SettingsPersistence` port (`loadData`/`saveData`, satisfied by `Plugin`); `load()` merges
  persisted keys onto `DEFAULT_SETTINGS`; `setStartCollapsed()` replaces (never mutates) and
  saves immediately.
- `.../src/settings/foldableEmbedsSettingTab.ts` — one `addToggle` row, save on change.
  Copy: **"Start embedded notes collapsed"** / "Embedded notes render folded until you expand
  them. Takes effect the next time a note is rendered." No heading and no restore-defaults
  affordance: a single row needs neither (per the `obsidian-settings` skill).
- `.../e2e/start-collapsed-setting.e2e.ts` — 8 tests (see below).

Changed:
- `.../src/main.ts:18-31` — `async onload()`: store `load()` is awaited BEFORE anything is
  registered (no render may see defaults while disk is still loading), then post-processor,
  editor extension and `addSettingTab`.
- `.../src/foldableEmbedsPostProcessor.ts:29-32` (ctor takes `ReadSettings`) and `:62`
  `this.store.get(key) ?? foldedByDefault(this.readSettings(), hasFoldMarker)`. Local rename
  `foldedByDefault` → `hasFoldMarker` (it is now only the MARKER's answer).
- `.../src/livePreview/foldStateField.ts:81-83` — `effectiveFold(state, lineFrom, settings)`
  = `explicitFoldAt(...) ?? foldedByDefault(settings, isMarkedLine(...))`.
- `.../src/livePreview/livePreviewFoldExtension.ts:152-166` —
  `livePreviewFoldExtension(readSettings)` + `ViewPlugin.define((view) => new
  LivePreviewFoldView(view, readSettings))`; the accessor is called at sync/toggle time.
- `.../e2e/obsidianHarness.ts:304-321` — new `openPluginSettingsTab()` / `closeSettings()`
  (drives the REAL settings dialog, the only surface that proves the tab writes through).
- `CLAUDE.md` (architecture section), `README.md` (new "Settings" section).

## Verification — commands run and REAL results

| Command | Result |
|---|---|
| `npm install` | exit 0 (`.tmp/npm-install.log`) |
| `npm run lint` | exit 0 — **0 errors, 1 warning** (`.tmp/lint-final.log`), see below |
| `npm run build` | exit 0 (`tsc -noEmit` + esbuild production) (`.tmp/build-final.log`) |
| `npm run setup:obsidian` | exit 0 — downloaded pinned Obsidian 1.12.7 |
| `npm run test:e2e` (FULL suite) | exit 0 — **31 passed** (`.tmp/e2e-full.log`) |
| `npm run test:e2e -- start-collapsed-setting.e2e.ts` | exit 0 — **8 passed** |

The lint warning is `obsidianmd/settings-tab/prefer-setting-definitions` on the new tab:
the declarative settings API needs Obsidian ≥ 1.13.0 while `manifest.json` declares
`minAppVersion: 1.0.0`. Bumping that is a user-facing compatibility decision, so it was NOT
taken here — tracked as ticket
`_tickets/adopt-obsidians-declarative-settings-api-getsettingdefinitions.md`.

### The new e2e tests (all against a real Obsidian, seeded `data.json` = `{"startCollapsed": true}`)
1. reading mode: plain `![[child]]` starts folded (+ body actually hidden)
2. reading mode: the marker dash is still stripped while the setting is on
3. reading mode: an explicit unfold beats the setting, across a re-render
4. live preview: plain `![[child]]` starts folded
5. live preview: the FIRST click unfolds an embed folded only by the setting
6. turning the setting OFF **through the real settings dialog** → a freshly opened note
   renders expanded in reading mode
7. …and in Live Preview too
8. turning it back ON, then `relaunch()` → still folded after a real restart (persistence)

**Falsification check (done, then reverted):** with `foldedByDefault` temporarily returning
`hasFoldMarker` only, test 1 FAILED (`.tmp/e2e-falsify.log`) and test 4 FAILED
(`.tmp/e2e-falsify-lp.log`). Source restored byte-identically and re-run: 8 passed.
"Setting OFF ⇒ expanded" is additionally guarded by the two pre-existing specs, which run
with no `data.json` at all and still pass unchanged.

## Rejected / deferred
- **CM6 `Compartment` / live re-application to open panes** — explicit non-goal. The
  accessor is read at render time, so the value is never stale; open panes simply are not
  re-folded until their next render.
- **A `+` marker or any marker-syntax change** — explicit non-goal.
- **Merging the two fold pipelines** — kept independent as the architecture intends. The only
  thing shared is the settings type/accessor and the one-line truth table `foldedByDefault`,
  which genuinely was going to be duplicated knowledge (plus its WHY) in both modes.
- **Declarative settings API** — ticketed, see above.
- **Unit tests** — no runner in this repo (existing open ticket); coverage stays e2e.
  `foldedByDefault` and the store's default-merge are the pure logic that would benefit if
  that ticket is picked up.
- `scripts/setup-dev-vault.sh` untouched — the new spec brings its own fixtures via
  `extraFixtures` and reuses the vault's `child.md`.

## Questions for human
None — the clarification answered everything that mattered.
