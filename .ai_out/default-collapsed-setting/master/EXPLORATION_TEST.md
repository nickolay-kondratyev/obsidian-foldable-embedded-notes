# EXPLORATION — test / build infrastructure (read-only findings)

## 1. e2e harness (`e2e/`)
- Docs: root `README.md:45-71`; `CLAUDE.md:100-101` points there. No `e2e/README.md`.
- `e2e/obsidianHarness.ts` — launches **real Obsidian (Electron)** via `spawn` + `chromium.connectOverCDP`
  (WHY-NOT `_electron.launch` comment at :15-19).
  - `launch({ extraFixtures })` (:106-110) copies `.dev-vault/` → `.tmp/e2e/vault`, **wipes stale plugin
    `data.json`** (:328-330), then layers `extraFixtures` (vaultRelativePath → content) (:331-335).
  - **Settings seeding pattern (natural extension point)**: `extraFixtures` writing
    `.obsidian/plugins/<id>/data.json` — fixtures are written after the data.json wipe.
  - `relaunch()` (:112-126) restarts against the SAME vault copy (no re-seed) → the way to assert settings
    persist across a real app restart.
  - Plugin enabled at runtime via `app.plugins.setEnable(true)`/`enablePlugin(id)` (:422-433).
  - Helpers: `openFile`, `runCommand`, `setMarkdownViewMode`, `setLivePreviewEnabled`, `setCursor`,
    `replaceRange`, `setPluginEnabled`, `setTheme`.
- `scripts/setup-dev-vault.sh` builds `.dev-vault/` (child.md, parent.md with `![[child]]` and `![[child]]-`,
  sibling.md, minimal `.obsidian/*.json`), runs `npm run build`, copies main.js/manifest.json/styles.css into
  `.dev-vault/.obsidian/plugins/<id>/`. `write_if_missing` keeps hand-edits; artifacts always refreshed.
- `e2e/playwright.config.ts`: `workers: 1`, `fullyParallel: false`, 120s timeout, 15s expect timeout.
  Not part of any `npm test` — release gate only.
- Env: `OBSIDIAN_PATH` (required on macOS/Windows), `OBSIDIAN_E2E_EXTRA_ARGS`, `OBSIDIAN_CACHE_DIR`.

### Runnable here?
Not yet: `node_modules/` absent, `.dev-vault/` absent, `~/.cache/obsidian-e2e` absent, no `$DISPLAY`
(harness auto-switches to headless Ozone flags, so display is not blocking). Needs `npm install`,
`npm run setup:obsidian` (auto-download on Linux), `npm run setup:dev-vault` first.

## 2. Unit tests
None. No vitest/jest, no `test` script, no config. Open ticket
`_tickets/add-a-unit-test-harness-for-pure-fold-logic.md` (priority 3) proposes adding one for
`markedEmbedLines` regex, `effectiveFold`, and `explicitFoldField` lookups — all currently covered only by
e2e. **Implication**: new pure logic for this feature follows current convention = e2e coverage only,
unless that ticket is picked up first.

## 3. Commands
- `npm run dev` → watch build
- `npm run build` → `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production` (**this is the typecheck gate**)
- `npm run lint` → `eslint .` (`eslint.config.mts`; `e2e/`, `.tmp`, `.dev-vault`, `.ai_out` ignored)
- `npm run setup:obsidian`, `npm run setup:dev-vault`, `npm run test:e2e` (`scripts/run-e2e.sh`)
- CI (`.github/workflows/lint.yml`): Node 20/22/24 → `npm ci`, `npm run build`, `npm run lint`. **e2e not in CI.**

Verification sequence: `npm install` → `npm run lint` → `npm run build` → optionally `npm run test:e2e`.

## 4. e2e conventions
Description = the "then"; given/when inline; ~one primary assertion.
- `e2e/foldable-embeds.e2e.ts:82` — ``test("`![[child]]-` renders folded, body hidden, no visible dash", ...)``
- `e2e/foldable-embeds.e2e.ts:115` — `test("fold state survives a reading -> editing -> reading round-trip", ...)`
- `e2e/hello-world.e2e.ts:33` — minimal baseline.
Both spec files use `test.describe.configure({ mode: "serial" })` (:16) with one harness per file
(`beforeAll`/`afterAll`) — a settings spec should follow the same pattern.

## 5. Settings conventions
- No `PluginSettingTab`/`Setting`/`loadData`/`saveData` anywhere — this feature is the first.
- `CLAUDE.md:91-95`: persist via `loadData()`/`saveData()`, defaults + settings tab; sentence case,
  **bold** for literal labels, arrow notation for navigation.
- `CLAUDE.md:62-69`: `main.ts` lifecycle-only, split modules past ~200-300 lines, `this.register*` cleanup,
  no Node/Electron APIs.
- A generic `obsidian-settings` skill is available and should be consulted when building the tab.
