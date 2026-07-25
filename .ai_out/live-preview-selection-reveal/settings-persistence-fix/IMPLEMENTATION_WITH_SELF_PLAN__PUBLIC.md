# Implementation: reveal the marker dash on every line a selection touches

Ticket `nid_wjjrfc4a48g1yvc8s949xhklo_e`. Commit `0473722` on `settings-persistence-fix`.
Ticket left OPEN, no `change_log` entry (TOP_LEVEL_AGENT owns both).

## What changed

- `src/livePreview/markedEmbedLines.ts` — the reveal set is now built by a new private
  `linesTouchedBySelection(state)` helper: for every `state.selection.ranges` entry it unions
  the line numbers from `lineAt(range.from)` through `lineAt(range.to)`. `cursorLines` was
  renamed to `selectedLines` at the call site, and the `markerDashDecoration` doc now says
  "the lines the selection touches" instead of "the line the cursor is on". The helper's WHY
  comment states the real motivation (Obsidian reveals its own raw `![[x]]` under a selection,
  so a hidden dash makes the DISPLAYED source contradict the file) and a WHY-NOT for
  `anchor`/`head` (direction-dependent; `from`/`to` are ordered).
  A bare cursor is an empty range, so the pre-existing cursor-on-line behaviour is the
  degenerate case of the same rule — no separate branch.
- `e2e/obsidianAppApi.ts` — `Editor` interface gains `setSelection(anchor, head?)`, matching
  Obsidian's own signature.
- `e2e/obsidianHarness.ts` — new `setSelection(anchor, head)`, mirroring `setCursor`'s
  `page.evaluate` shape.
- `e2e/live-preview-foldable-embeds.e2e.ts` — new constants `LINE_ABOVE_MARKED` /
  `LINE_BELOW_MARKED` (derived from `LINE_MARKED`) and two tests placed right after the
  existing cursor-reveal test:
  - "the marker dash is revealed while a selection spans its line"
  - "a BACKWARDS selection spanning the marked line reveals the dash too"
  Both select from the line ABOVE to the line BELOW the marked one, so NEITHER endpoint sits
  on it — the assertion cannot pass via the old head-only logic. Each then collapses the
  cursor elsewhere and asserts the dash hides again, which both proves the reveal is
  selection-driven and restores state for the serial tests that follow.

## Decisions

- Two tests rather than one with four asserts: forward and backwards selections are distinct
  behaviours (the backwards case is what dragging upwards produces) and each stays readable.
- No unit test added — the repo has no unit runner by design; all coverage is Playwright e2e.
- No `CLAUDE.md` change: the architecture summary never described the reveal rule at this
  granularity, so nothing there went stale.

## How tested (actual observed output)

- PRE-FIX, `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts` → `EXIT=1`,
  `1 failed / 11 did not run / 5 passed`. The failure is the new spanning-selection test:
  `Expected: true, Received: false ... Timeout 15000ms exceeded while waiting on the
  predicate` at line 255. (Serial mode aborts the rest, so the backwards test did not get to
  run pre-fix; it exercises the identical head-vs-span logic.)
- POST-FIX, full `npm run test:e2e` → `EXIT=0`, **42 passed (6.8s)** — every spec file,
  including the Source-mode literal-dash and cursor-reveal tests.
- `npm run lint` → exit 0; the only output is the PRE-EXISTING
  `obsidianmd/settings-tab/prefer-setting-definitions` warning on
  `src/settings/foldableEmbedsSettingTab.ts` (untouched by this change).
- `npm run build` (`tsc -noEmit` + esbuild) → exit 0.

## Open questions

None.
