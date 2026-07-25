# TOP_LEVEL_AGENT — nested-embed-teardown

Ticket: `nid_1ngosntduq5baizn9b7056h34_e` — nested embeds inside Live Preview widgets are never
unmarked; the DISABLED plugin's click listener keeps handling them.

Flow: straightforward-flow
→ IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION

## Log

- [x] EXPLORATION — `EXPLORATION_PUBLIC.md`. Corrections vs the ticket text: the LP teardown
  test is at `e2e/live-preview-foldable-embeds.e2e.ts:345-369` (not :233); there is NO unit test
  runner (e2e only). LP already had the WeakSet + AbortController patterns to copy. The closed
  no-teardown ticket only covered top-level reading-view DOM, so this fix is additive.
- [x] IMPLEMENTATION_WITH_SELF_PLAN — commit `622a483`. New `src/foldableEmbedMark.ts` and
  `src/wiredElements.ts`; nested-embed e2e fixture written first and confirmed red.
  lint PASS, build PASS, e2e 43/43.
- [x] IMPLEMENTATION_REVIEW — `IMPLEMENTATION_REVIEW__PUBLIC.md`. Verdict SHIP WITH FIXES; both
  MUST-FIX items were comment/doc honesty, no correctness blocker.
- [x] IMPLEMENTATION_ITERATION (1 round, converged) — commit `3433d51`, comment/doc/ticket only.
  Both MUST-FIX accepted; 4 OPTIONAL findings ticketed rather than widened into scope; 2 rejected
  with rationale. Both roles signal ready.
- [x] change_log entry `3sjboyo948vtdyyeo80pb5ujn`.
- [ ] **Ticket NOT closed — awaiting human sign-off** on the one deviation from the ticket's own
  Design section (part 3 skipped) and on shipping the measured AC3 limitation.

## Open for the human

1. **Deviation**: ticket Design part 3 (LP `destroy()` sweeping nested embeds) was NOT
   implemented — redundant once the post-processor owns teardown, and it would orphan a live
   post-processor listener on view recreation. Reviewer independently accepted the reasoning.
   CLAUDE.md requires human approval for deviations from explicit requirements.
2. **Measured limitation shipped**: after disable+re-enable, nested embeds in an ALREADY-OPEN
   note stay unfoldable until the note is reopened. Since a plugin update is a disable+enable,
   this is user-visible. Filed as `nid_o44oqs41s0z21xttblyk513v7_e` rather than widening scope.

## Follow-up tickets filed by this flow

- `nid_o44oqs41s0z21xttblyk513v7_e` — re-enabled plugin does not adopt already-rendered embeds.
- `nid_afu1pcd19esc3v9i2xckicrtq_e` — nothing stops BOTH modes wiring the same embed title now
  that the shared class guard is gone.
- `nid_9bvqz2a3rzved4u2pci21tyfr_e` — plugin disabled during `onload`'s `await settings.load()`
  registers a post-processor on an unloaded plugin.
- `nid_...` (e2e) — the plugin-disable count-0 assertions can pass for the wrong reason.
- `nid_...` (unmark) — `EmbedFoldDom.unmark` can steal a nested embed's chevron (unscoped query).
