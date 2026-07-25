---
id: nid_j7abnfhhkfhfxdtdrsfhfdd0a_e
title: "Lead (unverified): a fold changes block height without requestMeasure, so CM's height map and caret go stale"
status: open
deps: []
links: [nid_bi2fgazinvhiq13yrayby17ei_e]
created_iso: 2026-07-25T00:44:52Z
status_updated_iso: 2026-07-25T00:44:52Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

NOT a confirmed defect — a code-path lead recorded so it is not lost. No user-visible symptom was measured, so do not action it on this description alone; START by trying to reproduce.

`src/livePreview/livePreviewFoldExtension.ts:81` folds purely by toggling a class (`styles.css`: `.fen-folded > .markdown-embed-content { display: none }`), dispatched as an effect-only transaction (`:99`). Reading CM: `DocView.update` returns `redrawn = false` when there are no changed ranges and nothing else forces work, so `EditorView.update` SKIPS `requestMeasure()` (`node_modules/@codemirror/view/dist/index.js:7713-7715`); content-height re-measuring only happens in a measure pass (`ViewState.measure`, `:6050`), and CM's `ResizeObserver` watches `scrollDOM`, not `contentDOM` (`:6853-6859`).

Hypothesised symptom: fold a tall embed with the cursor parked below it — the height map and the absolutely-positioned `drawSelection` caret layer are not recomputed, so the caret is drawn detached from its text (and `posAtCoords`/scroll height are off by the same delta) until the next keystroke or scroll.

NOTE: adopting the `requestMeasure`-based fix from the stale-position ticket routes syncs through the measure pipeline anyway and may make this moot — check that FIRST, then close this as not-reproducible if so.

## Design

If reproducible: in `sync()`, call `this.view.requestMeasure()` when a projection actually changed (no read/write callbacks needed — it just forces the measure pass that re-reads block heights).

## Acceptance Criteria

- Either an e2e/manual reproduction plus the fix, or a note recording that it is not reproducible on the current Obsidian and why, and the ticket closed.

