# PRIVATE — IMPLEMENTATION_WITH_SELF_PLAN, ticket nid_hsjklsk99tgzq3y97tv0kwfr1_e

State: **COMPLETE**. Nothing left to do except git (owned by TOP_LEVEL_AGENT) and closing the
ticket. If rehydrating: verify `git status` still shows the three modified files below.

## Plan (executed in this order)

1. Read `EXPLORATION_PUBLIC.md`, `foldStateField.ts`, the LP spec, `foldAssertions.ts`,
   `reRenderGuard.ts`, `livePreviewFoldExtension.ts`, `embedFoldDom.ts`, the CM `mapPos`
   source. DONE.
2. Write the failing e2e first, run it against UNFIXED code, capture output. DONE
   (`.tmp/e2e-before-fix.log`).
3. Apply the `mapMode = TrackAfter` fix. DONE.
4. lint + build + FULL e2e. DONE, all green (`.tmp/e2e-after-fix.log`, 38 passed).
5. CLAUDE.md one-liner. DONE.
6. Write PUBLIC + PRIVATE. DONE.

## Files touched

- `src/livePreview/foldStateField.ts` — `MapMode` import; `override readonly mapMode =
  MapMode.TrackAfter` on `ExplicitFold` + WHY/WHY-NOT comment.
- `e2e/live-preview-foldable-embeds.e2e.ts` — `DELETE_LINE_*` fixture constants +
  `DELETE_LINE_CONTENT` (added near the other fixture constants), registered in the
  `beforeAll` `extraFixtures` map, and the new final test before the helper functions.
- `CLAUDE.md` — Live Preview constraints bullet, one added sentence.

## Design decisions and their reasons (the non-obvious ones)

- **Separate fixture note, not the shared `lp-embeds.md`.** `lp-embeds.md` has a blank line
  between its embeds, so deleting an embed's line puts a BLANK line on the freed anchor —
  the misplaced anchor would have no embed to fold and the test could not fail. Needed two
  ADJACENT whole-line embeds. Adding lines to `NOTE_CONTENT` would have shifted every
  `LINE_*`/`EMBED_*` constant and every downstream serial test — rejected as fragile.
- **Test placed LAST and opening its own file**: the spec is serial and stateful; a test that
  deletes a line has to either restore or isolate. Isolation is simpler (KISS) and mirrors
  the existing nested-embed test, which also opens its own file at the end. It leaves
  `lp-delete-line.md` open with `![[sibling]]` folded — nothing runs after it.
- **`expect(first).toHaveCount(0)` before the fold assertion**: without it, the fold
  assertion could be sampled against the pre-delete document and pass immediately.
- **Click safety-net at the end**: the real defence against a transient pass. Playwright's
  `expect` passes on the FIRST successful sample, and the embed DOM is re-rendered
  asynchronously by Obsidian; so `not.toHaveClass(fen-folded)` could in principle catch a
  moment before a buggy sync folds it. A click inverts the DISPLAYED state
  (`EmbedFoldDom.isFolded`), so "click → folded" can only hold if the embed was truly
  unfolded when clicked. In practice this did NOT trigger: the before-fix failure showed the
  bad class 34× over 15s, i.e. sync is synchronous with the CM transaction. Kept anyway.
- **`src=` locators** rather than nth-index: two embeds, distinct sources, unambiguous and
  immune to widget ordering surprises.

## CM `mapPos` semantics — verified in source, not assumed

`node_modules/@codemirror/state/dist/index.js:744-750`:
```js
if (mode != MapMode.Simple && endA >= pos &&
    (mode == MapMode.TrackDel && posA < pos && endA > pos ||
     mode == MapMode.TrackBefore && posA < pos ||
     mode == MapMode.TrackAfter && endA > pos))
    return null;
```
- delete own line `[pos, pos+len+1)` → `endA > pos` → null. FIXES the bug.
- insert at anchor: `posA == endA == pos`, `endA > pos` false → survives. Pinned test safe.
- delete the line ABOVE, ending exactly at `pos` → `endA == pos` → survives, remaps to the
  new line start. Fold still follows its embed upward.
- deletion strictly after the anchor → early `return posB + (pos - posA)` from the preceding
  keep-section. Unaffected.

`override readonly` is legal: `RangeValue` declares `mapMode: MapMode`; adding `readonly` in a
derived class is allowed; `target: ES2021` ⇒ no `useDefineForClassFields`, so it is a
constructor assignment shadowing the prototype value.

## Evidence artifacts (gitignored)

- `.tmp/e2e-before-fix.log` — 12 passed / 1 failed (the new test), failure text quoted in
  PUBLIC.
- `.tmp/e2e-after-fix.log` — 38 passed.
- `.tmp/lint.log` (exit 0, 1 pre-existing warning), `.tmp/build.log` (exit 0).
- `.tmp/e2e-artifacts/…/error-context.md` — Playwright's context dump from the failing run.

## Not done, deliberately

No unit tests / no test runner introduced (instructed, and none exists). No commit, no
`change_log` entry. Ticket not closed. `.tmp/probe/` scratch left untouched.
