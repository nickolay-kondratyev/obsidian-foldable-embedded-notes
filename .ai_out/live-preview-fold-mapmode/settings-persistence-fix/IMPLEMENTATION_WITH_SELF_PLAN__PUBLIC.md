# IMPLEMENTATION — Live Preview fold anchor must die with its line (`mapMode`)

Ticket `nid_hsjklsk99tgzq3y97tv0kwfr1_e`. Status: **DONE**, lint + build + full e2e green.

## What changed

1. `src/livePreview/foldStateField.ts` — `ExplicitFold` now overrides
   `mapMode = MapMode.TrackAfter` (plus the `MapMode` import), with a WHY comment covering
   both directions: TrackAfter drops the anchor as soon as a deletion consumes the character
   AFTER it ("its line is gone"), and is inert for an insertion AT it, so the documented
   "typing at the line start keeps the fold" behaviour is untouched. Exactly the ticket's
   design; no other production file touched.
2. `e2e/live-preview-foldable-embeds.e2e.ts` — new fixture + new last test (see below).
3. `CLAUDE.md` — one sentence added to the Live Preview constraints bullet: a fold anchor
   lives and dies with its LINE (`TrackAfter`).

## The e2e test

`deleting a folded embed's whole line does not hand its fold to the next embed`, appended as
the LAST test in the Live Preview spec.

- **Own fixture, own file** — `lp-delete-line.md` with two ADJACENT whole-line embeds
  (`![[child]]` / `![[sibling]]`). The shared `lp-embeds.md` separates its embeds with blank
  lines, so deleting an embed line there moves a BLANK line onto the freed anchor and proves
  nothing. Distinct `src` values give unambiguous locators.
- **Shared-fixture handling**: the test opens its own note and never edits `lp-embeds.md`,
  and it runs last — so there is nothing to restore and nothing downstream to disturb. (The
  preceding nested-embed test already established the "open your own file at the end"
  precedent.)
- **Non-vacuity**, three layers:
  1. `expect(first).toHaveCount(0)` gates on the deletion having really reached the editor
     before the fold assertion — `expectFolded(…, false)` retries until it PASSES, so
     asserting it against an unchanged document would be green for the wrong reason.
  2. `expectFolded(second, false)` uses the shared helper (attached + scalar-regex form, per
     the comments in `e2e/foldAssertions.ts`).
  3. A timing-immune repeat of the same claim: a title click inverts what is DISPLAYED, so a
     genuinely unfolded embed must FOLD. This is the guard against a fold applied a moment
     after (2) — embed DOM renders asynchronously, and Playwright's `expect` passes on the
     first successful sample.

## Test evidence

**BEFORE the fix** (`.tmp/e2e-before-fix.log`, run against the unmodified `ExplicitFold`):
12 passed, the new test FAILED — not transiently, the bad state was sampled 34 times over 15s:

```
1) … › deleting a folded embed's whole line does not hand its fold to the next embed
   Error: expect(locator).not.toHaveClass(expected) failed
   Locator: locator('.cm-content .internal-embed[src="sibling"]')
   Expected pattern: not /\bfen-folded\b/
   Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded"
   34 × locator resolved to <div … class="… fen-embed fen-folded">
     at foldAssertions.ts:34 … at live-preview-foldable-embeds.e2e.ts:337
```

i.e. `![[sibling]]` really did render folded although only `![[child]]` was ever folded —
the ticket's bug, reproduced by the new test.

**AFTER the fix** (`.tmp/e2e-after-fix.log`): `npm run test:e2e` → **38 passed** (6.9s),
including the new test and the pinned `typing at the START of a folded embed's line keeps its
fold state`.

- `npm run lint` → exit 0, 0 errors, 1 warning — the PRE-EXISTING
  `obsidianmd/settings-tab/prefer-setting-definitions` warning on
  `src/settings/foldableEmbedsSettingTab.ts`, untouched by this change.
- `npm run build` → exit 0 (`tsc -noEmit` clean; `override readonly mapMode` compiles fine
  under `target: ES2021`, where a class field is a constructor assignment shadowing
  `RangeValue.prototype.mapMode`).

## Verified semantics (read from `node_modules/@codemirror/state/dist/index.js:744-750`)

`TrackAfter` returns `null` iff a replaced section has `endA > pos`:
delete the anchor's own line → dropped (correct); insert at the anchor (`endA == pos`) →
kept (the pinned behaviour); delete the line ABOVE ending exactly at the anchor (`endA ==
pos`) → kept and remapped, so a fold still follows its embed upward (also correct, and
covered by the existing "fold state survives an edit that shifts every position below it").

## Open questions / risks

- Two embeds on ONE line still share fold state (documented, unchanged by this fix).
- `.tmp/probe/` scratch specs from the earlier investigation are still present and
  gitignored; not part of the suite.
- No unit tests exist in this repo and none were introduced — e2e is the coverage vehicle,
  as instructed.
- Not committed (TOP_LEVEL_AGENT owns git); no `change_log` entry written; ticket left open.
