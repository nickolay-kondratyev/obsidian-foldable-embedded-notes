# TOP_LEVEL_AGENT — live-preview-trailing-space-marker

Ticket: `nid_drtkfuu5gijr9qjec5tj2o2yh_e` — "Live Preview: fold marker inert with a trailing space".
Branch: `settings-persistence-fix`. Base commit: `41bed39` (clean tree).
Flow: straightforward — IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION.

## Log

- **EXPLORATION** — done. The Explore agent had no write tool, so TOP_LEVEL_AGENT persisted its
  findings to `EXPLORATION_PUBLIC.md`. Headline: no unit-test runner exists in the repo (Playwright
  e2e only); `markedEmbedLinesField` is the single source of truth for both fold-by-default and
  dash-hiding on the Live Preview side; reading mode strips only the dash and preserves trailing
  whitespace.
  - Orchestrator decision: do NOT introduce vitest/jest in this bug fix — cover via e2e, per the
    ticket's own acceptance criteria. Follow-up ticket if the implementer feels strongly.
- **IMPLEMENTATION_WITH_SELF_PLAN** — done, commit `eebd621`. Regex tolerates `[ \t]*` after the
  dash; `dashFrom` from the dash's real index; replace still covers exactly the dash (aligned with
  reading mode, which preserves trailing whitespace). Red-before-green e2e. Full suite 40 passed.
- **IMPLEMENTATION_REVIEW** — done, commit `e9fe157`. Verdict READY, 0 blocking, 2 SHOULD-FIX (both
  e2e test-robustness). Reviewer independently disproved the `lastIndexOf` concern.
- **IMPLEMENTATION_ITERATION** — done, commit `9a4fd0e`. Both SHOULD-FIX accepted (ambiguous line
  lookup now throws; duplicated `.cm-line` guard extracted). One NIT rejected with rationale.
  Converged in ONE iteration. Full suite 40 passed.

## Closed out

- Ticket `nid_drtkfuu5gijr9qjec5tj2o2yh_e` — resolution noted, closed.
- Follow-up filed: `nid_ktx90omxm6sqotiude6iliwjn_e` (indented `- ![[x]]-` folds in reading mode but
  not Live Preview).
- change_log entry `6hvvnjkc5hno6d8q30vdafloa`.
