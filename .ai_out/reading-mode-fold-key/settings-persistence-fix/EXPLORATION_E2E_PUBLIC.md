# EXPLORATION_E2E — how to write the "fold, edit above, re-render" reading-mode e2e

(Produced by a read-only Explore agent; persisted verbatim by TOP_LEVEL_AGENT.)

There is **no `e2e/README*`** in this repo (`CLAUDE.md`'s "See ./e2e" points at a file that does
not exist). The harness doc-comments are the documentation.

## 1. The e2e harness

**Boot.** `e2e/obsidianHarness.ts:107` `ObsidianHarness.launch({ extraFixtures })` — copies
`.dev-vault` → `.tmp/e2e/vault` (`:441-459`), deletes any stale `data.json` (`:453`), writes each
`extraFixtures` entry as `vaultRelativePath → content` (`:454-458`), seeds a sandbox
`--user-data-dir` with `obsidian.json` (`:461-472`), spawns real Obsidian with
`--remote-debugging-port=0` and attaches via `chromium.connectOverCDP` (`:130-166`), waits for
`workspace.layoutReady` (`:553-559`), enables community plugins + this plugin (`:561-578`).
Teardown: `close()` (`:168-177`), called from `test.afterAll`.

**Key helpers (all `e2e/obsidianHarness.ts`):**
- `openFile(vaultPath)` — `:202`
- `reopenThroughOtherFile(vaultPath, viaVaultPath)` — `:225`; doc at `:214-224` is load-bearing:
  a view-MODE round trip does NOT rebuild the reading-view DOM, only a detour through another
  file does.
- `setMarkdownViewMode("preview" | "source")` — `:250`
- `setLivePreviewEnabled(bool)` — `:274`
- `setCursor` `:288`, `setSelection` `:300`, `getSelectionHead` `:311`
- **`replaceRange(text, from, to?)` — `:325`** — the ONLY mid-test note-mutation mechanism in the
  suite; goes through `app.workspace.getMostRecentLeaf().view.editor.replaceRange`
  (`e2e/obsidianAppApi.ts:26-33`, `:41`). **No `vault.modify` helper exists** (`vault` is modelled
  only as `getAbstractFileByPath` + `setConfig`, `obsidianAppApi.ts:48-51`).
- `setPluginEnabled` `:341`, `relaunch()` `:119`, `readPersistedPluginData()` `:387`,
  `openPluginSettingsTab` `:414`.

**Shared assertion helpers:**
- `e2e/foldAssertions.ts:5` `CLS_FOLDED = "fen-folded"`, `:27` `expectFolded(embed, folded)` — the
  ONE way folded-ness is asserted; doc `:8-26` explains why the `false` branch does
  `toBeAttached()` + scalar-regex `not.toHaveClass` (the ARRAY form passes vacuously on an empty
  locator — do not "simplify").
- `e2e/reRenderGuard.ts:16` `captureElement(locator)` / `:29` `expectFreshElement(prev, locator)` —
  proves a re-render really happened by DOM-node identity; doc `:7-15`.

## 2. Closest model tests

**Delete-line model — `e2e/live-preview-foldable-embeds.e2e.ts:455-487`**:
1. Own fixture `lp-delete-line.md` (`:71-82`), two ADJACENT whole-line embeds of *different* `src`;
   doc `:65-70` says why it is not in the shared fixture.
2. Opened LAST in the serial file so nothing needs restoring (`:456-457`).
3. Locators by `src`: `page.locator('.cm-content .internal-embed[src="..."]')` (`:462-463`); wait
   for async render via `await expect(second.locator(".markdown-embed-title")).toBeAttached()`(`:464`).
4. Given: click title → `expectFolded(first,true)`, `expectFolded(second,false)` (`:466-468`).
5. When: line resolved at edit time by `currentLineOf(text)` (`:551-565`, throws unless exactly one
   match), then `harness.replaceRange("", {line,ch:0}, {line+1,ch:0})` (`:473-474`).
6. Then: **gate on the edit having landed** — `await expect(first).toHaveCount(0)` BEFORE
   `expectFolded(second,false)`, because `expectFolded(...,false)` retries until it passes and
   would be green for the wrong reason (`:476-480`).
7. **Timing-immune second claim:** click the second title and assert it FOLDS (`:485-486`) — a fold
   applied a moment later would otherwise still pass.
Also: `:305-318` "fold state survives an edit that shifts every position below it" and `:320-334`
"typing at the START of a folded embed's line" — both `replaceRange` + restore the line (`:332`).

**Reading-mode fold-state model — `e2e/foldable-embeds.e2e.ts`:**
- `beforeAll` `:41-69` → `openFile` + `setMarkdownViewMode("preview")` + `await
  expect(foldableEmbeds().nth(1)).toBeAttached()` (async-embed wait, comment `:66`).
- Scoped locator `foldableEmbeds()` `:81-83` **must** be
  `.markdown-reading-view .markdown-embed.fen-embed` — the hidden Live Preview DOM in the same leaf
  is also wired and would shift every `nth()` (doc `:75-80`).
- `:129-143` "fold state survives leaving the note and coming back" — canonical re-render test:
  click title → `expectFolded(true)` → `captureElement` → `reopenThroughOtherFile(PARENT, SIBLING)`
  → `setMarkdownViewMode("preview")` → `toBeAttached()` → `expectFreshElement(...)` →
  `expectFolded(true)`.
- `:192-201` "two embeds of the SAME note fold independently" (fixture `twins.md` `:55`) — the shape
  the misattribution test extends.
- `start-collapsed-setting.e2e.ts:156-173` — same pattern with the freshness guard spelled out.

