# Exploration: nested-embed teardown / re-enable wiring guard fix

Repo root: `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes`

## 1. `src/foldableEmbedsPostProcessor.ts` — structure

- Entry point: `readonly process = (el, ctx) => {...}` (`:41-48`). For each
  `.internal-embed` (`EmbedFoldDom.SEL_INTERNAL_EMBED`) under `el`, calls
  `whenMarkdownEmbedReady(embed, onReady)` which calls `makeFoldable(...)`.
- Async-readiness MutationObserver: `whenMarkdownEmbedReady` (`:142-169`). If
  `markdownEmbedTitle(embed)` (requires `.markdown-embed` class + `.markdown-embed-title`
  child) is already present, calls `onReady` synchronously. Otherwise creates a
  `MutationObserver` watching `embed` (`childList: true, subtree: true, attributes: true,
  attributeFilter: ["class"]`), added to `this.liveObservers: Set<MutationObserver>`
  (`:26`), and disconnected via `stopObserving` (`:171-174`) once the title resolves or the
  embed turns out to be a media embed (never resolves).
- Two guards, both checking the SAME class:
  - `:58` in `makeFoldable`: `if (embed.classList.contains(EmbedFoldDom.CLS_FOLDABLE)) return;`
    — "Guard against a second post-process pass over the same live DOM."
  - `:143` in `whenMarkdownEmbedReady`: same check, same class, gates entry to the
    readiness-wait path before even installing the observer.
  - Both use `EmbedFoldDom.CLS_FOLDABLE` ("fen-embed") as the "already wired" marker — this
    is exactly the guard the ticket says is unsafe once a leftover class can survive a dead
    instance (nested-embed body DOM reused by Live Preview widgets).
