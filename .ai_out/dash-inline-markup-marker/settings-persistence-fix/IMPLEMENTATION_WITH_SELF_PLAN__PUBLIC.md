# Implementation: fold marker must sit at a real end of line

Ticket: `_tickets/reading-mode-a-dash-glued-to-inline-markup-x-bold-wrongly-arms-the-fold-marker.md`
(left `in_progress` — TOP_LEVEL_AGENT owns closing it and the change_log entry).

## Plan (as executed)

1. Add the FAILING e2e case for `![[child]]-**bold**` in `e2e/foldable-embeds.e2e.ts`,
   next to the existing `![[child]]-x` negative case, before the plugin-disabling test.
2. Confirm it fails for the right reason (embed carries `fen-folded`).
3. Fix `stripFoldMarker`: the empty-after-dash branch additionally requires end of LINE.
4. Add coverage for the whitespace branch (`![[child]]- tail`), which the restructured
   condition touches and which reading-mode e2e did not cover.
5. Update the WHY docs (`stripFoldMarker` doc comment, `CLAUDE.md`).
6. lint + build + FULL e2e.

## What changed and WHY

- `src/foldableEmbedsPostProcessor.ts`
  - `stripFoldMarker`: the marker arms when the dash is followed by whitespace OR by a real
    end of line. The empty-`afterMarker` case now also requires `isEndOfLine(sibling)`.
    WHY: `afterMarker === ""` only meant "end of this TEXT NODE"; inline markup right after
    the dash (`![[x]]-**bold**`, `` ![[x]]-`code` ``) renders as a sibling element, leaving
    the dash alone in its node, so the marker armed and the user's literal dash was deleted —
    inconsistent with the already-correct plain-text `![[x]]-x` case.
  - New private `isEndOfLine(node)`: `nextSibling === null || nextSibling instanceof
    HTMLBRElement` (block end, or Obsidian's rendering of a soft line break). Structural,
    no regex lookbehind — required for Obsidian mobile / iOS Safari.
  - Doc comment now states the end-of-LINE rule and the WHY above.
- `e2e/foldable-embeds.e2e.ts`
  - New fixture `marker-inline-markup.md`: `![[child]]-**bold** tail` and `![[child]]- tail`.
  - New test `strict-marker negative ![[child]]-**bold**...`: asserts NOT folded, and pins
    the DOM shape the bug is about (next sibling text node is exactly `"-"`, followed by a
    `<strong>` element) so a future refactor cannot make the test vacuous.
  - New test ``` `![[child]]- tail` still folds, keeping the text after the marker ```:
    guards the whitespace branch (dash stripped, `" tail"` preserved).
  - Both sit before the last, plugin-disabling test.
- `CLAUDE.md`: the reading-mode bullet now says the dash must be followed by whitespace or a
  real end of line (`<br>` / block end), not merely the end of the text node.

## Test evidence (actual command exits)

- Failing-first: `npm run test:e2e -- e2e/foldable-embeds.e2e.ts` → EXIT=1,
  `1 failed, 3 did not run, 6 passed`; failure was the new test with
  `Received string: "... fen-embed fen-folded"` (i.e. wrongly folded — the ticket's bug),
  log `.tmp/e2e-fail-before.log`.
- After the fix: `npm run lint` EXIT=0, `npm run build` EXIT=0,
  `npm run test:e2e` (FULL suite) EXIT=0 → **45 passed**, log `.tmp/e2e-full-final.log`.
- AC2 coverage is pre-existing and still green: `` `![[child]]-` renders folded, body
  hidden, no visible dash `` and the heading/block-ref marker test; plus the new
  `![[child]]- tail` case.

## Review response (iteration on `IMPLEMENTATION_REVIEW__PUBLIC.md`)

| Finding | Verdict | Rationale |
|---|---|---|
| SF-1 `instanceof HTMLBRElement` (new lint warning + cross-realm) | **INCORPORATED** | Reviewer is right on both counts. Now `next.instanceOf(HTMLBRElement)`; lint is back to the ONE pre-existing warning (`prefer-setting-definitions`). WHY documented at the call site. |
| SF-2 `<br>` branch uncovered | **INCORPORATED** | Confirmed by measurement, not assumed: with the clause removed the new test FAILS (see evidence). New fixture `marker-soft-break.md` + test pinning the DOM shape. |
| N-1 doc overclaims for `**![[x]]-** tail` | **INCORPORATED (wording only)** | Fixed the WORDING, not the hole: `isEndOfLine`'s doc and CLAUDE.md now say "nothing follows it in its PARENT element" plus an explicit KNOWN LIMITATION. Chasing the wrapped case needs ancestor walking for a rare shape — 80/20 says no; noted as a follow-up. |
| N-2 implicit test coupling | **INCORPORATED** | One-line `openFile` + `setMarkdownViewMode` in the `- tail` test; it no longer depends on the previous test's navigation. |
| N-3 cross-mode divergence (`![[x]]- tail` folds in reading mode, not LP) | **REJECTED here** | Pre-existing product question, not this ticket's bug; deciding it would change user-visible behaviour in one mode without alignment. Handed up as a follow-up ticket candidate. |

Also handed up as a follow-up candidate: `` ![[x]]-`code` `` is fixed by this code path and
was verified by the reviewer, but has no dedicated e2e (the `<strong>` case pins the same DOM shape).

### Iteration test evidence (real exits)

- Branch-coverage proof: with `|| next.instanceOf(HTMLBRElement)` replaced by nothing,
  `npm run test:e2e -- e2e/foldable-embeds.e2e.ts` → **EXIT=1**, `1 failed, 8 passed`; the
  failure is exactly the new soft-break test (`Received string: "... fen-embed"`, i.e. NOT
  folded). Log `.tmp/iter-e2e-noBrBranch.log`. Clause restored afterwards.
- `npm run lint` **EXIT=0** — 0 errors, **1 warning**, the pre-existing
  `foldableEmbedsSettingTab.ts` one; the warning this change had introduced is GONE
  (`.tmp/iter-lint.log`).
- `npm run build` **EXIT=0** (`.tmp/iter-build.log`).
- `npm run test:e2e` (FULL suite) **EXIT=0** — **46 passed** (`.tmp/iter-e2e-full.log`).

## Deliberately NOT done

- No unit-test framework introduced (repo has none; out of scope per the task).
- `src/livePreview/markedEmbedLines.ts` untouched: its whole-line raw-text regex cannot hit
  this bug class, and its "vs reading mode's dash right after any `]]`" contrast comment is
  still accurate after the fix.
- Ticket not closed; no change_log entry (TOP_LEVEL_AGENT owns both).
