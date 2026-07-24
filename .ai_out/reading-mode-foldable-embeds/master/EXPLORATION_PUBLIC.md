# Exploration: Reading-mode foldable embeds (`![[x]]-` fold-by-default)

Ticket: `_tickets/reading-mode-foldable-embeds-with-x-fold-by-default-syntax.md` (READ THIS FIRST — it already contains
prototype-validated DOM facts, product decisions, module design, and edge cases; this doc is supporting detail for
implementation/review, not a replacement).

Repo root: `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes`

## 1. `src/main.ts` — sample scaffolding to STRIP

Current file (101 lines) is the unmodified obsidian-sample-plugin. Everything below must be removed for v1
(ticket: "main.ts lifecycle-only... no settings, no ribbon/status-bar/sample commands for v1"):

- Ribbon icon: `this.addRibbonIcon('dice', 'Sample', ...)` → `new Notice(...)`
- Status bar item: `this.addStatusBarItem()` / `.setText('Status bar text')`
- Three sample commands: `open-modal-simple`, `replace-selected` (editorCallback), `open-modal-complex`
  (checkCallback) — all reference `FoldableEmbeddedNotesModal`
- `FoldableEmbeddedNotesModal` class (extends `Modal`) at the bottom of the file
- `this.addSettingTab(new FoldableEmbeddedNotesSettingTab(this.app, this))`
- Sample global DOM click listener: `this.registerDomEvent(activeDocument, 'click', ...)` → `new Notice('Click')`
  (NOTE: `activeDocument` is the correct popout-window-safe idiom per `preferActiveDoc` lint rule — reuse the pattern,
  not the Notice, if any new global listener is ever needed)
- Sample interval: `this.registerInterval(window.setInterval(() => console.log('setInterval'), 5*60*1000))`
- `loadSettings()` / `saveSettings()` methods and the `settings!: FoldableEmbeddedNotesSettings` field
- Imports of `Editor`, `MarkdownView`, `MarkdownFileInfo`, `Modal`, `Notice` (keep only what's actually used, e.g.
  `Plugin`, `MarkdownPostProcessorContext`)

