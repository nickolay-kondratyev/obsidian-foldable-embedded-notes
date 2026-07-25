# Obsidian foldable embedded notes

Plugin that makes embedded notes (`![[ ]]`) foldable in reading mode and Live Preview, plus a `![[ ]]-` syntax to fold by default.

## Project overview

- Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` → compiled to `main.js`.
- Release artifacts (top level of the plugin folder): `main.js`, `manifest.json`, optional `styles.css`.

### Feature architecture (foldable embeds)

Two independent implementations — one per render mode — over one shared DOM contract.
They deliberately share NO readiness logic, fold-state identity or marker parsing;
those genuinely differ per mode.

- `src/main.ts` — lifecycle only: loads settings, then registers the markdown
  post-processor, the editor extension and the settings tab.
- `src/settings/` — the plugin's ONE setting, "start embedded notes collapsed"
  (`data.json`, default off = today's behaviour):
  - `foldableEmbedsSettings.ts` — settings shape, `DEFAULT_SETTINGS` (the single source of
    truth for defaults) and `foldedByDefault(settings, hasFoldMarker)`: the fold-default
    truth table both modes project, kept in ONE place. The setting makes `![[x]]-` a no-op;
    it never changes marker syntax.
  - `foldableEmbedsSettingsStore.ts` / `foldableEmbedsSettingTab.ts` — load/save over a
    narrow persistence port; one toggle, saved on change. Saves are SERIALIZED through one
    promise queue (Obsidian does not await `onChange`) and merge over the RAW loaded
    `data.json`, so keys this version does not know round-trip instead of being dropped.
  - Both modes read the CURRENT settings through a `ReadSettings` accessor, so a change
    lands on the NEXT render (reopen / mode switch / edit). Deliberately no CM6
    `Compartment` and no forced rerender of open panes.
- `src/embedFoldDom.ts` — the shared DOM contract used by BOTH modes: the class names that
  must match `styles.css`, chevron injection, fold-class application, `isFolded` (what is
  currently DISPLAYED — the operand both modes' title clicks invert, so a click always does
  what the user just saw it should do even when the projection lags the computed default),
  the title-click handler (which must swallow Obsidian's own "open the embed" behaviour),
  and `unmark` (the inverse, for teardown).
- `src/foldStateStore.ts` — in-memory session fold state for reading mode (`Map`, no
  persistence).
- `src/wiredElements.ts` — the "already wired by THIS instance" guard both modes use: a
  `WeakSet`, deliberately NOT a DOM check, so a re-enabled plugin can rewire DOM its
  predecessor marked.
- `src/foldableEmbedMark.ts` — one reading-mode embed's injected state and its exact
  inverse, as a `MarkdownRenderChild` (`ctx.addChild`) owning an `AbortController` for the
  title listener. Its unload trigger is the DOM: `MarkdownPostProcessorContext.addChild`
  unloads a child once its `containerEl` (here the embed span) is removed — so a re-render
  reclaims marks, but a plugin disable does NOT (it removes nothing; MEASURED on 1.12.7).
  Hence the post-processor also unloads every live mark itself — needed because embed BODIES
  inside Live Preview widgets are Obsidian's REUSED DOM, unlike a reading view (discarded
  wholesale on toggle).
  - KNOWN LIMITATION, measured: re-enabling the plugin does not rewire embeds already on
    screen, because a preview↔source round trip REUSES a rendered embed body and never
    re-runs the post-processor over it. A nested embed becomes foldable again only once the
    note is REOPENED. Consistent with "a change lands on the NEXT render", but unlike Live
    Preview's top-level embeds, which `registerEditorExtension` rebuilds immediately.
- `src/foldableEmbedsPostProcessor.ts` — READING mode, per-section post-processor. Note
  embeds load async, so it waits (MutationObserver, or sync when ready) for
  `.markdown-embed` + title, then: strict `-` marker parse/strip on the embed span's next
  text-node sibling — the dash must be followed by whitespace or END OF LINE, i.e. nothing
  follows it in its PARENT element or a `<br>` does; NOT merely the end of that text node,
  or `![[x]]-**bold**` would swallow a literal dash. Only SIBLINGS are inspected, so an
  embed wrapped in inline markup (`**![[x]]-** tail`) still loses its dash (pre-existing,
  rare) — initial fold state (session store wins over the `foldedByDefault`
  default), and DOM wiring via `EmbedFoldDom` under one `FoldableEmbedMark`. `teardown()`
  (called from `onunload`) stops the observers and unloads every live mark.
- `src/livePreview/` — LIVE PREVIEW, a CM6 editor extension:
  - `markedEmbedLines.ts` — whole-line `![[x]]-` scan (cached in a StateField) + the
    decoration hiding the marker dash, gated on `editorLivePreviewField` so plain Source
    mode stays verbatim. Trailing blanks after the dash are tolerated (reading mode accepts
    them too, and they are invisible); the decoration hides EXACTLY the dash, never them.
  - `foldStateField.ts` — explicit fold state as a `RangeSet` (positions map through
    edits) + `effectiveFold`: an explicit choice beats the `foldedByDefault` default.
  - `livePreviewFoldExtension.ts` — ViewPlugin projecting that state onto Obsidian's embed
    widgets, driven by a `contentDOM` MutationObserver (embeds render async, outside CM's
    update cycle), plus the teardown that removes everything injected.
- Live Preview constraints worth knowing before changing it: `posAtDOM` on a widget is only
  LINE-accurate, so fold state is anchored and read back per LINE (embeds sharing a line
  fold together); it THROWS (never returns a sentinel) for a node CM cannot map. Only
  TOP-LEVEL embeds are wired — a nested one resolves to its parent's line, and it is the
  post-processor's business anyway. The widget DOM is Obsidian's and is REUSED across
  edits, so every injection needs a matching removal in `destroy()`.
- A fold anchor lives and dies with its LINE (`ExplicitFold.mapMode = TrackAfter`): any
  deletion consuming the character after the anchor drops it, so a deleted line cannot hand
  its fold to the embed that moves up; insertions at the line start leave it.
- `styles.css` — collapse (`.fen-folded`), forced-visible title bar, chevron rotation. All
  fold state is class-driven (no inline styles / no runtime `<style>`). Shared by both modes.
- eslint scopes the obsidianmd plugin ruleset to `src/`; `e2e/` (Node/Playwright harness) and
  build-artifact dirs (`.tmp`, `.dev-vault`) are ignored.
- `@codemirror/state` / `@codemirror/view` are devDependencies pinned to obsidian's peer
  versions: externalised at bundle time, provided by Obsidian at runtime — never runtime deps.

## Tooling & commands

- npm + esbuild (`esbuild.config.mjs`); `obsidian` type definitions.
- `npm install` — deps.
- `npm run dev` — watch build.
- `npm run build` — production build.
- `npm run lint` — ESLint with `eslint-plugin-obsidianmd` (also runs in CI on every commit).

## Conventions

- Keep `main.ts` minimal: lifecycle only (`onload`/`onunload`, `addCommand`). Delegate feature logic to modules under `src/`.
- Split files past ~200-300 lines; one responsibility per module.
- TypeScript `"strict": true`. Prefer `async/await`.
- Bundle everything into `main.js` (no unbundled runtime deps). Keep deps small and browser-compatible.
- Register everything needing cleanup via `this.register*` helpers (`registerEvent`, `registerDomEvent`, `registerInterval`) so unload/reload never leaks.
- Stable command IDs — never rename once released.
- Avoid Node/Electron APIs for mobile compatibility; set `isDesktopOnly` accordingly.
- Do not commit build artifacts (`node_modules/`, `main.js`).

## Manifest (`manifest.json`)

- Required: `id`, `name`, `version` (SemVer `x.y.z`), `minAppVersion`, `description`, `isDesktopOnly`. Optional: `author`, `authorUrl`, `fundingUrl`.
- `id` is stable API — never change after release; for local dev it matches the folder name.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical rules: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Versioning & release

- `./release_to_public.sh [patch|minor|major]` is the ONLY release entry point: gates on
  lint/build/e2e (`SKIP_E2E=1` opts out), bumps `package.json` + `manifest.json` +
  `versions.json` (`npm version` → `version-bump.mjs`), commits, pushes commit + tag.
- The tag (named exactly after `version`, no leading `v` — enforced by `.npmrc`) is the
  only trigger: `.github/workflows/release.yml` re-verifies tag == manifest version,
  rebuilds, and publishes the release with `main.js`, `manifest.json`, `styles.css`.
- `minAppVersion` is bumped by hand in `manifest.json` before a release; `versions.json`
  picks it up from there.

## Security & privacy

Follow Obsidian's Developer Policies and Plugin Guidelines:

- Local/offline by default; no hidden telemetry; explicit opt-in + disclosure for any external service.
- Never execute or fetch-and-eval remote code, or auto-update outside normal releases.
- Read/write only what's needed inside the vault; never access files outside it or transmit vault contents without consent.

## Settings & UI copy

- Persist settings via `this.loadData()` / `this.saveData()`; provide defaults and a settings tab.
- UI text: sentence case; **bold** for literal labels; arrow notation for navigation (**Settings → Community plugins**).

## Testing

- Manual: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/<plugin-id>/`, reload Obsidian, enable in **Settings → Community plugins**.

### e2e testing
See ./e2e for more info.

## References

- Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API docs: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
