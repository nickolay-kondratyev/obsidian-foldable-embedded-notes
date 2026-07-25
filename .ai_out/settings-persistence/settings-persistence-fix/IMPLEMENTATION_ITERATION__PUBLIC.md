# IMPLEMENTATION_ITERATION__PUBLIC — settings persistence fix

Responds to `IMPLEMENTATION_REVIEW__PUBLIC.md` (verdict APPROVED: 0 blocking, 2 should-fix,
3 nice-to-have) on top of commit `503f05b`, branch `settings-persistence-fix`.

## Disposition of every finding

| # | Finding | Disposition |
| --- | --- | --- |
| BLOCKING | none | — |
| SHOULD-FIX 1 | Ordering has no deterministic regression test, and the deferral lives only in the feature dir | **INCORPORATED** — ticket note |
| SHOULD-FIX 2 | `asKeyedObject`'s array/string/null branches have zero coverage | **INCORPORATED** — ticket note |
| NICE-TO-HAVE 3 | `readPersistedPluginData` retries an unparseable read but not a missing one | **PARTIALLY INCORPORATED** — clarity fix taken, behaviour change REJECTED |
| NICE-TO-HAVE 4 | Unbounded write queue | **REJECTED** (reviewer did not ask for a change either) |
| NICE-TO-HAVE 5 | Two doc inaccuracies | **INCORPORATED** |

## SHOULD-FIX 1 — INCORPORATED (ticket edit, no code)

`ticket add-note nid_lcehddb2tdcq6qxztmhvhpgga_e` ("Add a unit-test harness for pure fold
logic") now carries an **item 4**: `FoldableEmbedsSettingsStore` against a fake
`SettingsPersistence` whose `saveData` resolves out of order, with the four cases the
reviewer named — (a) last write wins / one write per call, (b) a rejected save does not skip
the next, (c) the rejection still reaches the caller, (d) `asKeyedObject` as the cheap
pure-logic alternative to the e2e route. The note states plainly WHY it is not optional:
the existing e2e "overlapping toggles" test passed even against the UNSERIALIZED store, so
it is a guard, not a red-provable regression test for the P1 ordering bug — and it records
the failure scenario (someone re-simplifies `setStartCollapsed`, suite stays green, bug
returns). Appended as a note rather than rewriting the body so the ticket's own history
stays readable; no new redundant ticket was created.

## SHOULD-FIX 2 — INCORPORATED (ticket edit, no code)

`ticket add-note nid_fp6hsv6aljxz1ifawlezcfdgu_e` ("Cover parseSettings' non-boolean
data.json branch in e2e") now carries a **second case**: seed a `data.json` whose root is an
array (and/or a bare string), toggle through the real settings dialog, assert the file is
exactly `{"startCollapsed": true}` — mutation-proven by removing the `Array.isArray` guard.
That ticket already owns hostile-`data.json` seeding, so this is the cheapest home. The note
also points at the unit-test ticket as the cheaper alternative if that lands first.
The ticket TITLE still says "parseSettings"; deliberately not renamed (a rename means moving
the file for one word — not worth it; the note is where a maintainer reading the ticket
lands anyway).

## NICE-TO-HAVE 3 — split: clarity taken, behaviour REJECTED

- **REJECTED — retrying an ABSENT `data.json`.** "Never written" is an ANSWER, not a
  transient state; conflating it with a torn read would make `null` mean "absent, probably"
  and would slow every legitimate first-save poll (the callers that wait for a save are
  already inside `expect.poll`, so they retry at a higher level where the waiting belongs).
  The trigger is hypothetical (Obsidian's desktop adapter truncates + writes; it would have
  to switch to write-temp-then-rename), and the specs that would flake do not exist yet.
  Adding a retry today buys nothing and costs both time and honesty of the return value.
- **INCORPORATED — the readability half.** The `return null` sat INSIDE the retry loop,
  reading as if it were retried when it never could be. Hoisted the `existsSync` check above
  the loop and added a WHY-NOT comment recording the rejection above, so the next reader does
  not re-litigate it. Behaviour is unchanged for every case that occurs (the only divergence
  would be a `data.json` deleted BETWEEN two retry attempts — nothing deletes it).

## NICE-TO-HAVE 4 — REJECTED

Agreed with the reviewer's own conclusion. Coalescing the queue (keep at most one pending
write) would entangle per-caller failure reporting — the property that makes the settings
tab's `Notice` fire — to save redundant writes for a user action that is realistically two
clicks. Wrong trade under KISS. Recorded here as the trade-off, not tracked as a ticket:
there is no defect and no user-visible cost.

## NICE-TO-HAVE 5 — INCORPORATED

- `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md`: removed `e2e/start-collapsed-setting.e2e.ts`
  from "files changed" and replaced the "both specs updated to `await`" claim with an explicit
  correction saying WHY that file needed no change (its call site is inside `expect.poll`,
  which awaits the returned promise itself). The reviewer was right; the doc was wrong.
- `src/settings/foldableEmbedsSettingsStore.ts:23` — "`data.json` AS IT WAS FOUND" →
  "The KEYED PART of `data.json` as it was found". The old wording contradicted the very next
  comment, which describes dropping a non-object root. Comment-only.

## Gate — re-run because code changed (observed, not assumed)

| Command | Result observed |
| --- | --- |
| `npm run lint` (`.tmp/iter-lint.log`) | exit 0 — **0 errors, 1 warning**, the pre-existing `obsidianmd/settings-tab/prefer-setting-definitions` (own ticket `nid_te0hj5zcdpmho937ct3lif7oq_e`) |
| `npm run build` (`.tmp/iter-build.log`) | exit 0 |
| `npm run test:e2e` (`.tmp/iter-e2e.log`) | exit 0 — **37 passed** in 6.7 s |

Identical to the reviewer's own numbers. No test was added, removed, skipped or weakened in
this iteration — the changes are one comment, one comment-plus-hoist in the e2e harness, and
two feature-dir doc corrections.

## Files changed in this iteration

- `src/settings/foldableEmbedsSettingsStore.ts` — one doc-comment wording fix.
- `e2e/obsidianHarness.ts` — `existsSync` hoisted out of the retry loop + WHY-NOT comment.
- `.ai_out/settings-persistence/settings-persistence-fix/IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` — two corrections.
- `_tickets/add-a-unit-test-harness-for-pure-fold-logic.md` — item 4 (via `ticket add-note`).
- `_tickets/cover-parsesettings-non-boolean-datajson-branch-in-e2e.md` — second case (via `ticket add-note`).

Not touched: `CLAUDE.md` (reviewer: none needed), the fix itself, any test.

## Readiness

**READY TO MERGE.** Both should-fix items are now tracked where a maintainer will find them
(in the tickets, not in a feature dir that gets archived); the nice-to-haves are resolved or
rejected with rationale; the full gate is green and personally observed. Ticket
`nid_rbh5zfj0mlvuo1hi2trl8fxli_e` is ready for TOP_LEVEL_AGENT to close — I deliberately did
not close it.
