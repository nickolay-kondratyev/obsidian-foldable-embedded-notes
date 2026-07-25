# Exploration: unresolved-embed-observer-leak

## 1. `src/foldableEmbedsPostProcessor.ts` (full file read; 265 lines)

- `MEDIA_EMBED_CLASSES` (`:17`): `["media-embed", "image-embed", "video-embed", "audio-embed", "pdf-embed"]`. Does **not** include `file-embed`.
- `liveObservers` field (`:32`): `Set<MutationObserver>`, doc comment says "disconnected on plugin unload."
- `liveMarks` field (`:39`), `wiredEmbeds` (`:40`, a `WeakSet`-backed `WiredElements`), `foldKeys` (`:42`).
- `teardown()` (`:59-72`): disconnects+clears every `liveObservers` entry, then calls `mark.unload()` on every `liveMarks` entry (which reenters `forget()` and mutates the set — iterates over `Array.from(this.liveMarks)` to be safe).
- `process` (`:74-85`): for every `.internal-embed` in the section, registers a fold key synchronously, then calls `whenMarkdownEmbedReady(embed, onReady)`.
- `makeFoldable` (`:87-140`): builds the `FoldableEmbedMark`, adds it to `liveMarks`/`wiredEmbeds`, calls `mark.load()` itself, wires DOM + click handler, then `ctx.addChild(mark)` last.
- `forget` (`:143-146`): removes mark from `liveMarks` and embed from `wiredEmbeds` — called from `FoldableEmbedMark.onunload`.
- `whenMarkdownEmbedReady` (`:220-247`) — **the ticket's target**:
  - `:221-223` — synchronous guard: if `wiredEmbeds.has(embed)`, bail (already wired by this instance). No `isMediaEmbed` check here.
  - `:224-228` — synchronous path: if `markdownEmbedTitle(embed)` already resolves (i.e. embed already has `.markdown-embed` + title), call `onReady` and return. **No check for "is this a resolved non-note embed" on this path at all** — an unresolved embed (`internal-embed is-loaded file-embed mod-empty`, no `.markdown-embed`) falls through to the observer branch below every single call.
  - `:229-246` — otherwise creates a `new MutationObserver(...)`, adds it to `liveObservers` (`:240`), and starts observing (`childList`, `subtree`, `attributes` on `class`) (`:241-246`). The observer's own callback (`:229-239`) disconnects+removes itself from `liveObservers` via `stopObserving` (`:249-252`) in exactly two cases: title appears (`:230-234`), or `isMediaEmbed(embed)` becomes true (`:236-238`, checked only on a **subsequent mutation**, never synchronously and never at observer-creation time).
  - An unresolved embed's classlist (`internal-embed is-loaded file-embed mod-empty`) never gains `.markdown-embed` and is not in `MEDIA_EMBED_CLASSES`, so neither branch in the observer callback ever fires for it — the observer, and the closure capturing `embed`/`onReady`/(transitively) `ctx`/`sectionEl` (via `makeFoldable`'s closure passed as `onReady`), lives forever, i.e. until `teardown()`. Since `process` runs on every render, and `whenMarkdownEmbedReady`'s guard at `:221` only fires once an embed *is* wired (which never happens for an unresolved one), every re-render of the section creates a brand-new observer for the same embed span, without ever removing the old one → monotonic growth.
- `isMediaEmbed` (`:262-264`): `MEDIA_EMBED_CLASSES.some(cls => embed.classList.contains(cls))`.
- `markdownEmbedTitle` (`:255-260`): returns non-null only once `.markdown-embed` class is present AND a `.markdown-embed-title` child exists.

