# PRIVATE — unresolved-embed observer leak

## State: DONE

Plan (all steps done):
1. [x] Read exploration; read post-processor + mark + harness.
2. [x] MEASURE (a) transient `file-embed` — probe B: classes assigned in ONE shot, bare at
       decision time. Design point 1 is safe; its SYNC half is a no-op except over reused DOM.
3. [x] Failing e2e spec `e2e/unresolved-embed-observers.e2e.ts` (committed a952ca9, RED: 6 > 2).
4. [x] Implement `PendingEmbedObserver` + post-processor rewiring (2b80c06, GREEN).
5. [x] MEASURE (b) teardown loop — probes C/D: needed for LP-nested observers.
6. [x] Docs: module doc comments + CLAUDE.md (54ff677). lint/build/full e2e green (55/55).
7. [x] PUBLIC written, ticket closed, change_log entry.

## Gotchas for a future me

- `git checkout <file>` wiped my UNCOMMITTED implementation once. Commit before running a
  patched-build experiment on the same file.
- First disable measurement was INVALID: I patched out teardown's unload loop but left
  `liveObservers.clear()`, which zeroes the count regardless. Patch out both.
- Probes live in `.tmp/probe/` (gitignored): `probeA-classhistory` (superseded — a
  document-level observer misses the class assignment, it happens while detached),
  `probeB-atcall` (the one that answered (a)), `probeC-lifetime`, `probeD-lpdisable`.
  Run: `OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu" npx playwright test --config .tmp/probe/pw.config.ts <name>`
  (rebuild + `npm run setup:dev-vault` first — the vault gets a COPY of `main.js`).
- Pre-existing lint warning (settings tab / declarative API) is untouched and not mine.
