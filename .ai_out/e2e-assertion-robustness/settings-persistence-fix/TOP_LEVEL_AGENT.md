# TOP_LEVEL_AGENT — e2e assertion robustness

Ticket: `nid_ocmytlb996sexgks0wagew41s_e` — "e2e: assertions that can pass vacuously, plus harness robustness gaps" (priority 1, type bug).

Four independent defects:
1. `e2e/foldable-embeds.e2e.ts:115-127` round-trip test does not re-render → vacuous.
2. `e2e/start-collapsed-setting.e2e.ts` `expectFolded(embed, false)` is a bare negated matcher → passes when element is GONE.
3. `e2e/obsidianHarness.ts:309-315` `readPersistedPluginData` throws on mid-write `data.json` under `expect.poll`.
4. `e2e/obsidianHarness.ts:129-138` STDOUT never drained (deadlock risk); stderr listener leak; bare `kill()` on launch-failure path.

Flow: straightforward-flow → EXPLORATION → IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION.

## Log

- [x] EXPLORATION_HARNESS + EXPLORATION_RUNTIME (both explorers lacked write tools; TOP_LEVEL_AGENT persisted their findings).
- [x] EXPLORATION_PUBLIC.md consolidated — recorded the ticket/tree drift.
- [x] IMPLEMENTATION_WITH_SELF_PLAN — commits `d57f4e3`, `503e624`.
- [x] IMPLEMENTATION_REVIEW — READY, 0 MUST-FIX, 4 OPTIONAL; independently adjudicated defect 2.
- [x] IMPLEMENTATION_ITERATION — commit `93fc209`; 2 optional accepted, 2 partial (rest filed).
- [x] change_log entry `rurxs2m76oyz56ucz7y064rbz` + ticket closed.

## Outcome

Converged in ONE review cycle (max 4). Defects 1, 3, 4 fixed as filed.

**Defect 2's premise was disproven**, twice and independently: Playwright 1.61.1's scalar
`not.toHaveClass(/re/)` FAILS on a zero-element locator (`matches: options.isNot` is the
fail-in-either-polarity sentinel, not a pass), and deleting `preventDefault`/`stopPropagation`
detaches nothing on Obsidian 1.12.7. The real find was that the ARRAY form
`not.toHaveClass([/re/])` DOES pass vacuously — now documented in `e2e/foldAssertions.ts`.

Suite 37/37 green, lint + build clean, tree clean.

Follow-ups filed: `nid_lgos6hbf2hvl2sp5jns0xgg5u_e` (preventDefault/stopPropagation measurably
UNCOVERED — flagged, not deleted), `nid_1oipd3ymnbsdlbql01h7hue4p_e`,
`nid_js55rt1e78e55nuj83xh2lg3h_e`, `nid_jbtcd5ty1u4urr7p01n4ngnuw_e`, plus the deferred
symmetric-cleanup chore.
