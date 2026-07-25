# Reviewer private notes — unresolved-embed-observer-leak

## State: re-review (iteration 1) DONE, verdict READY.
Round 1 verdict was SHIP WITH FIXES (1 BLOCKING, 2 SHOULD-FIX, 2 NIT).
Public review: `IMPLEMENTATION_REVIEW__PUBLIC.md` (round 1 + appended "Re-review (iteration 1)").

## Round 1 (kept for history)
- lint exit 0 (1 pre-existing warning), build exit 0, full e2e 55 passed.
- B1 measured: `file-embed` in the settled list killed "create the missing note → embed becomes
  foldable"; Obsidian upgrades the SAME span in place (`file-embed mod-empty` →
  `markdown-embed inline-embed`).

## Round 2 (iteration 1) — everything I verified MYSELF
Logs under `.tmp/rr2/`.
- lint exit 0 (same 1 pre-existing warning `prefer-setting-definitions`), build exit 0.
- FULL e2e: **57 passed / 0 failed** (11.0s) — `.tmp/rr2/e2e-full-1.log`.
- Flake check: the observers spec run 4× standalone → 5 passed each time, 2.0s
  (`.tmp/rr2/obs-run-{1..4}.log`). The new absolute `toBe(2)` / `toBe(afterFirstRender)` is stable.
- RED proofs (src patched, then `git checkout -- src/`; tree left clean):
  - `file-embed` put back into `MEDIA_EMBED_CLASSES` → late-target spec fails
    `toHaveCount(1) Received: 0` (`.tmp/rr2/red-s1b.log`); the growth spec also goes
    `Expected: 2 / Received: 0` (`.tmp/rr2/red-s1.log`).
  - `if (false && this.pendingEmbeds.has(embed))` → whitebox spec fails
    `Expected: 2 / Received: 4` (`.tmp/rr2/red-s2.log`). Implementer's claim reproduced exactly.
  - `git checkout 4d30df8 -- src/` → growth spec `Expected: 2 / Received: 6` (`.tmp/rr2/red-leak.log`).
    Original leak still pinned; dropping the bail did NOT reintroduce it.
- B1 re-measured with my own round-1 probe (`.tmp/review/probe-resolve.e2e.ts`):
  before-create `file-embed mod-empty`, observers=1 → after-create
  `markdown-embed inline-embed fen-embed`, foldable=1, marks=1, observers=0, same-dom-node=true.
- Extra probe I wrote (`.tmp/rr2/probe-late-usable.e2e.ts`): the late-resolved embed is FULLY
  usable — `.fen-collapse-icon` injected and a title click adds `fen-folded`. PASSED.
  (Round-1 probe's `chevrons=0` was a wrong selector in the probe: class is `fen-collapse-icon`.)

## Residual notes (raised as suggestions only, not blocking)
- The `pendingEmbeds` bail makes a SECOND pass over the same still-pending span a no-op, so that
  pass's `ctx` never binds. Bad ordering (pass 2, then pass-1's component unloads while the span
  survives, no further pass) would leave the span unwatched. Narrow/theoretical; the opposite
  ordering self-heals because `forgetObserver` releases the WeakSet entry.
- The SYNC `isMediaEmbed` bail is NEW vs baseline `4d30df8` (baseline only stopped on mutation).
  Analysed safe: a media class implies an extension-bearing resolved target, which cannot become
  markdown.
- Whitebox double-`process` spec pins `postProcessor.process` + a 3-member ctx stub; it throws
  loudly rather than silently passing, so acceptable.
