# Reviewer private notes — unresolved-embed-observer-leak

## State: review round 1 DONE, verdict SHIP WITH FIXES (1 BLOCKING, 2 SHOULD-FIX, 2 NIT).
Public review: `IMPLEMENTATION_REVIEW__PUBLIC.md` (same dir).

## Gates run myself (all from repo root)
- lint exit 0 (1 pre-existing warning), build exit 0 → `.tmp/review/lint.log`, `.tmp/review/build.log`
- full e2e: 55 passed → `.tmp/review/e2e-full.log`
- RED check: `git checkout 4d30df8 -- src/` + spec → `Expected <=2 / Received 6` → `.tmp/review/e2e-red.log`
  (restored with `git checkout HEAD -- src/` — src is pristine; only `_tickets/...md` is modified, by the implementer.)

## Probe harness I built (reusable for re-review)
- `.tmp/review/probe.config.ts` (playwright config, testDir = `.tmp/review`)
- `.tmp/review/probe-resolve.e2e.ts` (imports `../../e2e/obsidianHarness`)
- Run: `export OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh); export OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"; npx playwright test --config .tmp/review/probe.config.ts`
  (the EXTRA_ARGS are REQUIRED — without them Obsidian dies before CDP; run-e2e.sh sets them.)
- After swapping src, ALWAYS `npm run setup:dev-vault` (it copies main.js into the vault).

## The load-bearing measurement (B1)
`![[probe-later]]` open in reading mode + `app.vault.create` → SAME DOM node upgrades
`file-embed mod-empty` → `markdown-embed inline-embed`.
- fixed code: foldable=0, marks=0 (behaviour LOST)
- pre-fix code: foldable=1, marks=1
- with only `"file-embed",` removed from NON_NOTE_EMBED_CLASSES: foldable=1 AND full suite 55 passed.
That last run is the whole argument: design point 1 is unnecessary AND costs functionality.

## If re-reviewing
1. Re-run the probe — B1 is fixed only if `after-create` shows `foldable=1`.
2. Check a NEW spec exists for the late-resolve case (S1); without it the regression can come back green.
3. Check the `NON_NOTE_EMBED_CLASSES` comment + CLAUDE.md no longer claim "never gains markdown-embed later".
4. S2 (one-observer-per-embed WeakSet) is a should-fix, not a blocker; do not escalate it if the
   implementer argues the reused-DOM double-post-process path is unmeasurable — ask for the measurement.

## Correctly rejected by implementer (do not relitigate)
- deleting `liveObservers` / teardown loop (LP-nested observers survive disable)
- a production test seam for the observer count
- `mod-empty` as the ONLY signal
