# IMPLEMENTATION_REVIEWER — private notes (rehydration)

Reviewed `9e5525c..HEAD`. Public findings: `IMPLEMENTATION_REVIEW__PUBLIC.md` (1 BLOCKING, 5
SHOULD-FIX, 4 NITs). Read-only on src/e2e — nothing was changed.

## State when I finished

- Main tree clean apart from my two artifacts (committed).
- Fresh evidence I produced: `.tmp/rev-lint.log`, `.tmp/rev-build.log`,
  `.tmp/rev-e2e-foldkey.log` (2 passed), `.tmp/rev-e2e-full.log` (48 passed).
- No `.worktree/` created: the revert-proof was unnecessary because
  `git diff e5970b3..HEAD -- e2e/reading-mode-fold-key.e2e.ts` is EMPTY and the pre-fix logs
  `.tmp/e2e-foldkey-failing{,-2}.log` are red at the post-edit assertions (`:127`, `:151`).
  That is a stronger proof than a revert run and costs nothing.

## Reasoning I do not want to redo

- **B1 (cold cache) is a genuine REGRESSION, not just an unfixed edge.** Old line key was
  cache-independent → cold render and warm render agreed → fold survived. New key: cold render
  writes `L…`, warm render reads `occ…` → miss. The implementer's own measurement proves it: the
  pre-existing test "fold state survives leaving the note and coming back" went red 1-in-4 and was
  fixed in the HARNESS. Hence blocking on human sign-off, not on code quality.
- **The obvious cheap repair is wrong**: "on `occ` miss, fall back to reading the `L` key"
  re-introduces the misattribution that new test 2 pins (survivor's `occ` misses, `L` hits).
  Don't let anyone propose it. The viable option is deferring the wiring until the cache answers
  (bounded), as the ticket's option 2.
- **z4jq frequency argument**: line key needed exact line coincidence; occurrence key hands the
  fold over unconditionally. Same class, higher hit rate. Docs currently flatten this.
- **Ordinal alignment is safe** because `SEL_INTERNAL_EMBED` is `.internal-embed` (media
  included) and `EmbedCache` includes media too. I checked this rather than assuming.
- **The barrier in `waitForBothEmbedsWired` is not vacuous** because `markFoldable` →
  `ensureChevron` → `applyFoldState` is one synchronous block, so `.fen-embed` present already
  implies the fold projection ran. The chevron wait is belt-and-braces.
- **Harness wait verdict: real readiness, not a sleep.** I considered and rejected calling it a
  masking hack per se; the masking problem is the absence of any remaining coverage for the
  cold-cache regression, which is B1's substance.

## If asked to re-review after fixes

Re-check: the "strictly less lossy" sentence is gone everywhere (src + ticket + plan doc); the
z4jq frequency note landed; CLAUDE.md trimmed to a pointer; and — if option 2 was taken — that a
new e2e folds in the FIRST render after launch (openFile WITHOUT the index wait) and asserts
survival, otherwise the fix is unfalsifiable.
