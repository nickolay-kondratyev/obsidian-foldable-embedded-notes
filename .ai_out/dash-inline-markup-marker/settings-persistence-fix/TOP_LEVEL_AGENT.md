# TOP_LEVEL_AGENT — dash-inline-markup-marker

Ticket: `nid_7ge9y22j5luopjsposmfoi718_e` — Reading mode: a dash glued to inline markup
(`![[x]]-**bold**`) wrongly arms the fold marker. **CLOSED.**

Flow: straightforward-flow. CONVERGED in 1 review round (0 blocking, 2 should-fix, both
incorporated).

## Log

- [x] EXPLORATION → `EXPLORATION_PUBLIC.md` (commit `2ca396f`)
- [x] IMPLEMENTATION_WITH_SELF_PLAN → commit `39501ab`
- [x] IMPLEMENTATION_REVIEW → `IMPLEMENTATION_REVIEW__PUBLIC.md` (commit `0d36a5e`)
- [x] IMPLEMENTATION_ITERATION → commit `af1d63c`; reviewer round 2 = READY
- [x] change_log `j0lmtlv4pci88q54navmva6q7`; ticket closed; CLAUDE.md bullet de-tangled

## Follow-up tickets created

- `nid_3axo1iklky5s5n9us7947nr4i_e` — `**![[x]]-** tail` (wrapped embed) still loses its dash.
- `nid_sos38zx0quvy2ec2j5seqsh7e_e` — cross-mode contract for `![[x]]- tail`.

Reviewer's third suggestion (a dedicated ``![[x]]-`code` `` e2e) was NOT taken: it exercises
the same branch as the `**bold**` case, so it buys coverage the suite already has.

## Verification (re-run independently by the reviewer, not just claimed)

`npm run lint` EXIT=0 (1 pre-existing warning), `npm run build` EXIT=0, full e2e EXIT=0 /
46 passed. New tests mutation-proved to fail without their respective src clauses.