### Exactly which lines the ticket's two design points touch
1. "Bail BEFORE creating the observer when the embed is already a resolved non-note embed — add `file-embed` to the non-note class list and run that check on the synchronous path too":
   - `MEDIA_EMBED_CLASSES` array literal at `:17` (add `"file-embed"`).
   - `whenMarkdownEmbedReady` synchronous path `:224-228` (needs an `isMediaEmbed`/non-note check inserted before or alongside the observer-creation branch `:229-247`, so an already-resolved-but-non-note embed never reaches `:229`).
   - `isMediaEmbed` at `:262-264` becomes the check reused; naming may need adjusting since "media" no longer covers plain unresolved-file embeds semantically (`file-embed` is Obsidian's class for *any* non-markdown, non-media internal embed target, including unresolved links — see part 6 below).
2. "Tie each observer's life to its render rather than to plugin unload: `ctx.addChild(new MarkdownRenderChild(el))` whose `onunload` disconnects":
   - Requires `whenMarkdownEmbedReady` (`:220-247`) to receive `ctx` (currently only `embed`/`onReady` — `process` at `:83` already has `ctx` in scope and could pass it through).
   - Requires a new render-child type (parallel to `FoldableEmbedMark` in `foldableEmbedMark.ts`) whose `containerEl` is `embed` and whose `onunload()` calls `observer.disconnect()` (and presumably removes itself from `liveObservers`, or replaces `liveObservers` bookkeeping entirely — see part 3).
   - Interacts with `teardown()` (`:59-63`) and the `liveObservers` set (`:32`, `:240`, `:251`) — see part 3 for whether `liveObservers` remains necessary.

## 2. `src/foldableEmbedMark.ts` (full file read; 53 lines) — the existing `MarkdownRenderChild` pattern

- `FoldableEmbedMark extends MarkdownRenderChild` (`:27`). Constructor (`:31-36`) takes `embed: HTMLElement` and an `onUnloaded` callback, and calls `super(embed)` — `MarkdownRenderChild`'s constructor takes the `containerEl`; here that IS the embed span itself (`.internal-embed`), not some wrapper.
- `get embed()` (`:39-41`) is just an alias for `this.containerEl` ("named for its role" — comment at `:38`).
- `listenerOptions` getter (`:44-46`) exposes an `AbortController.signal` so DOM listeners can be tied to the mark's lifetime.
- `onunload()` (`:48-52`): aborts listeners, calls `EmbedFoldDom.unmark(this.embed)` (DOM cleanup), then calls `this.onUnloaded(this)` — the owner-supplied callback (bound to `forget` in the post-processor) so the owner's bookkeeping (`liveMarks`, `wiredEmbeds`) stays in sync.
- Extensive doc comment (`:7-26`) explains WHY the mark exists at all and documents the exact Obsidian API contract being relied on: `MarkdownPostProcessorContext.addChild`'s documented unload trigger is the DOM — "if the containerEl of the child is ever removed, the component's unload will be called." This is the same contract design point 2 wants a second render child to lean on.
- Construction site: `foldableEmbedsPostProcessor.ts:109` (`new FoldableEmbedMark(embed, (unloaded) => this.forget(unloaded))`), loaded explicitly at `:115` (`mark.load()` — the post-processor loads it itself rather than solely relying on `ctx.addChild`, because "a component that was never loaded ignores `unload()`" per the comment at `:112-114`), and handed to `ctx.addChild(mark)` last, at `:139`.
- Design point 2's new render child would need the SAME two-step treatment: constructed with the embed span as `containerEl`, explicitly `.load()`ed by the post-processor (not solely relying on `addChild` to load it — same reasoning as `:112-114`, since `whenMarkdownEmbedReady` currently never loads anything itself and observers are created independent of any component lifecycle), and `ctx.addChild()`ed. Unlike `FoldableEmbedMark`, this new child's `containerEl` (the embed span) is the SAME element for its whole life (no swap), so the DOM-removal trigger applies identically.

## 3. `teardown()` and what remains needed after design point 2

Current (`foldableEmbedsPostProcessor.ts:59-72`):
```
teardown(): void {
    for (const observer of this.liveObservers) { observer.disconnect(); }
    this.liveObservers.clear();
    for (const mark of Array.from(this.liveMarks)) { mark.unload(); }
    this.liveMarks.clear();
}
```
The comment at `:64-66` explains why marks are unloaded manually and NOT left to `ctx.addChild`: MEASURED on Obsidian 1.12.7, disabling the plugin does NOT unload render components whose parent DOM Obsidian keeps around (a nested embed inside a Live Preview widget). The e2e spec at `e2e/foldable-embeds.e2e.ts:303-320` ("disabling the plugin leaves no injected DOM in the reading view") documents the DIFFERENT, opposite fact for plain reading-view embeds: Obsidian DISCARDS the reading-view DOM outright on plugin disable, so no explicit unmark-on-unload path is needed there — but the manual teardown loop still exists because it must ALSO cover the Live-Preview-nested case.

Given that asymmetry (proven for marks), the observer-holding render child from design point 2 sits in the SAME reading-view DOM as `FoldableEmbedMark` — an `.internal-embed` span. If the observed history for marks holds for a second render child too, `liveObservers`/manual disconnect-on-teardown would likely STILL be needed for the same Live-Preview-nested-widget reason (`addChild`'s unload trigger doesn't fire on plugin disable when Obsidian doesn't remove the containerEl). This repo's own doc comments treat that as MEASURED behavior specific to 1.12.7, not something to assume — the implementer should re-verify with the same e2e technique (`e2e/foldable-embeds.e2e.ts:303-320` and the Live Preview equivalent noted below) rather than assume `liveObservers` becomes redundant.

Live Preview equivalent for marks, for reference: `e2e/live-preview-foldable-embeds.e2e.ts:352,416,429` — Obsidian's embed DOM IS reused across plugin unload in Live Preview, so an explicit removal path is required there too; the nested nature of design point 2's observer (attached inside embed bodies that could themselves be inside such reused Live Preview widget DOM) means this precedent is directly relevant.

Conclusion: `liveObservers` (or an equivalent second `Set`) most likely still needs to exist for `teardown()` to reach observers hanging off DOM Obsidian doesn't discard on unload — the ticket's design point 2 fixes the PER-RENDER leak (observer never disconnects because the embed never resolves) but doesn't by itself replace the PLUGIN-UNLOAD path that `teardown()` exists for. This should be confirmed against real Obsidian, not assumed.

## 4. e2e harness (`e2e/`)

- Structure: one Playwright spec per concern (`foldable-embeds.e2e.ts`, `live-preview-foldable-embeds.e2e.ts`, `nested-fold-cold-start.e2e.ts`, `reading-mode-fold-key.e2e.ts`, `settings-persistence.e2e.ts`, `start-collapsed-setting.e2e.ts`, `hello-world.e2e.ts`), plus shared helpers: `obsidianHarness.ts` (652 lines — launches real Obsidian via Electron, vault/fixture setup, `openFile`, `setMarkdownViewMode`, `setPluginEnabled`, etc.), `obsidianAppApi.ts` (typed facade over `window.app` for use inside `page.evaluate`), `foldAssertions.ts`, `reRenderGuard.ts`. Config: `playwright.config.ts`. Run via `npm run test:e2e` → `scripts/run-e2e.sh`.
- Test hook for internal plugin state: `main.ts:17` keeps `this.postProcessor` as a plugin instance field (declared `private` in TS, but TS privacy is erased at runtime, so it's a real, accessible JS property). Specs reach it via `page.evaluate` against `window.app.plugins.plugins[PLUGIN_ID]` (`PLUGIN_ID` exported from `obsidianHarness.ts`), e.g. `plugin.postProcessor.liveObservers.size`. **This is exactly how the reviewer counted "live observers"** — see part 4b.
- Closest existing specs: `e2e/foldable-embeds.e2e.ts:303-320` (plugin-disable / reading-view DOM discard, quoted in part 3) is the closest "teardown" spec; nothing in the checked-in `e2e/` currently exercises unresolved embeds, media embeds, or observer counts directly — those only exist as throwaway probes (part 4b).

### 4b. `.tmp/probe/` (gitignored, present in this worktree) — the reviewer's probe technique

`.tmp/probe/probe6.e2e.ts` ("Round 6: does the post-processor's liveObservers set accumulate?") is the reviewer's actual reproduction. Key pieces:
- Fixtures: `probe-missing-host.md` with two `![[definitely-not-here]]` / `![[also-not-here]]` unresolved embeds, and `probe-image-host.md` with two `![[fake.png]]` embeds (dummy non-image bytes) as the "media embed" control.
- `observerCount()` helper: `page.evaluate` reading `window.app.plugins.plugins[PLUGIN_ID].postProcessor.liveObservers.size` — the direct internal-state read; no dedicated test hook beyond the plain field access.
- `embedClasses()` helper: reads `class` attribute of every `.markdown-reading-view .internal-embed`.
- Test opens the unresolved-embed note 3× (re-render), interleaved with opening a neutral note in between, and logs `observers=` and `classes=` each round.
- **Measured output** (`.tmp/probe/run6.log`):
  - Unresolved embeds: classes are `internal-embed is-loaded file-embed mod-empty` on every round; `observers` grows `0 → 2 → 4 → 6` (monotonic, +2 per re-render, matching the ticket's numbers exactly).
  - Image (media) embeds: classes are `internal-embed media-embed image-embed is-loaded`; `observers` stays flat at `6` (the count carried over from the unresolved-embed leak in the SAME test run, but does not grow further across the 3 image rounds) — confirms media embeds do NOT leak.
- Other probe files (`probe.e2e.ts`…`probe15.e2e.ts`) investigate unrelated tickets (fold-key ordering, nested embed host registration — e.g. `probe15.e2e.ts` is explicitly scoped to a different ticket, `nid_zqaxj18jbxwnazzz8aeggz91u_e`). Not relevant to this one beyond showing the same `page.on("console", ...)` / `page.evaluate` techniques used throughout.
- `.tmp/probe/` also contains many `*.log` files from an unrelated large investigation into fold-key/adopt-recording behavior — not related to this ticket.

## 5. Unit tests / lint / build

- **No unit test runner exists in this repo.** `package.json` has no `jest`/`vitest`/`mocha` dependency and no `"test"` script. The only test-shaped script is `"test:e2e": "bash scripts/run-e2e.sh"`, which drives the Playwright/Electron e2e suite in `e2e/`. Any acceptance-criteria coverage ("re-rendering ... does not grow live observers") has to be an e2e spec (or, per CLAUDE.md convention, a throwaway probe promoted into `e2e/`), not a unit test.
- `npm run build` → `"tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"` (type-check, then bundle).
- `npm run lint` → `"eslint ."`, using `eslint-plugin-obsidianmd`; CLAUDE.md states eslint scopes the obsidianmd ruleset to `src/`, and `e2e/` plus build-artifact dirs (`.tmp`, `.dev-vault`) are ESLint-ignored.
- `npm run dev` → `node esbuild.config.mjs` (watch build, no type-check).
- Release gate (`release_to_public.sh`) runs lint/build/e2e together; `SKIP_E2E=1` opts out of e2e only.

## 6. Things that could make the ticket's design harder than stated

- **`MarkdownPostProcessorContext.addChild` is already in active use** in this exact file (`foldableEmbedsPostProcessor.ts:139`, via `FoldableEmbedMark`), so design point 2's mechanism is proven to work in this codebase, not speculative. The `FoldableEmbedMark` doc comment (`:17-21` in `foldableEmbedMark.ts`) documents the exact Obsidian contract being relied on.
- **`isMediaEmbed`/class-based classification is inherently racy for the async path** — Obsidian's own class list on an embed changes over time (`is-loaded`, `file-embed`, `mod-empty` for unresolved; `media-embed image-embed …` for media). The reviewer's MEASURED note ("Media embeds measured CLEAN... because Obsidian does mutate them afterwards") implies the async/observer path is there for a REASON: media embeds apparently start without their final class and only gain `media-embed`/etc. via a later mutation, which is exactly why `isMediaEmbed` is checked inside the observer callback (`:236-238`) rather than only up front. If design point 1 makes the synchronous check trigger the bail based on a media embed's PRE-mutation class list, it could incorrectly treat a media embed as "not yet resolved" and STILL create an observer for it (which is fine/existing behavior) — but the risk is the reverse: bailing too early on a media embed before its classes settle would skip wiring, though since media embeds are never made foldable, an early bail is actually harmless for them. The real risk is for `file-embed` specifically: is `file-embed` used ONLY for genuinely unresolved links, or could Obsidian ALSO stamp `file-embed` transiently on an embed that later resolves to a media type (before the media-specific class arrives)? The repo has no direct evidence either way for that transient state — `.tmp/probe/run6.log` shows `file-embed mod-empty` for a genuinely-broken link across 3 rounds without ever becoming a media embed, but does not test a *linked* (soon-to-resolve) media file's transient class list. This transient-state question is the main risk in "bail before creating the observer" being correct for ALL non-note-embed cases, not just the always-unresolved one the ticket demonstrates.
- **`mod-empty`** (seen in the unresolved-embed class list `internal-embed is-loaded file-embed mod-empty`) is Obsidian's "this embed's target doesn't exist" class and is NOT currently referenced anywhere in `src/` (`grep` for `mod-empty` only hits `.tmp/probe-marker-dump.txt` and `.tmp/probe/run1.log`/`run6.log`) — it is a second, arguably more precise signal the implementer might consider instead of/in addition to `file-embed`, since `file-embed` per Obsidian's own naming is the class for ANY resolved non-media file embed target class family, not specifically "unresolved." (No repo evidence pins down all classes Obsidian's `file-embed` covers beyond what `.tmp/probe/run6.log` shows for these two fixture cases; this is the one place where the ticket's naming ("add `file-embed` to the non-note class list") should be treated as a starting hypothesis to verify against real Obsidian, not settled fact.)
- **No unit tests exist**, so proving the acceptance criterion ("re-rendering ... does not grow live observers") can only be done via a NEW e2e spec (there is a ready-made template in `.tmp/probe/probe6.e2e.ts`, gitignored, that could be adapted/promoted into `e2e/`) reading `plugin.postProcessor.liveObservers.size` exactly as the reviewer did — no existing checked-in e2e spec exercises unresolved embeds at all today.
