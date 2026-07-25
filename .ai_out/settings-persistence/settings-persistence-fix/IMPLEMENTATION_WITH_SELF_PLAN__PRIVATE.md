# PRIVATE memory — IMPLEMENTATION_WITH_SELF_PLAN, settings-persistence-fix

## State: DONE + review iteration DONE. Full gate re-run green after the iteration (lint 0 errors / 1 pre-existing warning, build 0, e2e 37 passed). Ticket NOT closed (TOP_LEVEL_AGENT closes it).

## Review iteration (2nd run of this role)
Reviewer verdict was APPROVED, 0 blocking. Dispositions live in
`IMPLEMENTATION_ITERATION__PUBLIC.md` — read that, not this, for the reasoning.
Only things NOT in there:
- The two should-fix items were done with `ticket add-note` (NOT by editing ticket bodies):
  `nid_lcehddb2tdcq6qxztmhvhpgga_e` gained item 4 (store ordering unit tests),
  `nid_fp6hsv6aljxz1ifawlezcfdgu_e` gained the array/string-root `data.json` case.
  If a future instance re-reads those tickets, the notes are at the BOTTOM, after the
  Acceptance Criteria — the enumerated "three pieces" in ticket 1's body is now stale by
  design; the note says "item 4" explicitly.
- Resisted two invitations to gold-plate: retry-on-missing in the harness, and coalescing
  the write queue. Both rejected in writing. Do NOT let a later pass quietly add them.

## What I did
Both defects in `src/settings/foldableEmbedsSettingsStore.ts` fixed exactly per the ticket
design. See `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` for decisions + evidence table — it is
complete; this file only holds what is NOT in there.

## Environment facts worth not rediscovering
- e2e works fine here headless (Obsidian 1.12.7 cached binary). Full suite ~7 s of test time,
  ~30 s wall including dev-vault rebuild. Single spec: `npm run test:e2e -- <spec>.e2e.ts`.
- `scripts/run-e2e.sh` runs `setup:dev-vault` (production build) every time, so e2e always
  tests the CURRENT source — no need to build first.
- Playwright config: workers 1, fullyParallel false, retries 0. `ObsidianHarness.launch()`
  re-seeds `.tmp/e2e/vault` per spec file, so specs cannot interfere.
- `bash` here prints a long env-setup preamble on every call; ignore it in logs.

## Experiment log (so a clone does not redo it)
- 3 synchronous toggle clicks: race never reproduces.
- 51 synchronous clicks, unserialized store: 1 of 3 runs failed with a TORN `data.json`
  (`Unexpected end of JSON input`) — real evidence of two simultaneous writers, but not a
  usable assertion; after I made the harness read torn-tolerant, 3/3 passed even unserialized.
- Conclusion recorded honestly in the spec comment and PUBLIC: the overlapping-toggle test is
  a guard, not a reproduced red.

## If asked to strengthen the race coverage
The only deterministic route is a unit test with a fake `SettingsPersistence` whose `saveData`
resolves out of order (e.g. first call resolves after the second). Blocked on the open ticket
`_tickets/add-a-unit-test-harness-for-pure-fold-logic.md`. Do NOT add a framework here without
alignment — explicitly out of scope for this ticket.

## Gotchas in the code I touched
- `this.saving` must stay a NEVER-rejected promise. If someone "simplifies" it to
  `this.saving = this.saving.then(...)` and returns `this.saving`, both the poison-queue bug
  and an unhandled rejection come back.
- `asKeyedObject` must keep the `Array.isArray` branch: arrays are `typeof "object"` and would
  spread as index keys.
- `ObsidianHarness.readPersistedPluginData()` is now `async` — any new caller must `await`.
