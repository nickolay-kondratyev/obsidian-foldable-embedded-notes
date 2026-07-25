---
id: nid_hsjklsk99tgzq3y97tv0kwfr1_e
title: "Live Preview: deleting a folded embed's line transfers its fold to the NEXT embed"
status: open
deps: []
links: [nid_z4jq8me8mhstojozeua8fufdr_e]
created_iso: 2026-07-25T00:44:48Z
status_updated_iso: 2026-07-25T00:44:48Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

`ExplicitFold` in `src/livePreview/foldStateField.ts:8-12` does not override `mapMode`, so it inherits `RangeValue.mapMode = MapMode.TrackDel` (`node_modules/@codemirror/state/dist/index.js:3006`, honoured by `Chunk.map` at `:3078`). `TrackDel` drops a zero-length range only when the deletion spans strictly ACROSS it (`posA < pos && endA > pos`, `:746-750`), so a deletion that STARTS at the anchor leaves the anchor alive — now sitting on whatever line moved up into that position.

MEASURED (fixture `![[child]] / ![[sibling]] / "" / tail`, deleting line 0 including its newline, i.e. Obsidian's cut-line/delete-line):
- control (delete without folding first): `{sibling:false}` — deleting alone folds nothing.
- fold `![[child]]` -> `{child:true, sibling:false}`; delete line 0 -> `{sibling:true}`, stable across 5 samples over 3s. `![[sibling]]` renders folded although the user only folded `![[child]]`.

Undo makes it plainer, and a non-embed variant exists: delete the folded line, later type a new embed there, and it appears pre-folded.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Make the anchor die with the line it anchors:

```ts
class ExplicitFold extends RangeValue {
  override readonly mapMode = MapMode.TrackAfter; // anchor is meaningless once its line is gone
  ...
}
```

`TrackAfter` returns null exactly when a deletion consumes the character AFTER the anchor (`endA > pos`) and is inert for insertions AT the anchor (`endA == pos`), so the documented "type at the line start" behaviour (`src/livePreview/foldStateField.ts:52-60`, pinned by e2e `e2e/live-preview-foldable-embeds.e2e.ts:198-212`) keeps working. Add a WHY comment for the mapMode.

## Acceptance Criteria

- Fold the first of two embed lines, delete that whole line (with its newline): the second embed stays UNFOLDED.
- The existing "typing at the START of a folded embed's line keeps its fold state" e2e still passes.
- e2e coverage added; lint, build and full e2e green.

