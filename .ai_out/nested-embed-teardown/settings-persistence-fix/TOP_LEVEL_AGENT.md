# TOP_LEVEL_AGENT — nested-embed-teardown

Ticket: `nid_1ngosntduq5baizn9b7056h34_e` — nested embeds inside Live Preview widgets are never
unmarked; the DISABLED plugin's click listener keeps handling them.

Flow: straightforward-flow
→ IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION

## Log

- [x] EXPLORATION — `EXPLORATION_PUBLIC.md`. Key corrections vs the ticket text: the LP teardown
  test is at `e2e/live-preview-foldable-embeds.e2e.ts:345-369` (not :233); there is NO unit test
  runner in the repo (e2e only). Live Preview already has the WeakSet + AbortController patterns
  to copy. The closed no-teardown ticket only covered top-level reading-view DOM, so this fix is
  additive, not contradictory.
- [ ] IMPLEMENTATION_WITH_SELF_PLAN — in flight.
- [ ] IMPLEMENTATION_REVIEW
- [ ] IMPLEMENTATION_ITERATION
- [ ] Commit, change_log entry, close ticket.
