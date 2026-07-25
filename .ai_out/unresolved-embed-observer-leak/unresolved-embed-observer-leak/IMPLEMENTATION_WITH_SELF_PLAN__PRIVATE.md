# PRIVATE — unresolved-embed observer leak

## State: DONE (iteration 1 of review applied; awaiting re-review, ticket NOT closed by me)

Iteration 1 (fresh instance):
1. [x] Rehydrated; read the review.
2. [x] RED-first e2e for the late-resolve behaviour (`cd2b366`), then dropped `file-embed`
       from the class list → GREEN. B1 + S1.
3. [x] S2 "already waiting" guard (`pendingEmbeds: WiredElements`) + whitebox double-process
       spec; proved RED (2 → 4) with the guard patched out.
4. [x] N1 rejected as stated (polling an upper bound only weakens it) but assertions made
       ABSOLUTE instead. N2 left to nid_1ngosntduq5baizn9b7056h34_e.
5. [x] Docs made true: `MEDIA_EMBED_CLASSES`, post-processor + observer class docs,
       `WiredElements`, CLAUDE.md.
6. [x] Gates: lint 0 errors / 1 pre-existing warning, build clean, full e2e 57 passed
       (`.tmp/e2e-full-iter1.log`). Commits `cd2b366`, `2923d3a`, docs commit after.

## Original pass (context)

Plan (all steps done):
1. [x] Read exploration; read post-processor + mark + harness.
2. [x] MEASURE (a) transient `file-embed` — probe B: classes assigned in ONE shot, bare at
       decision time. ~~Design point 1 is safe~~ — WRONG, see iteration 1: probe B measured the
       FIRST settling mutation only, and `mod-empty` is not terminal.
3. [x] Failing e2e spec `e2e/unresolved-embed-observers.e2e.ts` (committed a952ca9, RED: 6 > 2).
4. [x] Implement `PendingEmbedObserver` + post-processor rewiring (2b80c06, GREEN).
5. [x] MEASURE (b) teardown loop — probes C/D: needed for LP-nested observers.
6. [x] Docs: module doc comments + CLAUDE.md (54ff677). lint/build/full e2e green (55/55).
7. [x] PUBLIC written, ticket closed, change_log entry.

## Gotchas for a future me

- `git checkout <file>` wiped my UNCOMMITTED implementation once. Commit before running a
  patched-build experiment on the same file. **It happened AGAIN in iteration 1** (patched the
  guard out with `if (false && …)`, then `git checkout` to restore → lost the whole uncommitted
  B1 fix and had to redo it). Next time: copy the file to `.tmp/` first, or commit first.
- First disable measurement was INVALID: I patched out teardown's unload loop but left
  `liveObservers.clear()`, which zeroes the count regardless. Patch out both.
- Probes live in `.tmp/probe/` (gitignored): `probeA-classhistory` (superseded — a
  document-level observer misses the class assignment, it happens while detached),
  `probeB-atcall` (the one that answered (a)), `probeC-lifetime`, `probeD-lpdisable`.
  Run: `OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu" npx playwright test --config .tmp/probe/pw.config.ts <name>`
  (rebuild + `npm run setup:dev-vault` first — the vault gets a COPY of `main.js`).
- Pre-existing lint warning (settings tab / declarative API) is untouched and not mine.
