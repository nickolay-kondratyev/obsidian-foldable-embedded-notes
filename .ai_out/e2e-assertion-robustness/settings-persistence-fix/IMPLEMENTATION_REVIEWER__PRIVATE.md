# IMPLEMENTATION_REVIEWER — PRIVATE (rehydration notes)

Review of `settings-persistence-fix` commits `d57f4e3`, `503e624`, `b1a66fc`.
Verdict issued: **READY, 0 MUST-FIX, 4 OPTIONAL**. Public file:
`.ai_out/e2e-assertion-robustness/settings-persistence-fix/IMPLEMENTATION_REVIEW__PUBLIC.md`.

## What I actually ran (all reverted; tree clean at end)

1. `npm run lint` → `.tmp/review-lint.log`, exit 0, 1 pre-existing warning.
2. `npm run build` → `.tmp/review-build.log`, exit 0.
3. `npm run test:e2e` → `.tmp/review-e2e.log`, **37 passed (6.7s)**, exit 0.
4. **Sabotage A** — `src/foldStateStore.ts` `get()` → `return undefined`,
   `npm run test:e2e -- foldable-embeds.e2e.ts` → `.tmp/review-sabotage1.log`:
   `✘ 5 … fold state survives leaving the note and coming back (15.1s)` /
   `Error: expect(locator).toHaveClass(expected) failed` / **1 failed, 16 passed**.
5. **Sabotage A on the OLD spec** — `git show bb17636:e2e/foldable-embeds.e2e.ts` restored over
   the new one, same store sabotage → `.tmp/review-sabotage1b.log`:
   `✓ 5 … reading -> editing -> reading round-trip (59ms)`, **21 passed**, exit 0.
   → the ticket's vacuity claim CONFIRMED, and the fix CONFIRMED to close it.
6. **Sabotage B** — deleted `event.preventDefault(); event.stopPropagation();` from
   `EmbedFoldDom.onTitleClick`, full suite → `.tmp/review-sabotage2.log`: **37 passed, exit 0**.
   → implementer's second measurement reproduced. This src code is UNCOVERED.
7. `.tmp/pw-check.mjs` (headless chromium, `setContent`, 1.5s timeouts) — the decisive
   defect-2 experiment:
   - `not.toHaveClass(/re/)` on zero-element locator → **FAILED** ("element(s) not found")
   - `not.toBeVisible()` → PASSED
   - `not.toHaveClass([/re/])` (ARRAY) → **PASSED** ← new fact, nobody had this
   - `not.toHaveClass(/re/)` on a present non-matching element → PASSED (control)
8. `.tmp/poll-check.mjs` — `expect.poll` with a fn that throws twice then returns:
   **propagated on call 1**, no retry. Defect-3 premise confirmed empirically as well as by
   source.
9. Test-count audit via python over `git ls-tree` at `bb17636` vs `HEAD`:
   foldable 9, hello-world 3, live-preview 12, settings-persistence 2, start-collapsed 11 =
   **37 in both**. Nothing removed.
10. `git status --porcelain` empty after every step.

## Key source citations (Playwright 1.61.1)

- `node_modules/playwright-core/lib/coreBundle.js` line 19099 is the injected-script source as
  an escaped JS string; unescape it with python (`.encode().decode('unicode_escape')`) to read
  `_expectCore`. It returns `{ matches: options.isNot, missingReceived: true }` for a missing
  element, with special-cases ONLY for `to.be.hidden` / `to.be.visible` / `to.be.detached` /
  `to.be.attached` / `to.be.in.viewport` (+ `to.have.title`, `to.have.url`, `to.match.aria`).
- `coreBundle.js` ~23457 `Frame._expectInternal`: `if (matches === options.isNot)` → that is the
  FAILURE branch. So `matches = isNot` is a fail-in-either-polarity sentinel. **The ticket read
  this backwards.**
- `node_modules/playwright/lib/matchers/expect.js:12951-12959` `invokePollMatcher`:
  `const value = await actual();` sits outside the try. Ticket right on this one.

## Findings I chose NOT to raise as MUST-FIX (and why)

- `spawnAndConnect` catch does not `browser.close()` — only reachable on launch failure which
  aborts the run anyway; killing the process drops the transport. OPTIONAL-4.
- `waitForDevtoolsEndpoint`'s `proc.on("exit"/"error")` never removed — constant 2 listeners,
  and the `error` one usefully prevents a late unhandled event. Not raised beyond a note.
- `elementOf` never disposes its ElementHandle — test-lifetime, negligible.
- `isFoldedNow` non-retrying read — already the implementer's own follow-up #1; I endorsed it
  and ranked it above my OPTIONAL-3.

## If asked to re-review

The only thing worth re-litigating is OPTIONAL-1 (the `preventDefault`/`stopPropagation`
coverage hole). It is pre-existing src code, not introduced by this change, so it is NOT a
blocker for this ticket — but it is the one place where a real regression could still slip
through unobserved, and the ticket's whole defect-2 story was built on assuming that code was
load-bearing. Recommended guard test: assert `window.app.workspace.getActiveFile().path` is
unchanged after a reading-mode title click.
