# TOP_LEVEL_AGENT — reading-mode fold key (nid_7qbtubxk89team9oadnl3hanr_e)

Ticket: reading-mode fold key embeds the raw source LINE, so an edit ABOVE an embed
loses the fold or hands it to a DIFFERENT embed.

Branch: `settings-persistence-fix`. Feature dir: `.ai_out/reading-mode-fold-key/settings-persistence-fix/`.

Flow: EXPLORE → IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION.

## Constraints carried into the flow

- Key shape must COMPOSE with the two linked tickets (do NOT fix them here):
  - `nid_zqaxj18jbxwnazzz8aeggz91u_e` nested embeds share ONE key.
  - `nid_z4jq8me8mhstojozeua8fufdr_e` later embed inherits a deleted embed's key
    (a subset of this ticket; likely resolved by the same change — verify, then close).
- 80/20 fallback explicitly allowed by the ticket: keep the line key but FIX THE DOC and
  pin the real behaviour with an e2e. Do not leave the overstated "stable" comment either way.

## Log

- [x] Ticket set in_progress.
- [x] EXPLORATION_SRC + EXPLORATION_E2E done. NOTE: the `Explore` agent type is READ-ONLY —
      it cannot write its own PUBLIC file; TOP_LEVEL_AGENT persisted both results verbatim
      (`EXPLORATION_SRC_PUBLIC.md`, `EXPLORATION_E2E_PUBLIC.md`).
      Headlines carried forward: no `app` reference in the post-processor today (needs a narrow
      injected port); no unit-test runner exists (e2e is the only vehicle); an occurrence-ordinal
      key does NOT by itself fix `nid_z4jq…` (deleting an earlier same-`src` embed).
- [x] IMPLEMENTATION_WITH_SELF_PLAN — occurrence key behind a narrow `ReadEmbeds` port,
      failing-first e2e (`e2e/reading-mode-fold-key.e2e.ts`).
- [x] IMPLEMENTATION_REVIEW — 1 BLOCKING (cold vault index = a REGRESSION vs the cache-independent
      line key, papered over in the harness) + 5 SHOULD-FIX + 4 NIT.
- [x] IMPLEMENTATION_ITERATION (1 round) — blocking issue fixed IN THE PRODUCT via a superseded-key
      handoff (`EmbedFoldKey.superseded` + `FoldStateStore.adoptRecordingOf`), harness wait reverted,
      10/10 findings incorporated. Verification pass: READY, 0 blocking; revert of the handoff proved
      the guarding test red 4-of-8 runs. Lint/build clean, full e2e 49 passed over repeated runs.
- [x] change_log `dj7trad66j688g871sge5vflw`; ticket `nid_7qbtubxk89team9oadnl3hanr_e` CLOSED.

## Left open deliberately

- `nid_zf4num1ja4c9tpwpgj672ijgn_e` (cold-index fold loss) — acceptance criterion is MET by the
  handoff and verified; the implementer left it open for the human to confirm the close.
- `nid_z4jq8me8mhstojozeua8fufdr_e` (deleting an earlier same-`src` embed still shifts the ordinal)
  and `nid_zqaxj18jbxwnazzz8aeggz91u_e` (nested embeds share one key) — out of scope by design; the
  new key shape composes with both.