Style: `test.describe.configure({ mode: "serial" })` (`foldable-embeds.e2e.ts:19`), module-level
`harness`/`page`, fixtures as top-level string consts, one file-level doc comment stating the
fixture layout with line numbers, a WHY comment on every non-obvious assertion. No nested
`describe` / no given/when/then keywords — BDD-ness is comment prose + ordering.

## 3. Editing a note and getting reading mode to re-render (exact recipe)

The suite's only working recipe, already proven by the throwaway probe behind this ticket
(`.tmp/probe/probe3.e2e.ts:56-73`, gitignored):

```
open note; setMarkdownViewMode("preview"); wait for embeds
click title -> expectFolded(nth(0), true)
setMarkdownViewMode("source")   // probe3:67 — get a live editor
harness.replaceRange(...)       // probe3:68 — the edit above the embed
freshRender(path)               // probe3:49-54 = openFile(other) + openFile(path) + preview
wait for `.fen-collapse-icon` attached; assert
```
- Use the harness helper `reopenThroughOtherFile` (`obsidianHarness.ts:225`) + `setMarkdownViewMode`
  instead of the probe's hand-rolled `freshRender`.
- **Mode round-trips reuse DOM** (probe3:48; corroborated `obsidianHarness.ts:216-223`,
  `live-preview-foldable-embeds.e2e.ts:439-442`, MEASURED on 1.12.7) — preview→source→preview is
  NOT a re-render; only reopening renders afresh.
- **Do NOT copy** the probe's `page.waitForTimeout(...)` (`probe3:51,71,86,105`). Suite rule: no
  fixed sleeps, every assertion web-first (`live-preview…:31-32`); the only sanctioned
  `waitForTimeout` is `settings-persistence.e2e.ts:128`, justified `:53-60` (asserts an ABSENCE).
- **`isFoldedNow` caveat** (ticket `nid_1oipd3ymnbsdlbql01h7hue4p_e`):
  `start-collapsed-setting.e2e.ts:95-97` is a raw non-retrying `evaluate(classList.contains)` whose
  snapshot feeds a retrying `expect` at `:218-225` — a latent flake. Do NOT use that shape; assert
  the pre-edit state with `expectFolded` (settled barrier).
- Gate "after" assertions on the edit having landed (`toHaveCount(0)` trick,
  `live-preview…:476-479`), and add the click-inverts-what-is-displayed follow-up (`:483-486`).
- Prove the re-render with `captureElement`/`expectFreshElement` as `foldable-embeds.e2e.ts:135,141`.

## 4. Running the suite

- Full: `npm run test:e2e` → `scripts/run-e2e.sh:30`. Auto-provisions Obsidian when `OBSIDIAN_PATH`
  is unset (`:14-17` → `scripts/setup-obsidian-bin.sh`, pinned `OBSIDIAN_VERSION="1.12.7"` `:26`),
  defaults headless flags with no display (`:23-26`), runs `npm run setup:dev-vault` (`:28`) and
  `npx tsc -p e2e/tsconfig.json` (`:29`) before Playwright.
- Single spec: `npm run test:e2e -- foldable-embeds.e2e.ts` (`run-e2e.sh:7-8`); single test: `-g`.
- Direct: `OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config
  e2e/playwright.config.ts <spec>`.
- Timings: last full run `.tmp/e2e-full-final.log` = 45 passed in 7.0s Playwright time; ~5-10s
  Obsidian boot per spec FILE (5 files) + the production build → ~1-2 min wall clock. Config:
  `e2e/playwright.config.ts:12` 120s/test, `:13` expect 15s, `:23-25` `workers:1`,
  `fullyParallel:false`, `retries:0`; artifacts `.tmp/e2e-artifacts` (`:27`).

## 5. Vault fixture conventions

- Base vault `.dev-vault/` (gitignored, `.gitignore:11-14`), regenerated idempotently by
  `scripts/setup-dev-vault.sh` — `child.md` (`:39`), `parent.md` (`:49`), `sibling.md` (`:63`),
  `.obsidian/community-plugins.json` (`:79`); built plugin refreshed `:85-92`.
- Per-spec fixtures via `extraFixtures` (`obsidianHarness.ts:107`, applied `:454-458`) — plain
  `Record<vaultRelativePath, content>`; see `foldable-embeds.e2e.ts:42-62`,
  `live-preview-foldable-embeds.e2e.ts:112-119`, `start-collapsed-setting.e2e.ts:38-44`.
- Naming: prefix by concern (`lp-*`, `marker-*`, `start-collapsed-*`); `-parent`/`-child` pair;
  declare each path as a top-level `const …_PATH`.
- Cleanup: none needed — vault copy wiped and re-seeded per `launch()` (`:449-450`). Within a serial
  file, a test mutating a shared fixture must restore it (`live-preview…:330-333`); convention for
  destructive edits is **its own fixture file, opened last** (`live-preview…:65-70`, `:456`).

### Suggested new spec shape
`e2e/reading-mode-fold-key.e2e.ts` (own file, own Obsidian, own fixtures): `rm-shift.md` =
`# Shift\n\n![[child]]\n\n![[sibling]]\n` (distinct `src` → `[src="…"]` locators, immune to `nth()`
drift) for the insert-above test; `rm-twins-shift.md` = two same-`src` embeds (the misattribution
case, reachable only with identical `src` given the key's `src` + index-within-section — ticket
`nid_z4jq8me8mhstojozeua8fufdr_e`); plus a no-embed detour note for `reopenThroughOtherFile`.
Key under attack: `src/foldableEmbedsPostProcessor.ts:188-198` (`buildKey`, `L${lineStart}` from
`ctx.getSectionInfo`); the doc at `:180-187` claiming "stable across re-renders" must change.
