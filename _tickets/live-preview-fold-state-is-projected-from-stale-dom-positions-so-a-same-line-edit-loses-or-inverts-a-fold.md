---
id: nid_bi2fgazinvhiq13yrayby17ei_e
title: "Live Preview: fold state is projected from STALE DOM positions, so a same-line edit loses (or inverts) a fold"
status: open
deps: []
links: [nid_j7abnfhhkfhfxdtdrsfhfdd0a_e]
created_iso: 2026-07-25T00:44:47Z
status_updated_iso: 2026-07-25T00:44:47Z
type: bug
priority: 0
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

`LivePreviewFoldView.update()` in `src/livePreview/livePreviewFoldExtension.ts:42-51` calls `sync()` DIRECTLY. CodeMirror runs view plugins BEFORE it patches the DOM: in `node_modules/@codemirror/view/dist/index.js`, `updatePlugins(update)` is line 7699 and `docView.update(update)` is line 7702. So inside `update()`, `view.state` is the NEW state while the DOM is still the OLD one — `anchorLineStart` (`:142-155`) gets a PRE-change position out of `posAtDOM` and resolves it against the POST-change doc. Wrong line -> wrong fold.

It does not self-heal: the only other trigger is the `contentDOM` MutationObserver, which is `childList`-only, and a plain single-line text edit is applied by CM as a `characterData` mutation (`TextView.sync`/`TextView.merge`, same file `:768-790`).

MEASURED (fixture `para / "" / ![[child]] / "" / ![[child]]- / "" / tail`):
- fold embed #0, then insert ONE char on line 0 -> `folded=[true,true]` becomes `[false,true]` and stays wrong across 6 samples over ~3s; only a later line-count-changing edit repairs it.
- control: the same 1-char insert BELOW both embeds changes nothing, isolating position shift as the trigger.
- element identity survives the edit (stamped before/after), so it is the stale lookup, not a re-render.
- a pure-embed line is a BLOCK widget whose `posAtDOM` is exactly `line.from`, so ANY forward shift misresolves it; an inline `![[x]]-` embed reports ~3 chars into its line and absorbs shifts <= 3 (a 40-char insert breaks it too, measured).
- direction-independent: with `startCollapsed: true`, an explicitly UNFOLDED embed silently RE-FOLDS itself after typing 1 char above it.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Never sync from inside `update()`; schedule it for after CM has patched the DOM:

```ts
update(update: ViewUpdate): void {
  if (update.docChanged || update.viewportChanged ||
      update.state.field(explicitFoldField) !== update.startState.field(explicitFoldField)) {
    this.view.requestMeasure({ read: () => null, write: () => this.sync() });
  }
}
```

`requestMeasure` is legal during `update()` and its callbacks run in the measure phase, after `docView.update`, so `posAtDOM` is coherent with `state.doc`.

THIS FIX WAS MEASURED to repair all three reproductions above (patched, `npm run setup:dev-vault`, re-ran the probes: every case correct and stable), then reverted. Update the WHY comment in `update()` to record that a direct `sync()` there reads pre-change DOM.

## Acceptance Criteria

- Folding an embed and then typing a SINGLE character on an earlier line keeps the fold (both a pure-embed/block-widget line and an inline `![[x]]-` line).
- With `startCollapsed` on, an explicitly unfolded embed stays unfolded after typing above it.
- New e2e case in `e2e/live-preview-foldable-embeds.e2e.ts` uses a SINGLE-character, line-count-preserving edit. NOTE: the existing test at `:183-196` inserts `"inserted\n\n"`, which produces childList mutations that mask this bug — the new case must not.
- `npm run lint`, `npm run build` and the full e2e suite green.