- Marks applied in `makeFoldable` (`:50-79`): `EmbedFoldDom.markFoldable(embed)` (`:65`),
  `EmbedFoldDom.ensureChevron(title)` (`:66`), `EmbedFoldDom.applyFoldState(...)` (`:67`),
  then `EmbedFoldDom.onTitleClick(title, ...)` (`:72-78`) with NO `AbortSignal` — comment
  at `:69-71` explicitly says the listener "lives and dies with this freshly-created title
  element, so it needs no explicit deregistration (unlike Live Preview's, whose title DOM
  is Obsidian's and survives unload)". This assumption is exactly what the bug ticket
  disproves for embed BODIES nested inside Live Preview widgets.
- State owned: only `liveObservers: Set<MutationObserver>` (`:26`). No registry of marked
  elements, no `MarkdownRenderChild`, no `ctx.addChild(...)` call anywhere in the file.
- `main.ts` tracking/disconnect: `main.ts:16,26-27` stores the processor instance
  (`this.postProcessor: FoldableEmbedsPostProcessor`), registers `this.postProcessor.process`
  via `this.registerMarkdownPostProcessor(...)`, and `onunload()` (`main.ts:34-36`) calls
  `this.postProcessor?.disconnectAll()` — which only disconnects live `MutationObserver`s
  (`foldableEmbedsPostProcessor.ts:34-39`), it does NOT unmark any embed DOM. There is no
  other cleanup path for marked embeds.

## 2. `src/embedFoldDom.ts` — public API

File is a stateless static class (`export class EmbedFoldDom`, `src/embedFoldDom.ts:15`).

- Class-name constants (`:17-30`):
  - `CLS_FOLDABLE = "fen-embed"` — "also the CSS hook for a forced-visible title" (i.e. the
    exact class both guards in the post-processor test for).
  - `CLS_FOLDED = "fen-folded"`
  - `CLS_CHEVRON = "fen-collapse-icon"`
  - `CLS_COLLAPSED = "is-collapsed"` (core-callout convention)
  - `CLS_MARKDOWN_EMBED = "markdown-embed"` (Obsidian's own)
  - `SEL_INTERNAL_EMBED = ".internal-embed"`, `SEL_EMBED_TITLE = ".markdown-embed-title"`
- `static markFoldable(embed: HTMLElement): void` (`:35-37`) — adds `CLS_FOLDABLE`.
- `static ensureChevron(title: HTMLElement): HTMLElement` (`:43-51`) — idempotent
  (returns existing `.fen-collapse-icon` if present), else creates+prepends a span with
  `setIcon(chevron, "right-triangle")`.
- `static applyFoldState(embed: HTMLElement, chevron: HTMLElement, folded: boolean): void`
  (`:53-56`) — toggles `CLS_FOLDED` on embed, `CLS_COLLAPSED` on chevron.
- `static isFolded(embed: HTMLElement): boolean` (`:67-69`) — reads `CLS_FOLDED`
  (what is currently displayed, not a recomputed default — see doc comment `:58-66`).
- `static onTitleClick(title: HTMLElement, onClick: () => void, options?: AddEventListenerOptions): void`
  (`:86-96`) — calls `title.addEventListener("click", handler, options)`, where `handler`
  does `event.preventDefault(); event.stopPropagation(); onClick();`. `options` is the ONLY
  way to pass an `AbortSignal` (via `{ signal }` inside `AddEventListenerOptions`); the
  post-processor currently calls this with NO third argument (`:72-78` in
  `foldableEmbedsPostProcessor.ts`), so its listener has no abort mechanism at all.
- `static unmark(embed: HTMLElement): void` (`:104-107`) — "the exact inverse of
  `markFoldable` + `ensureChevron`": removes `CLS_FOLDABLE` and `CLS_FOLDED` from the embed's
  classList, and does `embed.querySelector(".fen-collapse-icon")?.remove()` (removes the
  chevron element entirely, which detaches any DOM-attached listeners on IT, but does
  nothing about the click listener attached to `title` itself). **`unmark` alone cannot
  remove the title's click listener** — the only mechanism that does that in this codebase
  is aborting an `AbortController` whose `signal` was passed to `onTitleClick`'s `options`
  (as Live Preview already does). Confirms the ticket's plan: reading-mode teardown needs
  its own `AbortSignal` threaded through `onTitleClick`, since `unmark` was designed only
  around class/chevron removal, matching Live Preview's usage where `destroy()` calls BOTH
  `this.listeners.abort()` (`livePreviewFoldExtension.ts:55`) AND `EmbedFoldDom.unmark(embed)`
  (`:60`) separately.

## 3. `src/livePreview/livePreviewFoldExtension.ts` — existing patterns

- WeakSet pattern (`:18-26`):
  ```
  private readonly listeners = new AbortController();
  /**
   * Titles already wired for clicks. Deliberately NOT inferred from "a chevron
   * exists": a re-enabled plugin can meet a leftover chevron whose listener died
   * with the previous view, and would then never rewire it.
   */
  private readonly wiredTitles = new WeakSet<HTMLElement>();
  ```
  This is precisely the failure mode named in the parent bug (leftover CSS-class guard
  blocking rewiring) — Live Preview already solved it for ITS wiring guard by keying off a
  `WeakSet<HTMLElement>` of titles instead of a CSS class, and pairs it with one
  `AbortController` per view instance for listener teardown. `wiredTitles` is checked/set at
  `:77-80` inside `sync()`.
- `topLevelEmbeds()` (`:112-115`):
  ```
  private topLevelEmbeds(): HTMLElement[] {
      const all = Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>(EmbedFoldDom.SEL_INTERNAL_EMBED));
      return all.filter((embed) => !this.isNested(embed));
  }
  ```
  `isNested` (`:117-120`) checks `embed.parentElement?.closest(EmbedFoldDom.SEL_INTERNAL_EMBED)`.
  Doc comment (`:102-111`) explains nested embeds are deliberately excluded from Live
  Preview's own wiring because `posAtDOM` resolves them to the OUTER embed's line, AND
  because "they are already the reading-mode post-processor's business (it renders every
  embed body)" — i.e. Live Preview explicitly defers nested-embed marking to the
  post-processor, which is exactly the DOM the post-processor leaves unmarked-on-teardown
  today. This is the root of the bug: reading-mode's post-processor DOES run over embed
  bodies nested inside Live Preview's `contentDOM` (Obsidian renders embed bodies via the
  same markdown post-processor pipeline regardless of host), so its marks/listeners end up
  living inside DOM that `contentDOM` (Live Preview) reuses across plugin reloads — but only
  `destroy()`'s `topLevelEmbeds()` sweep unmarks anything, and it explicitly filters OUT
  nested embeds.
- `destroy()` (`:53-62`):
  ```
  destroy(): void {
      this.contentObserver.disconnect();
      this.listeners.abort();
      // Obsidian's embed DOM outlives this view (plugin disable/update, view
      // recreation). Leaving a chevron behind would make an embed LOOK foldable
      // while nothing is wired to fold it.
      for (const embed of this.topLevelEmbeds()) {
          EmbedFoldDom.unmark(embed);
      }
  }
  ```
  Only unmarks TOP-LEVEL embeds (via `topLevelEmbeds()`), confirming the ticket's premise:
  nested embeds under `contentDOM` are never swept here.

