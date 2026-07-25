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
- [x] IMPLEMENTATION_WITH_SELF_PLAN — `ce2e132` (failing specs) → `afc21eb` (fix) → `cc4d59a` (measure+docs).
- [x] IMPLEMENTATION_REVIEW — NOT-READY: 2 SHOULD-FIX, no design defect.
- [x] IMPLEMENTATION_ITERATION 1 — `7418749`, `21e1e75`. Both accepted; F2 was BIGGER than the
      reviewer's suggested fix.
- [x] RE-REVIEW — **READY**, 0 blocking / 0 should-fix, 4 NITs.
- [x] Final nit pass — `a716e32`.
- [x] change_log `eyiwu95dts8xlb7kmysc1lk6k`; ticket closed.

## Converged. Outcome

Nested key = `<hostKey>::in::<ownKey>` via `EmbedFoldKeyRegistry`.

**Ordering question (the flow's main risk) — RESOLVED BY DESIGN, then measured.** The
registry keys off the host span having been SEEN by `process()` (synchronous registration,
lazy memoised derivation), NOT off it having been WIRED — the latter is a MutationObserver
race. Probe on real Obsidian 1.12.7: zero host-lookup misses in the reading view.

## Two things the flow caught that a single pass would have shipped

1. A FALSE claim in the source that the fix covered Live Preview's cross-note bleed. The
   reviewer disproved it with an LP probe. Corrected in source + CLAUDE.md; the real
   (pre-existing) LP limitation is now ticketed.
2. A VACUOUS cold-start spec — green with the fix reverted because the vault was already
   WARM. Self-caught by the implementer; cold window now injected via
   `ObsidianHarness.withUnindexedNote`.

Also non-obvious: the two halves of a nested key warm up INDEPENDENTLY, so the obvious
one-line takeover was insufficient — hence `supersededKeys` emitting every weak/strong
combination.

## Follow-ups filed

- `nid_jdpdpu7w0nfda3y4decz7f6xy_e` — LP nested embeds share ONE fold state across ALL hosts.
- `nid_q0lwq06py1qnhp0b6e4d1w2dh_e` — `npm run build` does not typecheck `e2e/`.
