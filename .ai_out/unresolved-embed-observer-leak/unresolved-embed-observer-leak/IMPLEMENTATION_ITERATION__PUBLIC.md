# Review iteration 1 — dispositions (nid_78cl6bo3t8umqbndughsbjez9_e)

| Finding | Disposition |
|---|---|
| B1 — `file-embed mod-empty` treated as settled removes late-resolve behaviour | **INCORPORATED** |
| S1 — no test pins that behaviour | **INCORPORATED** (written FIRST, RED) |
| S2 — no "already waiting" guard | **INCORPORATED** (with a RED-first proof) |
| N1 — non-retrying `liveObserverCount()` read | **REJECTED as stated, addressed differently** |
| N2 — render-child duplication | **REJECTED (out of scope, already ticketed)** |

## B1 — INCORPORATED

The reviewer is right and my previous write-up was wrong. My measurement showed only that an
embed's FIRST settling mutation is one shot; I generalised it into "`file-embed` is terminal",
which it is not — `mod-empty` means "target missing right now". The ticket's design point 1
says to add `file-embed` to the non-note class list; the ticket is a PROPOSAL and on this point
it is simply incorrect, so it is not implemented. Design point 2 (the render-child bound) is
the whole fix.

Change: `NON_NOTE_EMBED_CLASSES` → `MEDIA_EMBED_CLASSES` (name now matches the meaning —
resolved media, which genuinely cannot become a note), `isNonNoteEmbed` → `isMediaEmbed`, and
`file-embed` dropped. `mod-generic` (`![[notes.txt]]`, genuinely terminal) is deliberately NOT
special-cased: its wait is already bounded by its render, so classifying it buys nothing and
re-opens the exact class-taxonomy guessing that caused this finding. That WHY-NOT is written
on the constant.

Cost, stated plainly: an unresolved embed now keeps ONE observer for as long as it is on
screen. That is the same bound `liveMarks` has, and it is what makes the behaviour work.

## S1 — INCORPORATED, failing test first

`e2e/unresolved-embed-observers.e2e.ts` → "an embed whose target is created later becomes
foldable without reopening the note". Renders `![[obs-late-target]]` (missing), then creates
the note through Obsidian's own `vault.create` with the reading view open.

- RED on the pre-fix code (commit `cd2b366`, `.tmp/e2e-red-s1.log`):
  `expect(locator).toHaveCount(1)` → `Received: 0`.
- GREEN after dropping `file-embed` (`.tmp/e2e-green-s1.log`).

Harness additions: `ObsidianHarness.createNote` + `vault.create` in the typed app facade.

## S2 — INCORPORATED, verified RED first

`pendingEmbeds: WiredElements` (per-instance `WeakSet`) checked before creating an observer and
released in `forgetObserver`, so "at most one observer per live embed span" is structural.
`wiredEmbeds` cannot serve — an embed enters it only once it RESOLVES.

Verification is a new whitebox spec ("post-processing the same still-pending embeds twice adds
no second observer"): it invokes the REAL `postProcessor.process` a second time over the REAL
rendered section with a stub context, because the realistic trigger (Obsidian's reused Live
Preview embed-body DOM) cannot be staged from a reading-mode spec. With the guard patched out
(`if (false && …)`) it fails `Expected: 2 / Received: 4` (`.tmp/e2e-s2-red.log`); with the
guard it passes. The stub context supplies only the two members `process` uses.

## N1 — REJECTED as stated; the underlying point addressed

Polling an UPPER-BOUND assertion (`toBeLessThanOrEqual`) retries until it passes, so it can
only make the assertion more permissive: reading too early risks a false PASS here, never a
false fail, which is the opposite of the flakiness `nid_1oipd3ymnbsdlbql01h7hue4p_e` is about.
The read is already sequenced after a Playwright wait for every embed to SETTLE.

The reviewer's second suggestion is the honest one and is taken: the assertions are now
ABSOLUTE — the baseline is asserted to be exactly 2 (one wait per pending embed) and the count
after further renders is asserted `toBe(afterFirstRender)`, not `<=`.

## N2 — REJECTED (scope)

Left for nid_1ngosntduq5baizn9b7056h34_e, as the reviewer expects.

## Docs made true again

- `MEDIA_EMBED_CLASSES` doc comment: the false "will not gain `markdown-embed` later" claim is
  gone, replaced by the measured fact and the two WHY-NOTs.
- Post-processor class doc: the wait is bounded by the RENDER, not by class reading.
- `PendingEmbedObserver` doc: an unresolved embed MUST keep being watched.
- `WiredElements` doc + CLAUDE.md bullet: the set now also covers "being waited on".
- CLAUDE.md "The wait ENDS when…" bullet rewritten accordingly.

## Gates (re-run in full on the final tree)

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 1 PRE-EXISTING warning (`prefer-setting-definitions`, `src/settings/foldableEmbedsSettingTab.ts`, untouched by this ticket) |
| `npm run build` | exit 0 |
| `npm run test:e2e` (full) | **57 passed, 0 failed** (10.9s) — `.tmp/e2e-full-iter1.log` (55 before; +2 new specs) |

No disagreement outstanding with the reviewer.
