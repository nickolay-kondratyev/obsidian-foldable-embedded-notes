# TOP_LEVEL_AGENT — e2e assertion robustness

Ticket: `nid_ocmytlb996sexgks0wagew41s_e` — "e2e: assertions that can pass vacuously, plus harness robustness gaps" (priority 1, type bug).

Four independent defects:
1. `e2e/foldable-embeds.e2e.ts:115-127` round-trip test does not re-render → vacuous.
2. `e2e/start-collapsed-setting.e2e.ts` `expectFolded(embed, false)` is a bare negated matcher → passes when element is GONE.
3. `e2e/obsidianHarness.ts:309-315` `readPersistedPluginData` throws on mid-write `data.json` under `expect.poll`.
4. `e2e/obsidianHarness.ts:129-138` STDOUT never drained (deadlock risk); stderr listener leak; bare `kill()` on launch-failure path.

Flow: straightforward-flow → EXPLORATION → IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION.

## Log

- [x] EXPLORATION_HARNESS + EXPLORATION_RUNTIME spawned (parallel, background).
- [ ] EXPLORATION_PUBLIC.md consolidated
- [ ] IMPLEMENTATION_WITH_SELF_PLAN
- [ ] IMPLEMENTATION_REVIEW
- [ ] IMPLEMENTATION_ITERATION
- [ ] change_log entry + ticket close (TOP_LEVEL_AGENT only)