## 4. `src/main.ts` — lifecycle

Full file is short (37 lines). `onload()` (`:18-32`): builds `FoldableEmbedsSettingsStore`,
awaits `settings.load()`, builds `FoldStateStore`, constructs
`this.postProcessor = new FoldableEmbedsPostProcessor(store, readSettings)`, registers it via
`this.registerMarkdownPostProcessor(this.postProcessor.process)` (`:27`), registers the Live
Preview extension via `this.registerEditorExtension(livePreviewFoldExtension(readSettings))`
(`:30`, comment: "Needs no onunload counterpart: registerEditorExtension unregisters itself,
CM6 then destroys the view plugin, whose destroy() removes the injected DOM."), and adds the
settings tab (`:31`). `onunload()` (`:34-36`) calls only
`this.postProcessor?.disconnectAll()`.

No `AbortController` exists at the plugin level. No `this.register(...)` (the generic
disposer-registration Obsidian API) call exists anywhere in `main.ts` or the post-processor.
`registerMarkdownPostProcessor` has no per-call teardown hook of its own for DOM already
rendered by a PAST invocation — Obsidian only stops invoking the callback going forward.
The natural place to plug in `MarkdownRenderChild` + `ctx.addChild(...)` per the ticket's
planned fix is inside `FoldableEmbedsPostProcessor.makeFoldable` (or `process`), since that
is where `ctx: MarkdownPostProcessorContext` is already available per embed
(`foldableEmbedsPostProcessor.ts:41,50-56`).

## 5. e2e harness (`e2e/`)

- Structure: Playwright specs matching `**/*.e2e.ts` under `e2e/`, config at
  `e2e/playwright.config.ts` — `workers: 1`, `fullyParallel: false` (serial; one real
  Obsidian/Electron instance per spec FILE), `timeout: 120_000`ms per test,
  `expect.timeout: 15_000`ms. `testDir: "."` relative to `e2e/`.
- Vault fixtures: NOT a static fixtures directory. `ObsidianHarness.launch({ extraFixtures })`
  (`e2e/obsidianHarness.ts:107`) copies the base `.dev-vault/` (built via
  `npm run setup:dev-vault`, which also builds+copies the plugin into
  `.dev-vault/.obsidian/plugins/<id>/`) to a throwaway `VAULT_COPY_DIR`
  (`prepareVaultCopy`, `:441-459`), deletes any stale `data.json`, then WRITES each
  `extraFixtures` entry (`vaultRelativePath -> content` string) to disk via
  `fs.writeFileSync` (`:454-458`). So fixture notes are authored inline in each spec file as
  string constants (e.g. `NOTE_CONTENT`, `NESTED_FIXTURES` in
  `live-preview-foldable-embeds.e2e.ts:37-63`) and materialized fresh per test run — there is
  no persisted `e2e/fixtures/*.md` directory.
- Plugin enable/disable in a test: `ObsidianHarness.setPluginEnabled(enabled: boolean)`
  (`e2e/obsidianHarness.ts:341-356`) runs `page.evaluate` calling
  `app.plugins.enablePlugin(pluginId)` / `disablePlugin(pluginId)` on a REAL running Obsidian,
  then polls `window.app.plugins.plugins[pluginId]` presence via `page.waitForFunction`.
- Existing teardown assertion in `e2e/live-preview-foldable-embeds.e2e.ts`: the requested
  "around line 233" region is actually a DIFFERENT test (the effective-fold-invert guard,
  `:227-237`); the real Live-Preview teardown assertion is
  `test("disabling the plugin strips its injected DOM, and re-enabling rewires clicks", ...)`
  at `:345-369`:
  ```
  test("disabling the plugin strips its injected DOM, and re-enabling rewires clicks", async () => {
      // Baseline: the injected marks are really there before the plugin goes away.
      await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).not.toHaveCount(0);

      await harness.setPluginEnabled(false);

      // Asserted BEFORE any view rebuild (which would restore pristine DOM on its own and
      // hide a leaky teardown): Obsidian's embed DOM is REUSED across plugin unload, so
      // destroy() must leave it exactly as Obsidian rendered it.
      await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).toHaveCount(0);
      await expect(page.locator(".cm-content .fen-collapse-icon")).toHaveCount(0);

      await harness.setPluginEnabled(true);
      // Re-enter editing mode: the reloaded plugin's editor extension attaches to
      // freshly built editor views.
      await harness.setMarkdownViewMode("preview");
      await harness.setMarkdownViewMode("source");
      await expect(embeds().nth(EMBED_UNMARKED)).toBeAttached();

      // Fold state is per-view CM state, so a reload starts clean: the unmarked embed is
      // unfolded again and one click must fold it (proving the title was really rewired).
      await expectFolded(embeds().nth(EMBED_UNMARKED), false);
      await embeds().nth(EMBED_UNMARKED).locator(".markdown-embed-title").click();
      await expectFolded(embeds().nth(EMBED_UNMARKED), true);
  });
  ```
  Note this asserts `.cm-content .fen-embed` count is 0 — but only counts what
  `topLevelEmbeds()`-based `destroy()` actually unmarks; it does NOT independently prove
  nested embeds under `.cm-content` are clean, since the current fixture set for this test
  (`NOTE_CONTENT`) has no nested embed inside it at that point in the shared serial run. A
  companion test worth adding per the ticket: assert `.fen-embed`/`.fen-collapse-icon` count
  0 specifically within a NESTED embed's body while the plugin is disabled/re-enabled — the
  existing nested-embed test/fixture (`NESTED_PARENT_PATH="lp-nested.md"`,
  `NESTED_FIXTURES` at `:60-63`, exercised by
  `test("clicking a NESTED embed's title never folds the embed it sits inside", ...)` at
  `:387-409`) is the natural fixture to extend/reuse for that assertion, and the READING-mode
  analogue lives in `e2e/foldable-embeds.e2e.ts` (see below).
- Related reading-mode OUTCOME test (not a teardown test, and the reason the post-processor
  currently has NO unmark path): `e2e/foldable-embeds.e2e.ts:170-185`,
  `test("disabling the plugin leaves no injected DOM in the reading view", ...)` — asserts
  `.markdown-reading-view .fen-embed` / `.fen-collapse-icon` / `.fen-folded` counts are 0
  after `setPluginEnabled(false)`, with comment explaining Obsidian discards top-level
  reading-view DOM on toggle so no removal code is needed FOR TOP-LEVEL reading-mode DOM.
  This test's premise (whole reading view is discarded) is a DIFFERENT surface than the bug
  ticket's premise (embed BODIES rendered inside a Live Preview widget's `contentDOM`,
  which Obsidian reuses) — they are not in tension, but a naive fix must not weaken this
  existing outcome assertion.
