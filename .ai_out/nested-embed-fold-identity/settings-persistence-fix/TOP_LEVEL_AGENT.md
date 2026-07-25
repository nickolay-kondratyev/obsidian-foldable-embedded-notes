# TOP_LEVEL_AGENT — nested-embed-fold-identity

Ticket: `nid_zqaxj18jbxwnazzz8aeggz91u_e` — Reading mode: nested embeds share ONE fold state.

Flow: straightforward-flow
→ EXPLORATION
→ IMPLEMENTATION_WITH_SELF_PLAN
→ IMPLEMENTATION_REVIEW
→ IMPLEMENTATION_ITERATION

## Log

- [x] EXPLORATION spawned (background, Explore/sonnet). Output: `EXPLORATION_PUBLIC.md`.
  - Key note passed down: ticket cites `buildKey` in `foldableEmbedsPostProcessor.ts:120-130`,
    but key derivation has MOVED to `src/embedFoldKeys.ts`. Ticket line refs are STALE.
- [ ] IMPLEMENTATION_WITH_SELF_PLAN
- [ ] IMPLEMENTATION_REVIEW
- [ ] IMPLEMENTATION_ITERATION
- [ ] commit + change_log entry + close ticket

## Open questions to resolve during flow

- Ordering race: is the HOST embed guaranteed wired (present in the WeakMap) before the
  nested embed's post-processor pass runs? Needs a robust fallback if not.
