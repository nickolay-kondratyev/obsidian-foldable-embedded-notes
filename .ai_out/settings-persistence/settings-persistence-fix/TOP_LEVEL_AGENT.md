# TOP_LEVEL_AGENT — settings persistence fix

Ticket: nid_rbh5zfj0mlvuo1hi2trl8fxli_e (priority 1, bug)
Branch: settings-persistence-fix (off master)
Feature dir: .ai_out/settings-persistence/settings-persistence-fix/

## Flow (straightforward-flow)
- [x] EXPLORATION (Explore, sonnet) -> EXPLORATION_PUBLIC.md
- [ ] IMPLEMENTATION_WITH_SELF_PLAN -> IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md
- [ ] IMPLEMENTATION_REVIEW -> IMPLEMENTATION_REVIEW__PUBLIC.md
- [ ] IMPLEMENTATION_ITERATION -> IMPLEMENTATION_ITERATION__PUBLIC.md
- [ ] change_log entry + ticket close (TOP_LEVEL_AGENT only)

## Scope (from ticket)
1. Serialize saves in the store (chained promise), await so failures still surface to the settings tab Notice.
2. Retain raw persisted object; save `{ ...raw, startCollapsed }` so unknown data.json keys round-trip.
   parseSettings stays the strict READ path.

## Acceptance
- Rapid toggling leaves data.json agreeing with final UI state.
- Hand-added extra key survives a toggle.
- lint, build, full e2e green.