- npm scripts: `lint` → `eslint .`; `build` → `tsc -noEmit -skipLibCheck && node
  esbuild.config.mjs production`; `test:e2e` → `bash scripts/run-e2e.sh` (auto-downloads
  Obsidian via `OBSIDIAN_PATH`/`setup-obsidian-bin.sh` if unset, runs `npm run
  setup:dev-vault`, type-checks specs with `npx tsc -p e2e/tsconfig.json`, then
  `npx playwright test --config e2e/playwright.config.ts "$@"`).
- Running a single e2e spec: `npm run test:e2e -- e2e/live-preview-foldable-embeds.e2e.ts`
  (extra args pass straight through to `playwright test`, per `scripts/run-e2e.sh`'s
  trailing comment and `exec ... "$@"`). A single test within a file can be further scoped
  with Playwright's own `-g "<test name>"` flag, e.g.
  `npm run test:e2e -- e2e/live-preview-foldable-embeds.e2e.ts -g "strips its injected DOM"`.

## 6. Unit test runner

None. No Jest/Vitest/`node:test` config or `test`/`test:unit` npm script exists in this
repo's `package.json` (only `dev`, `build`, `version`, `lint`, `setup:obsidian`,
`setup:dev-vault`, `test:e2e`). The only `jest.config.js` found under the repo tree belongs
to a transitive `node_modules` dependency (`json-schema-migrate`), not this project. All
functional verification is via the Playwright e2e suite plus `tsc`/`eslint`.

## 7. Prior ticket: `reading-mode-post-processor-leaves-chevrons-behind-on-plugin-unload.md`

