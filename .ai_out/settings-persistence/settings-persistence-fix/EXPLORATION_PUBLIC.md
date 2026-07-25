# EXPLORATION_PUBLIC — settings persistence defects

Gathered by the Explore role (read-only; it had no write tool, so TOP_LEVEL_AGENT persisted its report verbatim-in-substance here).

## `src/settings/foldableEmbedsSettingsStore.ts` (56 lines)

- `SettingsPersistence` interface (`:8-11`): `loadData(): Promise<unknown>`, `saveData(data: unknown): Promise<void>` — mirrors Obsidian's `Plugin` methods so `Plugin` itself satisfies it (`main.ts:19`, `new FoldableEmbedsSettingsStore(this)`).
- `FoldableEmbedsSettingsStore` (`:20-55`): `private current: FoldableEmbedsSettings = DEFAULT_SETTINGS` (`:21`), `private readonly persistence: SettingsPersistence` (`:23`). No other private state — nothing tracks the raw persisted object or an in-flight save.
- `load()` (`:26-28`): `this.current = parseSettings(await this.readPersisted())`.
- `readPersisted()` (`:36-43`): calls `persistence.loadData()`, swallows errors to `null` with a `console.error`. **The raw loaded value is never retained.**
- `get()` (`:45-47`): returns `this.current`.
- `setStartCollapsed()` (`:50-54`) — **defect site**:
  ```ts
  async setStartCollapsed(startCollapsed: boolean): Promise<void> {
      this.current = { ...this.current, startCollapsed };
      await this.persistence.saveData(this.current);
  }
  ```
  - Defect 1: each call independently awaits its own `saveData`; nothing orders concurrent invocations.
  - Defect 2: `this.current` is exactly the parsed shape (`{ startCollapsed: boolean }`), so any other `data.json` key is dropped.

## `src/settings/foldableEmbedsSettings.ts` (52 lines)

- `FoldableEmbedsSettings` (`:5-11`): one field, `readonly startCollapsed: boolean`.
- `DEFAULT_SETTINGS` (`:14`): `{ startCollapsed: false }`.
- `ReadSettings` (`:23`): `() => FoldableEmbedsSettings`.
- `parseSettings(persisted: unknown)` (`:34-40`): strict READ path — `const raw = (persisted ?? {}) as Record<string, unknown>`, takes `startCollapsed` only when `typeof === "boolean"`, else default. Documented (`:25-33`) as intentionally lossy on read. Per the ticket design this must NOT change; only the WRITE path in the store changes.
- `foldedByDefault()` (`:50-52`): unrelated fold logic.

## `src/settings/foldableEmbedsSettingTab.ts` (49 lines)

- `FoldableEmbedsSettingTab extends PluginSettingTab`, ctor `(app, plugin, settings: FoldableEmbedsSettingsStore)` (`:12-19`).
- `display()` (`:21-33`): one toggle, `.onChange(async (startCollapsed) => { await this.saveStartCollapsed(startCollapsed); })` (`:29-31`). Obsidian does not await `onChange`, so a double-click fires two overlapping calls.
- `saveStartCollapsed()` (`:41-48`): `try { await settings.setStartCollapsed(...) } catch { console.error(...); new Notice(...) }` — both concurrent writes currently succeed, so the Notice never fires even when disk contradicts the UI.

## `src/main.ts` (37 lines)

- `onload()` (`:18-32`): `const settings = new FoldableEmbedsSettingsStore(this)` (`:19`); `await settings.load()` (`:22`) before any registration; `readSettings = () => settings.get()` (`:23`); `addSettingTab(new FoldableEmbedsSettingTab(this.app, this, settings))` (`:31`) — same store instance.

## Testing setup

- **No unit test framework exists.** `package.json` has no `test` script and no jest/vitest/`node:test`/mocha devDependency. Scripts: `dev`, `build`, `version`, `lint`, `setup:obsidian`, `setup:dev-vault`, `test:e2e`.
- No `src/**/*.test.ts` anywhere. Open ticket `_tickets/add-a-unit-test-harness-for-pure-fold-logic.md` proposes adding one — it does not exist yet. Coverage is entirely Playwright e2e against real Obsidian.
- `e2e/` contents:
  - Specs: `foldable-embeds.e2e.ts`, `hello-world.e2e.ts`, `live-preview-foldable-embeds.e2e.ts`, `start-collapsed-setting.e2e.ts`.
  - `e2e/obsidianAppApi.ts` — typed facade over `window.app` for `page.evaluate`.
  - `e2e/obsidianHarness.ts` — `ObsidianHarness`: launches real Obsidian (Electron) via CDP against a throwaway copy of `.dev-vault`. Members: `launch({extraFixtures})`, `relaunch()`, `close()`, `openFile`, `runCommand`, `setMarkdownViewMode`, `setLivePreviewEnabled`, `setCursor`, `replaceRange`, `setPluginEnabled`, `openPluginSettingsTab`, `closeSettings`, `setTheme`, and static `readPersistedPluginData()` (`:309-315`) which reads `data.json` off disk with `fs`/`path`, bypassing plugin memory.
  - `e2e/playwright.config.ts` — `testMatch: "**/*.e2e.ts"`, `workers: 1`, `fullyParallel: false`, `retries: 0`, `timeout: 120_000`.
  - `e2e/tsconfig.json` — extends root tsconfig, `types: ["node"]`, `noEmit: true`.
- **Existing settings e2e**: `e2e/start-collapsed-setting.e2e.ts` (238 lines), `test.describe.configure({ mode: "serial" })`:
  - Seeds `data.json` with `{"startCollapsed": true}` via `extraFixtures` (`:25-37`).
  - `startCollapsedToggle()` (`:86-88`); `setStartCollapsedInSettings()` (`:120-129`) opens the real settings tab, asserts pre-state, `.click()`s, asserts post-state, closes.
  - `expectPersistedStartCollapsed()` (`:106-110`) polls `ObsidianHarness.readPersistedPluginData()` with `toMatchObject({ startCollapsed })` — note `toMatchObject` would NOT catch dropped extra keys.
  - Read path across restart via `harness.relaunch()` (`:232`).
  - **No existing coverage** for rapid/overlapping toggles or an extra hand-added `data.json` key — both are new coverage matching the ticket's acceptance criteria. Related open ticket: `_tickets/cover-parsesettings-non-boolean-datajson-branch-in-e2e.md` confirms e2e is the established mechanism for this module.
- **Commands**:
  - Lint: `npm run lint` → `eslint .`
  - Build (type-checks): `npm run build` → `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`
  - e2e: `npm run test:e2e` → `bash scripts/run-e2e.sh` (provisions `OBSIDIAN_PATH`, headless flags, `setup:dev-vault`, `npx tsc -p e2e/tsconfig.json`, then `npx playwright test --config e2e/playwright.config.ts "$@"`). Single spec: `npm run test:e2e -- start-collapsed-setting.e2e.ts`.

## Existing patterns for the fix

- `grep` for `Promise<void> =`, `.then(`, `serializ`, `chain` over `src/**/*.ts`: **no matches**. There is no existing async-serialization precedent in `src/` to imitate.
- No code in `src/` retains a raw persisted object; `readPersisted()` discards it after `parseSettings`.
- The only raw-`data.json` reader in the repo is test-side: `ObsidianHarness.readPersistedPluginData()` (`e2e/obsidianHarness.ts:309-315`) — the precedent for asserting the FULL on-disk key set (use strict equality, not `toMatchObject`, when proving an unknown key survives).