`onload()` should end up ~1-3 lines: `this.registerMarkdownPostProcessor(...)` (delegating to
`src/foldableEmbedsPostProcessor.ts` per ticket's module design) plus maybe `registerEvent`/injecting the fold
store. `onunload()` can stay empty (Obsidian tears down registered postprocessors/DOM listeners automatically via
`register*` helpers — no manual cleanup needed since nothing global is created outside `register*`).

## 2. `src/settings.ts` — DELETE entirely for v1

Full current contents:
```ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import FoldableEmbeddedNotesPlugin from './main';

export interface FoldableEmbeddedNotesSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: FoldableEmbeddedNotesSettings = {
	mySetting: 'default',
};

export class FoldableEmbeddedNotesSettingTab extends PluginSettingTab {
	plugin: FoldableEmbeddedNotesPlugin;

	constructor(app: App, plugin: FoldableEmbeddedNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
```
Wired into `main.ts` via: the `DEFAULT_SETTINGS`/`FoldableEmbeddedNotesSettings`/`FoldableEmbeddedNotesSettingTab`
imports, `settings!` field, `loadSettings()`/`saveSettings()`, and `this.addSettingTab(...)` in `onload()`. Ticket
explicitly says: "v1 has NO settings; prefer deleting `src/settings.ts` and the tab entirely." All of these call
sites in main.ts must be removed together with the file.

The `eslint-plugin-obsidianmd` rules `noSampleCode` and `sampleNames` (see section 6) will actively flag leftover
sample-plugin code/names, so this stripping is also an eslint-clean prerequisite, not just a style choice.

## 3. Build / lint / test tooling — exact commands

`package.json` scripts (run from repo root):
```json
"dev": "node esbuild.config.mjs",
"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
"version": "node version-bump.mjs && git add manifest.json versions.json",
"lint": "eslint .",
"setup:obsidian": "bash scripts/setup-obsidian-bin.sh",
"setup:dev-vault": "bash scripts/setup-dev-vault.sh",
"test:e2e": "bash scripts/run-e2e.sh"
```
So: `npm run build` = `tsc -noEmit -skipLibCheck` (type-check only, no d.ts emit) then production esbuild bundle to
`main.js`. `npm run lint` = `eslint .`. `npm run test:e2e` = `bash scripts/run-e2e.sh` (see below).

`esbuild.config.mjs`: entry `src/main.ts` → bundled CJS `main.js`; externals = `obsidian`, `electron`, all
`@codemirror/*`/`@lezer/*` packages, and Node builtins; `target: 'es2021'`; production build is minified, no
sourcemap; dev build has inline sourcemap and watches.

`tsconfig.json` strictness: `"strict": true`, `"noImplicitReturns": true`, `"noFallthroughCasesInSwitch": true`,
`"noUncheckedIndexedAccess": true` (index access on arrays/records returns `T | undefined` — matters for any
`Map`/array indexing in the fold store or marker-parsing code), `"isolatedModules": true`, `"module": "ESNext"`,
`"target": "ES2021"`, `"lib": ["ES2021", "DOM"]`. Only `src/**/*.ts` is included (e2e has its own `e2e/tsconfig.json`
extending root config with `"types": ["node"]` and `"noEmit": true`).

`eslint.config.mts`: flat config using `eslint-plugin-obsidianmd`'s `obsidianmd.configs.recommended` (spread at the
end, so it's the dominant ruleset), plus `globals.browser`. Ignores: `node_modules`, `dist`, `esbuild.config.mjs`,
`version-bump.mjs`, `versions.json`, `main.js`, `package.json`, `package-lock.json`, `tsconfig.json`. Uses
type-aware linting (`parserOptions.projectService`) — new `.ts` files under `src/` get type-aware rules
automatically since `tsconfigRootDir` is the repo root and `src/**/*.ts` is in `tsconfig.json`'s `include`.

`scripts/run-e2e.sh`: auto-downloads a pinned Obsidian binary via `setup-obsidian-bin.sh` if `OBSIDIAN_PATH` unset;
sets headless Electron flags (`--ozone-platform=headless --disable-gpu`) if no `$DISPLAY`/`$WAYLAND_DISPLAY`; then
runs `npm run setup:dev-vault` (rebuilds plugin + reseeds `.dev-vault`), type-checks `e2e/` via
`npx tsc -p e2e/tsconfig.json`, then `npx playwright test --config e2e/playwright.config.ts "$@"`. Extra args pass
through, e.g. `npm run test:e2e -- foldable-embeds.e2e.ts` to run just the new spec.

`scripts/setup-dev-vault.sh`: idempotently seeds `.dev-vault/{child,parent,sibling}.md` and minimal
`.obsidian/{app,appearance,community-plugins}.json` ONLY IF ABSENT (won't clobber hand-edits), but ALWAYS runs
`npm run build` and copies fresh `main.js`/`manifest.json`/`styles.css` into
`.dev-vault/.obsidian/plugins/foldable-embedded-notes/`. Because of the "only if absent" seeding, changes to
`.dev-vault/parent.md` etc. for new marker-variant fixtures should either edit the already-present files directly
(safe, script won't overwrite) or use the harness's `extraFixtures` launch option instead of editing this script.

## 4. E2E harness — `e2e/obsidianHarness.ts` public API

```ts
export const PLUGIN_ID: string  // read from manifest.json "id" = "foldable-embedded-notes"

class ObsidianHarness {
  readonly page: Page;                                   // Playwright Page for the real Obsidian renderer

  static resolveObsidianPath(): string
  static async launch(options: { extraFixtures?: Record<string, string> } = {}): Promise<ObsidianHarness>
  async relaunch(): Promise<ObsidianHarness>              // closes + reboots against the SAME vault copy (no reseed)
  async close(): Promise<void>
  async openFile(vaultPath: string): Promise<void>        // opens vaultPath in main-area leaf via app.vault + workspace.getLeaf(false).openFile
  async runCommand(commandId: string): Promise<void>      // app.commands.executeCommandById(`${PLUGIN_ID}:<id>`), throws if it returns false
  async setTheme(theme: "dark" | "light"): Promise<void>
}
```

- `launch({extraFixtures})`: `extraFixtures` is `Record<vaultRelativePath, fileContentString>` — written on top of
  the copied `.dev-vault` before boot (e.g. `{"child-dash.md": "# ...", "marker.md": "![[child]]-x\n"}`). Use this
  for marker-variant notes instead of editing `.dev-vault/parent.md`.
- Every `page.evaluate` callback accesses the app via the undocumented global:
  `(window as unknown as { app: any }).app` (typed `any` deliberately, per existing pattern in `openFile`/
  `runCommand`/`enableCommunityPlugins`).
- **No existing helper forces reading/preview mode** — the ticket's testing section says to use
  `leaf.setViewState` with `state.mode = "preview"` directly inside a `page.evaluate`, following this shape (proven
  in the now-deleted prototype spec `e2e/prototype-foldable.e2e.ts`, referenced in `.tmp/proto-e2e2.log`):
  ```ts
  await page.evaluate(async (targetPath) => {
    const app = (window as unknown as { app: any }).app;
    const file = app.vault.getAbstractFileByPath(targetPath);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
    await leaf.setViewState({ ...leaf.getViewState(), state: { ...leaf.getViewState().state, mode: "preview" } });
  }, vaultPath);
  ```
  (Exact spread shape not re-verified here — re-derive/re-prototype if it errors; the load-bearing fact is
  `state.mode = "preview"` on a `MarkdownView` leaf's view state switches it to reading/preview mode, confirmed by
  the prototype's `H1`..`H7` tests all reading the DOM in reading-view shape afterward.) Consider adding this as a
  new `ObsidianHarness.setReadingMode()` (or similar) helper method rather than inlining it in the spec, matching
  the harness's existing method style (`openFile`, `runCommand`).
- DOM queries after `setViewState` go through Playwright locators against `harness.page` directly (it IS the
  Obsidian renderer window attached via CDP), e.g. `page.locator('.markdown-embed-title')`,
  `page.locator('.internal-embed.markdown-embed')`, `.evaluate()` on `ElementHandle`s for text-node inspection
  (`node.nextSibling?.nodeType === 3`), and `page.locator(...).click()` for real pointer clicks (verified to
  actually toggle fold state via CSS class per prototype `H6`).

### `e2e/hello-world.e2e.ts` — pattern template (32 lines, use verbatim structure for the new spec)

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";

test.describe.configure({ mode: "serial" });   // ONE Obsidian instance per file

const PARENT_NOTE_PATH = "parent.md";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
  harness = await ObsidianHarness.launch();
  page = harness.page;
});

test.afterAll(async () => {
  await harness?.close();
});

test("...", async () => {
  const loaded = await page.evaluate(
    (pluginId) => Boolean((window as unknown as { app: any }).app.plugins.plugins[pluginId]),
    PLUGIN_ID,
  );
  expect(loaded).toBe(true);
});
```
Assertion style used: `expect(x).toBe(...)` for booleans/strings; `expect.poll(() => page.evaluate(...)).toBe(...)`
for eventually-consistent state (e.g. active file after `openFile`, useful for waiting on postprocessor re-render
after a fold toggle or mode switch). `page.evaluate` callbacks are typed against `window as unknown as {app: any}`
throughout — follow this exact idiom in the new spec, not a custom type.

`e2e/playwright.config.ts`: `testMatch: "**/*.e2e.ts"` (so `e2e/foldable-embeds.e2e.ts` is auto-discovered, no
config change needed), `timeout: 120_000` per test, `expect: {timeout: 15_000}`, `workers: 1`, `fullyParallel:
false`, `retries: 0`.

New spec file to create: `e2e/foldable-embeds.e2e.ts` (naming matches ticket + existing `hello-world.e2e.ts`
convention). Must satisfy `e2e/tsconfig.json` (`"types": ["node"]`, strict from root tsconfig) — `npm run test:e2e`
runs `tsc -p e2e/tsconfig.json` before Playwright, so type errors in the new spec fail the whole e2e run before any
test executes.

## 5. Static assets / fixtures

**`styles.css`** (repo root, currently just boilerplate comment, no real rules):
```css
/*
This CSS file will be included with your plugin, and
available in the app when your plugin is enabled.
If your plugin does not need CSS, delete this file.
*/
```
`scripts/setup-dev-vault.sh` copies it into the dev vault plugin dir `if [[ -f styles.css ]]` — keep the file (don't
delete), replace contents with the fold CSS the ticket specifies (`.fen-folded > .markdown-embed-content { display:
none; }`, chevron rotation, forced title-bar visibility, `cursor: pointer`).

**`manifest.json`**:
```json
{
	"id": "foldable-embedded-notes",
	"name": "Foldable Embedded Notes",
	"version": "1.0.0",
	"minAppVersion": "1.0.0",
	"description": "Make embedded notes (![[ ]]) foldable in reading mode, with ![[ ]]- syntax to fold by default.",
	"author": "Nickolay Kondratyev",
	"isDesktopOnly": false
}
```
`minAppVersion` is currently `1.0.0` — very old. Prototype validation was against real Obsidian **1.12.7**. If any
API used (e.g. `setIcon`, `MarkdownPostProcessorContext.getSectionInfo`, callout-style `is-collapsed` class
conventions) requires a newer minAppVersion, bump it and update `versions.json` accordingly — the `noUnsupportedApi`
eslint rule (see section 6) checks API usage against `manifest.json`'s `minAppVersion` by default, so a stale
version here can cause false-positive lint failures once feature code lands.

**`.dev-vault/` fixtures** (already contain both marker variants per ticket's testing note):
- `.dev-vault/parent.md`:
  ```
  # Parent note

  Some intro text before the embed.

  ![[child]]

  A default-folded embed uses the `![[ ]]-` syntax:

  ![[child]]-

  Some closing text after the embeds. See also [[sibling]].
  ```
- `.dev-vault/child.md`: `# Child note` + intro paragraph + 2 bullets.
- `.dev-vault/sibling.md`: plain note, linked (not embedded) from parent, no embeds of its own.

These three exist BOTH at repo root `.dev-vault/*.md` (checked into git) and are re-seeded (only-if-missing) by
`scripts/setup-dev-vault.sh`. Editing `.dev-vault/parent.md` directly is safe and won't be clobbered by the setup
script. For strict-marker negative-case fixtures (`![[child]]-x`, `![[child]]-like`) prefer
`ObsidianHarness.launch({extraFixtures: {...}})` per-spec rather than adding more permanent notes to `.dev-vault/`.

### Prototype-captured real DOM shapes (from real Obsidian 1.12.7, `.tmp/proto-e2e2.log`, prototype now deleted)

Unmarked embed `![[child]]` renders (inside a `<p>`) as:
```html
<span alt="child" src="child" class="internal-embed markdown-embed inline-embed is-loaded">
  <div class="embed-title markdown-embed-title">child</div>
  <div class="markdown-embed-content node-insert-event">...rendered child note...</div>
  <div class="markdown-embed-content node-insert-event" style="display: none;"></div>
  <div class="markdown-embed-link" aria-label="Open link"><svg .../></div>
</span>
```
(Note: TWO `.markdown-embed-content` divs appear — the second is empty/hidden; only the first holds real content —
be careful the CSS selector `.fen-folded > .markdown-embed-content` and any JS querying `.markdown-embed-content`
account for both, e.g. only touch `:not([style*="display: none"])` or query the first match.)

`nextSibling` of the embed `<span>` for `![[child]]-` had `nodeType === 3` (Text) with content `""` in one captured
dump variant (`H2` test title says "trailing '-' sibling text node" — exact captured text content may include
leading whitespace/newline depending on markdown source layout; strip logic must re-derive/verify the exact string,
not assume it's a bare `"-"`).

The prototype's OWN class names leaked into the log (`fen-embed`, `fen-folded`, `fen-fold-default` all appear on the
folded-by-default span in the dump) — these appear to be the class-naming convention already exercised
successfully in the prototype and are a reasonable default to reuse (`fen-` = plugin id prefix
"foldable-embedded-notes"), though the ticket's own Design section only specifies `.fen-folded` explicitly; treat
`fen-embed`/`fen-fold-default` as prototype-precedent, not ticket-mandated.

Fold height numbers observed: unfolded embed `height: 187.90625`(ish, content-dependent) vs folded
`height: 24` (title-bar-only height) — matches ticket's "188px -> 24px" claim.

## 6. `eslint-plugin-obsidianmd` rules likely to bite

Config: `eslint.config.mts` spreads `obsidianmd.configs.recommended` (dominant ruleset) over
`src/**/*.ts` with type-aware linting (`parserOptions.projectService`). Rules found in
`node_modules/eslint-plugin-obsidianmd/dist/lib/rules/` most relevant to this feature:

- **`noSampleCode`** / **`sampleNames`** — flag leftover obsidian-sample-plugin code/class names (e.g.
  `FoldableEmbeddedNotesModal`, `'Sample'` ribbon label, `'Open modal (simple)'` command). Confirms section 1's
  stripping is an eslint-clean prerequisite, not optional polish.
- **`preferCreateEl`** (fixable) — "Prefer Obsidian DOM helpers (`createEl`, `createDiv`, `createSpan`, `createSvg`,
  `createFragment`) over native DOM methods." Building the chevron (`span.collapse-icon`) or any other injected
  element in the postprocessor must use `el.createSpan(...)` / `el.createDiv(...)`, not
  `document.createElement(...)`.
- **`noForbiddenElements`** — disallows attaching forbidden elements (`style`, `link`, etc.) to the DOM; CSS must
  live in `styles.css`, never injected as a `<style>` tag at runtime (relevant since the ticket's earlier prototype
  used "injected CSS" for one throwaway test — the real implementation must NOT do that; use `styles.css` only).
- **`noStaticStylesAssignment`** — disallows `el.style.color = 'literal'`, `.style.setProperty(...)`,
  `.style.cssText = ...`, `.setAttribute('style', ...)` with LITERAL values (assignment from a variable/template
  literal with expressions is fine). Fold/collapse state must be done via CSS classes (`fen-folded`,
  `is-collapsed`), matching the ticket's own design — do not toggle `display` via inline styles.
- **`preferActiveDoc`** — prefer `activeDocument` over bare `document` for popout-window compatibility; any new
  global DOM listener (unlikely needed here since the postprocessor gets `el` directly, but the click handler on
  `.markdown-embed-title` should be attached via the section el / `registerDomEvent` scoped to that el, not a
  document-wide delegated listener).
- **`noGlobalThis`** — disallow `global`/`globalThis`, use `window`/`activeWindow`.
- **`regexLookbehind`** — lookbehind regex unsupported on some iOS Safari versions (Obsidian mobile). The strict
  marker-parsing regex (matching `-` immediately after `]]` followed by whitespace/EOL) must be written WITHOUT a
  lookbehind assertion — do the "immediately after `]]`" check structurally (e.g. by only inspecting the embed
  span's `nextSibling` text node's leading characters), not via `(?<=\]\])` in a regex over the raw markdown/HTML
  string.
- **`noUnsupportedApi`** — checks API usage against `manifest.json`'s `minAppVersion` (currently `1.0.0`, see
  section 5) — may need `minAppVersion` bumped alongside feature code using any newer API surface (e.g. `setIcon`
  signature, `MarkdownPostProcessorContext.getSectionInfo`).
