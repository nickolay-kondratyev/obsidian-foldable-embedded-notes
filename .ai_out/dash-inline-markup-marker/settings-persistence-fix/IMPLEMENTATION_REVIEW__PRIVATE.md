# Review notes (private) — `39501ab`

## What I actually executed

1. `npm run lint` → EXIT=0, log `.tmp/rev-lint.log`. 2 warnings: NEW
   `obsidianmd/prefer-instanceof` at `src/foldableEmbedsPostProcessor.ts:170`, plus the
   pre-existing `settings-tab/prefer-setting-definitions`. Confirmed NEW because the only
   `instanceof HTML*` in `src/` is that new line.
2. `npm run build` → EXIT=0, log `.tmp/rev-build.log`.
3. `npm run test:e2e` (full) → EXIT=0, **45 passed**, log `.tmp/rev-e2e-full.log`.
4. Failing-before: `git worktree add .worktree/rev-check 39501ab`, symlinked `node_modules`,
   reverted ONLY the `followedByWhitespaceOrEol` line to the old expression, ran
   `e2e/foldable-embeds.e2e.ts` → EXIT=1, `1 failed, 6 passed`; the new bold test failed with
   `fen-folded` present. Log `.tmp/rev-e2e-noFix.log`. Worktree removed (`git worktree list`
   clean, `git status` clean).
5. Throwaway probe spec `e2e/zprobe.e2e.ts` in that worktree: 10 DOM contexts, results table in
   the PUBLIC file. Log `.tmp/rev-probe.log`.
6. Throwaway popout spec `e2e/zpopout.e2e.ts`: `moveLeafToPopout`, then opened a SECOND,
   never-rendered note in the popout leaf (unique body text asserted, `ownerDocument === popDoc`).
   Log `.tmp/rev-popout3.log`:
   `{"crossRealmInstanceof":false,"sameHTMLBRElementCtor":false,"foundEmbed":true,"folded":true,
   "nextText":"","nextNext":"BR","renderedBrIsMainRealm":true,"embedOwnerIsPopDoc":true,
   "popBodyHasUnique":true}`
   → cross-realm hazard is REAL for elements the popout creates, but Obsidian's rendered
   markdown carries main-realm element classes, so the current code happens to work. Hence
   SHOULD-FIX rather than BLOCKING.

Both throwaway specs died with the worktree; `src/` and `e2e/` in the main checkout untouched.

## Reasoning trail worth keeping

- The two branches are disjoint on `afterMarker` (`"" ` vs `/^\s/`), so the restructure can only
  change behaviour for `afterMarker === ""` — regression analysis reduces to that one case, and
  the probe covers every realistic shape of it.
- I did NOT find a case where the old code folded and the new code refuses, other than the
  intended `-**bold**` / `` -`code` `` class. `<br>` was the one at-risk shape and it is handled.
- `**![[x]]-** tail` folding is pre-existing; calling it a regression would be wrong. I chose NIT
  + doc-accuracy framing rather than demanding an ancestor walk (over-engineering for the value).
- Hesitated between SHOULD-FIX and BLOCKING on SF-1; measurement showed no user-visible breakage
  today, and the repo ships with lint warnings already, so BLOCKING would be overcalling.

## For whoever handles the response

The two SHOULD-FIX items are each ~1-3 lines of change (`next.instanceOf(HTMLBRElement)`, one
extra fixture line + one test). No architectural rework requested.

---

# ROUND 2 private notes — `af1d63c`

## What I actually executed (round 2)

1. `npm run lint` → EXIT=0, `.tmp/r2-lint.log`. ONE warning only (`prefer-setting-definitions`).
   The `prefer-instanceof` warning I flagged in SF-1 is gone. Baseline restored.
2. `npm run build` → EXIT=0, `.tmp/r2-build.log`. NOTE for future rounds: `build` is
   `tsc -noEmit -skipLibCheck && esbuild`, so build green == type-check green.
3. `npm run test:e2e` FULL → EXIT=0, **46 passed** (7.0s), `.tmp/r2-e2e-full.log`.
4. INDEPENDENT mutation (did not trust the implementer's): worktree `.worktree/r2-check` at
   `af1d63c`, symlinked `node_modules`, replaced `isEndOfLine` body with `return next === null;`,
   ran `e2e/foldable-embeds.e2e.ts` → EXIT=1, `1 failed, 8 passed`; failure is exactly the new
   soft-break test (`toHaveClass` — not folded). `.tmp/r2-e2e-mutated.log`.
5. N-2 independence: same worktree restored, `-g "tail. still folds"` → EXIT=0, `1 passed`.
   `.tmp/r2-e2e-isolated.log`. So the added `openFile`/`setMarkdownViewMode` really works.
6. Worktree removed; `git worktree list` clean, `git status` clean. No `sanity_check.sh` here.
   Obsidian binary is cached under `$XDG_CACHE_HOME/obsidian-e2e` and is SHARED across
   checkouts — that is why worktree e2e runs work without re-downloading. Worth remembering.

## Reasoning worth keeping

- The one real risk of taking SF-1 was that `instanceOf` might not recognise a SAME-realm
  `<br>` and would silently kill the branch. The soft-break test is the only test touching
  that clause, and it PASSES post-change while FAILING under mutation — so the rewrite is
  runtime-verified, not merely lint-verified. That closes SF-1 properly.
- N-3 rejection is correct behaviour, not evasion: deciding the cross-mode contract changes
  user-visible behaviour in one mode and needs human alignment. I would have flagged the
  OPPOSITE (implementer unilaterally "harmonising" the modes) as a finding.
- N-1: I offered "fix the wording OR file a ticket"; wording was chosen and the code doc now
  matches the code exactly ("only SIBLINGS are inspected"). No overclaim left, so pressing
  for the ancestor walk would be me re-litigating my own 80/20 call. Did not.
- Only new observation this round is cosmetic (CLAUDE.md sentence density) — deliberately
  logged as non-blocking so it cannot be read as a gate.

## Convergence

Round 1: 2 SHOULD-FIX + 3 NITs. Round 2: 2/2 SHOULD-FIX resolved and independently proven,
2/3 NITs incorporated, 1 rejected with a sound rationale. Nothing outstanding. READY.
