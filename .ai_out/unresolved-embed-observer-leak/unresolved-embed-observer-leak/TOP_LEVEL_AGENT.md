# TOP_LEVEL_AGENT — unresolved-embed-observer-leak

Ticket: nid_78cl6bo3t8umqbndughsbjez9_e (bug, p1) — Reading mode: unresolved embeds accumulate
MutationObservers without bound. **CLOSED.**

Branch: `unresolved-embed-observer-leak` (off `settings-persistence-fix` @ a60d967).
Flow: EXPLORE → IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → ITERATION 1 → RE-REVIEW.

## Outcome

Converged in ONE iteration. Re-review verdict: **READY**, with src/ and e2e/ left pristine by
the reviewer. Gates re-run by the reviewer independently: lint 0 errors (1 pre-existing warning
in `src/settings/foldableEmbedsSettingTab.ts`, untouched), build clean, full e2e 57 passed /
0 failed (55 before; +2 new specs, both verified RED-for-the-right-reason by hunk revert).

The one blocking finding was that **the ticket's own design point 1 was wrong**: bailing on
`file-embed` before creating the observer. MEASURED — Obsidian upgrades the same span in place
when the missing note is later created, so the bail silently made late-resolved embeds
unfoldable. Dropped; design point 2 (render-child-bound observer) alone bounds the leak.

## Log

- [x] Branch created, ticket in_progress.
- [x] EXPLORE → EXPLORATION_PUBLIC.md
- [x] IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md (a952ca9..fbb018a)
- [x] IMPLEMENTATION_REVIEW → IMPLEMENTATION_REVIEW__PUBLIC.md (SHIP WITH FIXES, 1 blocking)
- [x] ITERATION 1 → IMPLEMENTATION_ITERATION__PUBLIC.md (cd2b366, 2923d3a, dd46fcc)
- [x] RE-REVIEW → appended to IMPLEMENTATION_REVIEW__PUBLIC.md (READY)
- [x] change_log entry 3x1gb97z86oooe1njbojk7o87 (one entry for the whole flow)
- [x] Ticket closed with resolution note.

## Left open deliberately

Reviewer's two non-blocking observations are recorded in IMPLEMENTATION_REVIEW__PUBLIC.md
(second-pass `ctx` binding discarded by the guard; the sync `isMediaEmbed` bail being new vs
baseline but safe). Neither is a defect — no follow-up ticket filed.
Out-of-scope and untouched: nid_1ngosntduq5baizn9b7056h34_e (nested-embed teardown), which this
change makes easier.