- **`noViewReferencesInPlugin`** / **`detachLeaves`** — not directly triggered by this feature (no custom `View`,
  no leaf detaching in `onunload`), but worth keeping `onunload()` empty/trivial as currently planned.

Given `parserOptions.projectService` type-aware linting, ANY new `src/*.ts` file is automatically covered by the
same ruleset — no config changes needed when adding `foldableEmbedsPostProcessor.ts` / `foldStateStore.ts`.

## 7. `package.json` scripts — exact names (for IMPLEMENTATION/REVIEW agents)

| Purpose | Command |
|---|---|
| Watch build | `npm run dev` |
| Production build (type-check + bundle) | `npm run build` |
| Lint | `npm run lint` |
| Download/cache Obsidian binary | `npm run setup:obsidian` |
| Rebuild plugin + reseed dev vault | `npm run setup:dev-vault` |
| Run e2e suite (auto-runs setup:dev-vault + tsc + playwright) | `npm run test:e2e` |
| Run a single e2e spec | `npm run test:e2e -- foldable-embeds.e2e.ts` |

Acceptance criteria from the ticket map directly: `npm run build` clean, `npm run lint` clean, `npm run test:e2e`
all green, sample scaffolding removed (main.ts lifecycle-only, settings.ts deleted).

## Open questions / risks for implementation

1. Exact `leaf.setViewState(...)` shape to force preview/reading mode is NOT re-verified in this exploration (the
   prototype spec that proved it was deleted per repo convention; only pass/fail log lines survive in
   `.tmp/proto-e2e2.log`, not source). Re-derive/re-verify this call when writing `e2e/foldable-embeds.e2e.ts`.
2. Exact captured text of the `-` marker's text node (leading whitespace/newline handling) should be re-verified
   against a real render rather than assumed to be a bare `"-"` string.
3. Two `.markdown-embed-content` divs exist per embed span in real DOM (one populated, one empty+hidden) — CSS/JS
   must target the correct one.
4. `manifest.json minAppVersion` is `1.0.0`; may need bumping for `noUnsupportedApi` lint cleanliness depending on
   which Obsidian APIs the implementation ends up using (`setIcon`, `getSectionInfo`, etc.).
