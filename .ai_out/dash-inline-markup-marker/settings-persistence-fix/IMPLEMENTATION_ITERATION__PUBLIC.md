# Implementation iteration: review response (fold marker at a real end of line)

Ticket: `_tickets/reading-mode-a-dash-glued-to-inline-markup-x-bold-wrongly-arms-the-fold-marker.md`
(still `in_progress`; no change_log entry — TOP_LEVEL_AGENT owns both).

## Outcome: both SHOULD-FIX items incorporated, 2 of 3 NITs incorporated, 1 rejected

| Finding | Verdict |
|---|---|
| SF-1 `instanceof HTMLBRElement` → new lint warning + cross-realm hazard | INCORPORATED |
| SF-2 `<br>` branch had zero coverage | INCORPORATED |
| N-1 doc overclaims for `**![[x]]-** tail` | INCORPORATED (wording + KNOWN LIMITATION; the hole itself left alone) |
| N-2 implicit test coupling in the `- tail` test | INCORPORATED |
| N-3 reading-mode vs Live Preview divergence on `![[x]]- tail` | REJECTED — pre-existing product decision, out of this ticket's scope; follow-up candidate |

Rationale for each is in `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md`.

## Changes in this iteration

- `src/foldableEmbedsPostProcessor.ts` — `isEndOfLine` now uses obsidian's cross-window-safe
  `Node.instanceOf(HTMLBRElement)`; its doc states the real rule ("nothing follows it in its
  PARENT element") and records the wrapped-embed KNOWN LIMITATION.
- `e2e/foldable-embeds.e2e.ts` — new fixture `marker-soft-break.md`
  (`![[child]]-\nnext line`) and a test asserting folded + dash stripped + a following `<br>`;
  the `![[child]]- tail` test now opens its own note.
- `CLAUDE.md` — reading-mode bullet re-worded to match the code exactly, limitation named.

## Verification (real exits, this session)

| Command | Result |
|---|---|
| `npm run lint` | **EXIT=0** — 0 errors, 1 warning (pre-existing `prefer-setting-definitions`); the warning this change had added is gone |
| `npm run build` | **EXIT=0** |
| `npm run test:e2e` (FULL) | **EXIT=0** — **46 passed** |
| `<br>`-branch mutation proof: clause deleted, spec re-run | **EXIT=1** — `1 failed, 8 passed`; the failure is the new soft-break test (embed NOT folded). Clause restored. |

Logs: `.tmp/iter-lint.log`, `.tmp/iter-build.log`, `.tmp/iter-e2e-full.log`,
`.tmp/iter-e2e-noBrBranch.log`.

## Readiness

**Ready to close.** All acceptance criteria met, both SHOULD-FIX items resolved, no new lint
warnings, no test skipped or weakened.

## Follow-up ticket candidates (NOT created here)

1. Decide the cross-mode contract for `![[x]]- tail` (reading mode folds it, Live Preview
   does not) — pre-existing, now pinned by tests in reading mode (reviewer N-3).
2. `**![[x]]-** tail` (embed wrapped in inline markup) still loses its literal dash —
   pre-existing, documented as a KNOWN LIMITATION; needs ancestor walking to fix.
3. `` ![[x]]-`code` `` has no dedicated e2e; fixed by the same code path and verified by the
   reviewer against real Obsidian, but only the `<strong>` shape is pinned by a test.
