# IMPLEMENTATION_REVIEW__PUBLIC — settings persistence fix

Reviewed: commit `503f05b` on `settings-persistence-fix`, diffed against `b2777a6`.
Ticket: `nid_rbh5zfj0mlvuo1hi2trl8fxli_e` (priority 1, bug).

## Gates I ran myself

| Command | Result I observed |
| --- | --- |
| `npm run lint` | exit 0 — 0 errors, 1 warning (`obsidianmd/settings-tab/prefer-setting-definitions`, pre-existing, own open ticket `nid_te0hj5zcdpmho937ct3lif7oq_e`) |
| `npm run build` | exit 0 (`tsc -noEmit` + esbuild production) |
| `npm run test:e2e` | exit 0 — **37 passed** in 6.6 s, including the 2 new `settings-persistence.e2e.ts` tests. Note `scripts/run-e2e.sh:29` type-checks `e2e/` too, so the harness's sync→async signature change IS compiler-verified. |

## Correctness analysis (the parts I was asked to scrutinise)

All of the following I checked and found **correct** — recorded so the reasoning is not
re-done later:

- **Poisoned chain.** `foldableEmbedsSettingsStore.ts:92-98`. `written` is the caller's
  promise; `this.saving = written.catch(() => undefined)` is a *different*, never-rejected
  promise. A failed save therefore does not skip later writes, and the tail cannot raise an
  unhandled rejection. `written` itself has a `.catch` derived from it (so it counts as
  handled) *and* is awaited by the caller, so the settings tab's `try/catch` +
  `Notice` (`foldableEmbedsSettingTab.ts:41-48`) still fires. The only caller is that tab —
  verified by grep — so there is no un-caught path.
- **Which value reaches disk.** The queued callback reads `this.current` at WRITE time, and
  `this.current` is assigned synchronously at CALL time (`:91`). So the last write in the
  queue — the one that decides the file — always writes the newest value, i.e. the value the
  UI is showing. Earlier queued writes are harmless repeats. This matches the doc comment at
  `:84-87` exactly; the comment is accurate, not aspirational.
- **Raw retention safety.** `asKeyedObject` (`:50-55`) rejects `null`, arrays and non-objects
  before the spread, so `"ab"` can never become `{"0":"a","1":"b"}` and an array can never be
  spread into the saved object. After a failed/absent load, `readPersisted` returns `null` →
  `persisted = {}` → the save writes just `{startCollapsed}`. That is the only safe choice
  (there is nothing trustworthy to preserve), and overwriting an unparseable `data.json` is
  the right outcome.
- **`parseSettings` was not weakened.** `src/settings/foldableEmbedsSettings.ts` is untouched
  in this commit; it remains the strict, lossy READ path. The lossy read and the lossless
  write are now deliberately different paths, and that is documented.
- **No functionality removed.** The diff is additive; no test, spec or anchor point was
  deleted. All 35 pre-existing e2e tests still pass.
- **Test honesty.** The unknown-key test is a real observed red→green (I re-read the evidence
  table and the assertion: the seed is `startCollapsed: false`, so the assertion `true` can
  only be answered by a genuine write, and `toEqual` on the WHOLE object is what makes a
  dropped key fail). The overlapping-toggle test is labelled in the spec's own comment as a
  GUARD, not a reproduction. That labelling is honest and correct, and the test is not
  vacuous: 51 clicks in one JS task genuinely put 51 `onChange` calls in flight, the odd count
  makes the end state the opposite of the start (so a fix that merely dropped writes fails),
  and the fixed-wait re-read at `settings-persistence.e2e.ts:126-132` genuinely tests the
  absence of a trailing stale write. No silent fallback, no assertion weakened to fit.
- **Harness change is justified and general.** `obsidianHarness.ts:308-331`: `data.json` is
  written non-atomically, so a Node-side read landing inside a save can see a half-written
  file. Retrying an unparseable read is a property of the READER, is bounded (5 × 50 ms), and
  a save that really wrote garbage still fails because the retries never converge. Not a hack.
- **CLAUDE.md edit** (`CLAUDE.md:25-28`) is three lines, stable knowledge (serialized saves +
  raw merge and the WHY for each), and accurate.

## BLOCKING

None.

## SHOULD-FIX

