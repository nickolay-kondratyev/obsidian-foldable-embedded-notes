# IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC — settings persistence fix

Ticket `nid_rbh5zfj0mlvuo1hi2trl8fxli_e` (priority 1, bug). Branch `settings-persistence-fix`.

## Plan (executed as written)

1. Write the new e2e spec FIRST and observe it red pre-fix.
2. Fix defect 2 (unknown keys dropped) — raw retention on load, merge on save.
3. Probe whether the race (defect 1) actually reproduces before fixing it.
4. Fix defect 1 — serialize saves through a promise queue.
5. Full gate: lint, build, e2e.

## Decisions and rationale

- **Rejected chain must not poison the queue.** `setStartCollapsed` builds `written =
  this.saving.then(() => saveData(...))`, then sets `this.saving = written.catch(() =>
  undefined)` and `await written`. The QUEUE TAIL is a different promise from the one
  returned: the tail is never rejected (so a failed save neither skips every later write nor
  raises an unhandled rejection), while the caller still receives the rejecting promise, so
  `FoldableEmbedsSettingTab.saveStartCollapsed`'s `catch` + `Notice` keeps working. WHY
  comment in the code says exactly this.
- **What gets written when calls overlap: the value at WRITE time.** The callback reads
  `this.current` when it runs, not a value captured at call time. `this.current` is assigned
  synchronously at call time, so it is always the newest choice — hence the LAST write in the
  queue (the one that decides the file) writes the state the UI is showing, and every earlier
  queued write is a harmless repeat of an equally-current or older-but-superseded value.
  Capturing at call time would have worked too, but only because of ordering; reading at write
  time is correct for a stronger reason and converges faster.
- **Raw retention on a failed/absent load.** `load()` keeps the raw value through a new
  `asKeyedObject()` guard: anything that is not a plain object (`null` from the swallowed load
  error, a string, an array) becomes `{}`. WHY: `{ ...raw, ... }` would otherwise spread a
  string into `{"0":"a", ...}`. Arrays are excluded explicitly — they carry no named keys worth
  preserving. `parseSettings` is untouched; it remains the strict READ path.
- **New sibling spec, not more tests in `start-collapsed-setting.e2e.ts`.** That suite is about
  what the setting DOES (fold defaults across both render modes) and owns a serial state
  machine over notes it opened; this one is about what the WRITE path leaves on disk, and needs
  its own seed (a key the plugin knows nothing about) plus hostile clicking. Mixing them would
  have made both stories harder to read and would have changed the other suite's fixture.
- **Harness `readPersistedPluginData()` is now async with a bounded retry on unparseable
  JSON.** Writing `data.json` is not atomic (truncate, then write), so a Node-side read landing
  inside a save legitimately sees an empty/half-written file — a property of the READER's
  timing, not of the plugin. Observed for real (see evidence). A save that genuinely wrote
  garbage still fails, since the retries never converge. Both specs updated to `await`.

## Files changed

- `src/settings/foldableEmbedsSettingsStore.ts` — `persisted` (raw round-trip), `saving`
  (queue tail), `asKeyedObject()`, serialized + merging `setStartCollapsed`.
- `e2e/settings-persistence.e2e.ts` — NEW spec, 2 tests.
- `e2e/obsidianHarness.ts` — `readPersistedPluginData()` async + torn-read retry.
- `e2e/start-collapsed-setting.e2e.ts` — `await` the now-async harness read.
- `CLAUDE.md` — settings bullet notes serialized saves + unknown-key round-trip.

## Test evidence (exact, honest)

| Command | Result |
| --- | --- |
| `npm run test:e2e -- settings-persistence.e2e.ts` PRE-FIX | **1 failed, 1 did not run** — unknown-key test red: on-disk object was `{startCollapsed: true}`, missing `someFutureSetting` |
| same, with ONLY the raw-retention fix, 3 clicks | 2 passed — race did NOT reproduce |
| same, 51 clicks, raw-retention only, 3 runs | run 1 **failed** (`SyntaxError: Unexpected end of JSON input` — a torn `data.json`, i.e. two writers on one path), runs 2-3 passed |
| same, 51 clicks, de-serialized store + torn-read-tolerant harness, 3 runs | **3 passed** — the race still did not go red |
| `npm run test:e2e -- settings-persistence.e2e.ts` POST-FIX, 3 runs | 2 passed each run (stable) |
| `npm run lint` | exit 0 (1 pre-existing warning: `prefer-setting-definitions`) |
| `npm run build` | exit 0 |
| `npm run test:e2e` (full) | **37 passed**, exit 0 |

**Red-green honesty:** the unknown-key test is a real observed red → green. The overlapping-toggle
test is **a guard, not a reproduction** — I could not make it fail on demand against the
unserialized store (Obsidian's writes happened to complete in order every time; the one pre-fix
failure I saw was a torn read, which is a symptom of simultaneous writers but not an assertion
I can rely on). This is stated in the spec's own comment so no future reader mistakes it for a
reproduced regression test. It does deterministically catch dropped writes, stale values and a
save still queued behind the final one.

## Out of scope / rejected

- **No unit test framework added** (separate open ticket). A pure-logic test with a fake
  `SettingsPersistence` whose `saveData` resolves out of order WOULD prove the ordering
  deterministically — that is the honest way to close the gap above, and it needs that ticket
  done first. Flagging, not doing it here.
- No change to `parseSettings` (read path stays strict/lossy, per the ticket).

## Open concerns

- The 1 s `STALE_WRITE_GRACE_MS` fixed wait is the only sleep in the suite. It is unavoidable:
  the property is the ABSENCE of a later write, which nothing in the UI reports. Documented.
- `persisted` is captured at load only; keys written to `data.json` by another process while
  Obsidian runs are still lost on the next save. Out of scope (the ticket's scenario is
  cross-machine sync, i.e. at load), and fixing it would mean re-reading before every write.
