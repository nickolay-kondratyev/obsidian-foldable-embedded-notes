# EXPLORATION — fold-default code paths (read-only findings)

## 1. `src/main.ts` lifecycle
- `onload()` (main.ts:15-22): `new FoldStateStore()` (16) → `new FoldableEmbedsPostProcessor(store)` (17)
  → `registerMarkdownPostProcessor(this.postProcessor.process)` (18); separately
  `registerEditorExtension(livePreviewFoldExtension())` (21) — factory takes **no args** today.
- `onunload()` (24-26): only `postProcessor?.disconnectAll()`.
- A settings object would have to be built in `onload()` and threaded into the post-processor and
  into `livePreviewFoldExtension(...)`; neither accepts anything settings-shaped now.

## 2. Reading mode — `src/foldableEmbedsPostProcessor.ts`
- `const FOLD_MARKER = "-"` (line 6).
- `stripFoldMarker(embed)` (86-102): inspects `embed.nextSibling` text node; dash must be first char
  followed by whitespace/EOL; strips only the dash; **returns boolean = folded-by-default**.
  Hardcoded `false` returns at 89 / 94 / 98 when no marker.
- Initial fold decision (inside `makeFoldable()`, 45-72):
  ```
  56  const foldedByDefault = this.stripFoldMarker(embed);
  57  const key = this.buildKey(embed, ctx, sectionEl, indexWithinSection);
  58  const folded = this.store.get(key) ?? foldedByDefault;
  ```
  Session store wins; else marker default. Runs after title bar ready (`whenMarkdownEmbedReady`, 134-161).

## 3. Live Preview — `src/livePreview/*`
- `markedEmbedLines.ts:19` `WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-$/`; `isMarkedLine(state, lineFrom)` (62-64).
- `foldStateField.ts`: `explicitFoldAt(state, lineFrom)` (60-68) → `boolean | undefined`.
  **Combination point:**
  ```
  79-81  export function effectiveFold(state, lineFrom): boolean {
             return explicitFoldAt(state, lineFrom) ?? isMarkedLine(state, lineFrom);
         }
  ```
  Same `explicit ?? markerDefault` shape as reading mode line 58, backed by StateField/RangeSet.
- `livePreviewFoldExtension.ts`: `sync()` (61-79) paints via `EmbedFoldDom.applyFoldState(..., effectiveFold(state, lineFrom))` (77);
  `toggle()` (81-91) computes `!effectiveFold(...)` (89) and dispatches `setLineFold.of({lineFrom, folded})` (90) — sole write path.

## 4. Shared APIs
`foldStateStore.ts`: `get(key): boolean|undefined`, `set(key, folded): void` — in-memory Map, session-scoped, no persistence.
`embedFoldDom.ts` (static class, DOM contract only — no fold-decision logic):
`CLS_FOLDABLE/CLS_FOLDED/CLS_CHEVRON/CLS_COLLAPSED/CLS_MARKDOWN_EMBED`, `SEL_INTERNAL_EMBED/SEL_EMBED_TITLE`,
`markFoldable`, `ensureChevron`, `applyFoldState`, `onTitleClick`, `unmark`.

## 5. Settings infrastructure: NONE
Repo-wide grep for `PluginSettingTab|loadData|saveData|Settings` in `src/` → zero matches; nothing in
`manifest.json` either. Must be built from scratch (data load/save + `PluginSettingTab` + threading).

## 6. Runtime propagation levers available today
- **Reading mode**: fold state computed only at post-processor time (`process`, 36-43), invoked by Obsidian on
  (re)render. No on-demand re-render call exists in `src/`. The e2e harness forces a fresh render by flipping
  `leaf.setViewState(...)` mode (`e2e/obsidianHarness.ts:220-230`).
- **Live Preview**: `livePreviewFoldExtension()` (150-152) returns a static Extension array, **no `Compartment`**,
  so no reconfigure path today. `effectiveFold` is StateField-based, so a settings-driven change to the default
  term would take effect on the next CM evaluation (any dispatched transaction/effect) rather than needing a
  teardown; no effect currently reads external (non-CM) state. Harness note (`e2e/obsidianHarness.ts:238-241`):
  `workspace.updateOptions()` alone does NOT re-render an already-open editor.