1. **The P1 defect's deterministic regression test exists nowhere, not even as a tracked
   item.** — `.ai_out/.../IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md:77-80` correctly defers a
   unit test to ticket `nid_lcehddb2tdcq6qxztmhvhpgga_e` ("Add a unit-test harness for pure
   fold logic"), but I read that ticket: it enumerates three items, all in `src/livePreview/`,
   and says nothing about the settings store. So once this feature dir is archived, the
   knowledge that ordering has no red-provable test is lost.
   *Failure scenario:* someone later "simplifies" `setStartCollapsed` back to a bare
   `await saveData(...)`; the whole suite stays green (the guard test passed against the
   unserialized store on every run), and the P1 bug silently returns.
   *Direction:* append a 4th item to that ticket — `FoldableEmbedsSettingsStore` against a fake
   `SettingsPersistence` whose `saveData` resolves out of order: (a) last write wins, (b) a
   rejected save does not skip the next one, (c) the rejection still reaches the caller. This
   is a ticket edit, not code.

2. **`asKeyedObject`'s new defensive branches have zero coverage.** —
   `src/settings/foldableEmbedsSettingsStore.ts:50-55`. The string / array / `null` cases are
   new logic guarding real data loss, and nothing exercises them at any level.
   *Failure scenario:* a refactor drops the `Array.isArray` check; a hand-edited `data.json`
   containing `[1,2]` is then spread into `{"0":1,"1":2,"startCollapsed":…}` and written back,
   permanently mangling the file — all gates stay green.
   *Direction:* cheapest is to fold this into ticket `nid_fp6hsv6aljxz1ifawlezcfdgu_e`
   ("Cover parseSettings' non-boolean data.json branch in e2e"), which already owns
   hostile-`data.json` seeding: seed a `data.json` whose root is an array/string, toggle, and
   assert the file is exactly `{startCollapsed: true}`. Or cover it in the unit-test ticket
   above alongside item 1.

## NICE-TO-HAVE

3. **`readPersistedPluginData` retries an unparseable read but not a missing one.** —
   `e2e/obsidianHarness.ts:319-321` returns `null` immediately when `existsSync` is false, and
   that `return` sits *inside* the retry loop where it reads as if it were retried.
   Low probability today (the desktop adapter truncates + writes rather than renaming), but if
   Obsidian ever switches to write-temp-then-rename, the non-polled assertion at
   `e2e/settings-persistence.e2e.ts:129` would flake as `null !== {…}`.
   *Direction:* treat "absent" like "unparseable" — retry, and return `null` only after the
   attempts are exhausted. Harmless for the legitimate never-saved case (adds ≤250 ms inside
   an `expect.poll`).

4. **Unbounded write queue.** — `foldableEmbedsSettingsStore.ts:92`. 51 clicks queue 51 full
   file writes, of which all but the first are byte-identical. Correct, just wasteful. Not
   worth fixing now: coalescing (keep at most one pending write) would complicate the
   per-caller failure reporting that finding-free point 1 above depends on, for a user action
   that is realistically 2 clicks. Recording the trade-off, not asking for a change.

5. **Two small doc inaccuracies in the feature dir** (not in shipped code):
   `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md:43` and `:51` claim `start-collapsed-setting.e2e.ts`
   was updated to `await`; it was not changed (its single call site is inside `expect.poll`,
   which needed no change). Also `foldableEmbedsSettingsStore.ts:23` calls the field
   "`data.json` AS IT WAS FOUND", which is not literally true for the non-object case the very
   next comment describes — "the keyed part of `data.json` as it was found" would be exact.

## Documentation Updates Needed

- `CLAUDE.md`: none. The edit is accurate and succinct.
- Tickets: see SHOULD-FIX 1 and 2 (edits to `nid_lcehddb2tdcq6qxztmhvhpgga_e` and
  `nid_fp6hsv6aljxz1ifawlezcfdgu_e`). Ticket `nid_rbh5zfj0mlvuo1hi2trl8fxli_e` can be closed
  once those are recorded.

## VERDICT

**APPROVED** — both defects are genuinely fixed, the implementation is sound under overlap
and under failure, and the implementer's red/green reporting is honest (including admitting
the race could not be reproduced on demand). The two SHOULD-FIX items are ticket edits that
protect the fix from silent regression, not code defects; neither blocks merge.

Gates I personally observed: `npm run lint` exit 0 (1 pre-existing warning), `npm run build`
exit 0, `npm run test:e2e` exit 0 — 37 passed.
