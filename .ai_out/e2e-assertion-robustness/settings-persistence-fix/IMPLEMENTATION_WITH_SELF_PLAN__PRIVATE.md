# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE working notes

State: **DONE (iteration 2 complete)**. Commits `d57f4e3` + `503e624` + the review-response
commit on `settings-persistence-fix`. Tree clean, suite 37/37, lint + build green. Nothing
pending.

## Iteration 2 (review response) — what changed and what to know

- 4 OPTIONALs: 2 fully accepted (array-form comment, shared re-render guard), 2 partially
  accepted (comment softened but NO new assertion for `preventDefault`; doc line added but NO
  `browser.close()`). Rationale in the PUBLIC file; rejected halves are in
  `FOLLOW_UP_TICKETS.md`.
- NEW `e2e/reRenderGuard.ts` owns `captureElement` / `expectFreshElement`. `locator.page()`
  is how it reaches `page.evaluate` without a `Page` parameter — keep it that way, the
  helpers stay callable from any spec.
- The array-form vacuity was RE-MEASURED here, not taken from the review:
  `.tmp/pw-array-check.mjs` (plain chromium, no Obsidian, ~2s). scalar FAILED, `[array]`
  PASSED, `not.toBeVisible()` PASSED. Recreate it from the PUBLIC table if ever doubted.
- Sabotage used for the new guard: in `start-collapsed-setting.e2e.ts` swap
  `reopenThroughOtherFile(...)` for `setMarkdownViewMode("source")`. Fails with
  "expected a re-render, but the locator resolved to the SAME DOM node". Revert with
  `git checkout e2e/start-collapsed-setting.e2e.ts`.
- DELIBERATELY NOT added: an active-file-unchanged assertion after a title click. It passes
  with AND without the production code (measured), i.e. it would be vacuous by construction —
  do not let a future pass add it "for coverage" without first making it fail.
- Iteration-2 logs: `.tmp/iter-lint*.log`, `.tmp/iter-build*.log`, `.tmp/iter-e2e*.log`,
  `.tmp/iter-sabotage-identity.log`.

## Files touched

- NEW `e2e/foldAssertions.ts` — `CLS_FOLDED`, `FOLDED_RE`, `expectFolded(embed, folded)`.
- `e2e/foldable-embeds.e2e.ts` — imports the helper; local `CLS_FOLDED`/`foldedRe` gone; new
  `SIBLING_NOTE_PATH`, `elementOf`, `isSameElement`; round-trip test rewritten + renamed.
- `e2e/start-collapsed-setting.e2e.ts` — local `expectFolded` deleted (imported now); new
  `OTHER_NOTE_PATH = "sibling.md"`; the "across a re-render" test uses
  `reopenThroughOtherFile`.
- `e2e/live-preview-foldable-embeds.e2e.ts` — mechanical conversion of every
  `(not.)toHaveClass(FOLDED_RE)` on an embed to `expectFolded` (done with a python regex pass);
  local `CLS_FOLDED`/`FOLDED_RE` removed.
- `e2e/obsidianHarness.ts` — `stdio` tuple; `reopenThroughOtherFile`; awaited kill in the
  launch catch; `waitForDevtoolsEndpoint` listener lifecycle (`onStderrData` + `stopListening`
  with `resume()`); `readPersistedPluginData` never throws.

## Environment facts (re-verified, not inherited)

- `npm run test:e2e` works here. `~/.cache/obsidian-e2e/obsidian-1.12.7/obsidian`.
  `scripts/run-e2e.sh` sets the headless ozone flags itself; no env vars needed.
- Single spec: `npm run test:e2e -- <file>.e2e.ts`. Full suite ≈ 25s wall (tsc + dev-vault
  rebuild dominate; Playwright itself ≈ 7s).
- `npm run test:e2e` REBUILDS the plugin into `.dev-vault` (`setup:dev-vault`), so a `src/`
  sabotage takes effect on the next run automatically.
- Logs used: `.tmp/e2e-baseline.log`, `.tmp/sabotage-store.log`, `.tmp/sabotage-store-oldtest.log`,
  `.tmp/sabotage-click-new.log`, `.tmp/sabotage-detach-new.log`, `.tmp/proof-helper.log`,
  `.tmp/launchfail.log`, `.tmp/e2e-final2.log`.

## Measurements that contradict the exploration/ticket — IMPORTANT

1. **Playwright 1.61.1: `expect(missingLocator).not.toHaveClass(re)` FAILS**
   ("element(s) not found" after the 15s expect timeout). It does NOT pass vacuously. Defect 2's
   premise is wrong for this version. `not.toBeVisible()` is the matcher that does pass on a
   missing element.
2. **Removing `preventDefault()`/`stopPropagation()` from the title-click handler does NOT make
   Obsidian 1.12.7 navigate into the embed.** Suite stayed fully green with them deleted
   (confirmed absent from the built `main.js`). The exploration's sabotage recipe for defect 2
   is not observable here.
3. Making the click `remove()` the embed is not a usable substitute either: Obsidian re-renders
   the section and the locator heals onto the next embed.
4. Defect 3's premise IS true: `node_modules/playwright/lib/matchers/expect.js` ~12951-12961,
   `const value = await actual();` outside the `try`.

If a future instance is asked to "prove defect 2 properly", the answer is: it cannot be proven,
because it is not true here. Re-run the throwaway spec (recipe below) before believing otherwise.

## Sabotage recipes actually used

- Store (defect 1): `src/foldStateStore.ts` → `get()` body becomes `return undefined;`.
  New test fails on `toHaveClass`; old test (from `HEAD~1`) passes. Restore with
  `git checkout src/foldStateStore.ts e2e/foldable-embeds.e2e.ts`.
- Old-test comparison: `git show HEAD~1:e2e/foldable-embeds.e2e.ts > e2e/foldable-embeds.e2e.ts`.
- Negated-matcher semantics: throwaway `e2e/zz-helper-proof.e2e.ts` launching the harness and
  asserting on `.markdown-embed.fen-embed.no-such-embed`. DELETED after use.
- Launch-failure path: `OBSIDIAN_E2E_EXTRA_ARGS="--version" npx playwright test --config
  e2e/playwright.config.ts hello-world.e2e.ts` with `OBSIDIAN_PATH` exported from
  `scripts/setup-obsidian-bin.sh`.

## Design decisions and their reasons

- Helper extracted to a module rather than fixed in one spec's private function: the same shape
  existed in all three fold specs, and the `fen-folded` regex was duplicated three times.
- `reopenThroughOtherFile` lives on the harness (it drives Obsidian); the identity assertion
  lives in the spec (it is what that one test is proving).
- Identity via `ElementHandle` + `page.evaluate(([a,b]) => a === b, ...)`, not a DOM stamp:
  no mutation of the subject. `elementOf` throws on null so the comparison can never be
  between two nothings.
- Kept the 5×50ms retry in `readPersistedPluginData` because `settings-persistence.e2e.ts:129`
  reads it WITHOUT a poll. This is the one detail to re-check if anyone "simplifies" it away.
- `proc.stderr?.resume()` on listener removal: without it, detaching the only `data` handler
  risks leaving the stderr pipe unconsumed — the same deadlock class the stdout fix removes.

## Not done, on purpose

- No `CLAUDE.md` / change_log / ticket edits (TOP_LEVEL_AGENT owns the latter two; no stable
  architecture knowledge changed for the former).
- Follow-ups listed in the PUBLIC file (non-retrying `isFoldedNow`; post-boot stderr is
  dropped; e2e absent from CI) were NOT actioned.