Status: `closed` (`closed_iso: 2026-07-24T22:51:05Z`). Original bug text: the post-processor
"injects a chevron, fold classes and a title-click handler into embed DOM, but has no
unload-time removal ... Consequence: disabling the plugin can leave a dead chevron on
already-rendered embeds until the view re-renders." Its "Design" section proposed reusing
`EmbedFoldDom.unmark` and "a way to reach the marked elements on unload — e.g. track them, or
sweep the reading views on `onunload`," with the caveat "Keep it simple; do not add a
registry if a sweep suffices."

Resolution note (why NO teardown code was added): "Not reproducible on Obsidian 1.12.7:
MEASURED that toggling the plugin makes Obsidian discard the rendered reading-view DOM
entirely (elements stamped with a data attribute before the disable are all detached
afterwards), so no chevron/fold-class remnant is ever user-visible. No unmark-on-unload path
added — a registry/sweep would be complexity for a defect that does not exist (unlike Live
Preview, whose embed DOM Obsidian REUSES, which is why its ViewPlugin.destroy() must
unmark)." The acceptance criterion was instead captured as the OUTCOME test in
`e2e/foldable-embeds.e2e.ts:170-185` described above, with the explicit caveat that it will
start failing "if a future Obsidian begins reusing reading-view DOM."

**Why the new fix does not contradict this**: the prior decision's empirical claim was
narrowly about TOP-LEVEL reading-view DOM (`.markdown-reading-view`), which Obsidian
currently discards wholesale on toggle. It said nothing about embed BODIES rendered by the
SAME post-processor pipeline but hosted inside Live Preview's `contentDOM` — that DOM is
governed by Live Preview's reuse behaviour (documented in
`livePreviewFoldExtension.ts`'s module doc: "the widget DOM is Obsidian's and is REUSED
across edits, so every injection needs a matching removal in `destroy()`"), not reading
mode's. The post-processor's assumption that its listeners "live and die with" freshly
created DOM (`foldableEmbedsPostProcessor.ts:69-71`) is true ONLY for genuine reading-view
renders, not for embed bodies nested inside a reused Live Preview widget. So the planned fix
(MarkdownRenderChild + ctx.addChild teardown, AbortSignal-based listener removal, WeakSet
guards) is additive scoping — it does not re-litigate or invalidate the closed ticket's
finding about top-level `.markdown-reading-view` DOM being discarded; it should keep that
existing e2e outcome test green while separately fixing the nested/Live-Preview-hosted case.
Practically, this also means the fix should NOT assume `ctx.addChild`'s
`MarkdownRenderChild.onunload()` fires on ordinary reading-view discard (it does not need
to, per the prior finding) — its real job is to make teardown correct for the nested/embedded
case where Obsidian does NOT discard the DOM out from under the plugin.

## Open items for the fix

- `EmbedFoldDom.onTitleClick` already supports an `AbortSignal` via `options` — the
  post-processor just never passes one (`foldableEmbedsPostProcessor.ts:72-78`). Threading an
  `AbortController` per `MarkdownRenderChild` (aborted in its `onunload`) mirrors
  `livePreviewFoldExtension.ts:20,55`.
  `EmbedFoldDom.unmark` already does the class/chevron removal half; it needs no changes.
- Replacing the CSS-class wiring guards (`foldableEmbedsPostProcessor.ts:58,143`) with a
  `WeakSet<HTMLElement>` mirrors `livePreviewFoldExtension.ts`'s `wiredTitles` pattern
  (`:18-26`) — same rationale (leftover class from a dead instance must not block rewiring).
  Note the post-processor's two guards key off `embed`, while Live Preview's keys off
  `title`; whichever element the new `WeakSet` keys off must be present/stable across the
  specific re-entry paths the post-processor guards against (a second post-process pass over
  live DOM, and repeated `whenMarkdownEmbedReady` observer callbacks) — check both call sites
  when swapping.
- `destroy()` in `livePreviewFoldExtension.ts:53-62` needs to iterate ALL `.internal-embed`
  under `contentDOM` (not just `topLevelEmbeds()`) when unmarking, per the ticket — but should
  keep excluding nested embeds from the WIRING logic (`sync()`'s `topLevelEmbeds()` loop,
  `:65-83`), since nested embeds are still correctly not Live-Preview's business to WIRE, only
  to UNMARK on teardown (their marks/listeners were placed by the reading-mode
  post-processor, which is the thing gaining its own teardown in part 1 of this fix — so it's
  worth checking, once part 1 lands, whether Live Preview's `destroy()` still needs to sweep
  nested embeds at all, or whether the post-processor's own `MarkdownRenderChild` teardown
  now makes that redundant).
