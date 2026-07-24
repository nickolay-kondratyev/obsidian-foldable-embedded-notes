# IMPLEMENTATION_REVIEWER__PRIVATE — default-collapsed setting

Memory for a future clone of this role. Public output: `IMPLEMENTATION_REVIEW__PUBLIC.md`.

- **Iteration 0** — reviewed `3f21c9d` vs `5efa23b`. Verdict NOT-READY (2 BLOCKING).
- **Iteration 1** — reviewed `8d1caf9` vs `3f21c9d` (fresh clone). Verdict **READY**. See the
  section at the bottom of this file; everything above it is iteration-0 memory and still accurate.

## State at exit
- Working tree CLEAN, my two `.ai_out/...` files committed. `src/` and `e2e/` untouched by me.
- Logs I produced (gitignored `.tmp/`): `rev-lint.log`, `rev-build.log`, `rev-e2e-full.log`,
  `rev-e2e-mutant.log`, `rev-e2e-restored.log`, `rev-probe.log`.

## Gate results (all reproduced the implementer's claims — no dishonesty in the numbers)
- `npm run lint` exit 0, 0 errors / 1 warning (`prefer-setting-definitions`, ticketed, correct
  to defer at `minAppVersion 1.0.0`).
- `npm run build` exit 0. `npm run test:e2e` exit 0, **31 passed** (~5 s; the suite is fast,
  do not be afraid to re-run it).
- No `sanity_check.sh` in this repo.

## How to run things here (saves a future clone 10 minutes)
- e2e needs nothing pre-installed: `scripts/run-e2e.sh` auto-downloads pinned Obsidian, seeds
  `.dev-vault`, type-checks `e2e/tsconfig.json`, then runs Playwright. Single spec:
  `npm run test:e2e -- <file>.e2e.ts`.
- Vault copy used by tests: `.tmp/e2e/vault` (wiped per `launch()`, NOT per `relaunch()`).
  Post-run `.tmp/e2e/vault/.obsidian/plugins/foldable-embedded-notes/data.json` is real evidence:
  2-space pretty-printed ⇒ written by Obsidian `saveData`; compact one-line ⇒ still the harness
  fixture. This distinction is how I proved the write path works despite no test covering it.
- Probe technique that worked: drop a throwaway `e2e/zz-scratch-*.e2e.ts`, run it, `console.log`
  a `PROBE_RESULT ...` line, then `rm` and confirm `git status --porcelain` is empty.

## The two BLOCKING findings and how I proved them
1. **Live Preview dead first click** (`livePreviewFoldExtension.ts:85-95`). `toggle()` inverts the
   recomputed effective state while the DOM shows the stale projection, so the first click after
   flipping the setting in an open pane dispatches a no-op. Probe output:
   `afterToggle=[false] afterFirstClick=[false] afterSecondClick=[true]`. Reading mode is immune
   (it inverts the DOM class). Fix proposed: invert `embed.classList.contains(CLS_FOLDED)`.
   NOT covered by the "next render is enough" clarification — that decision is about re-folding.
2. **Persistence test cannot fail.** Seed is `{"startCollapsed":true}` and the restart test asserts
   the SAME value, so a no-op `saveData` still passes. Proved by mutating
   `foldableEmbedsSettingsStore.ts:39` to a no-op → 8/8 still green, then `git checkout --` and
   re-ran green. The spec header at `:5-16` explicitly claims it proves write-through — that
   overclaim is the real problem.

## Judgement calls I made (re-litigate only with reason)
- Kept BLOCKING-1 blocking even though "no live re-application" is a stated non-goal: an inert
  click is not the same as a stale render, and the flow that triggers it is the feature's own
  first-run path. Offered the human an explicit accept-and-document alternative instead of
  pretending it must be fixed.
- Did NOT flag as issues: the two-sentence `desc` (the second sentence is load-bearing POLS
  info), the `any` casts in `e2e/obsidianHarness.ts` (pre-existing house pattern, e2e-only,
  `app.setting` is not in public typings), the absence of unit tests (no runner in repo, already
  ticketed), the lint warning (correctly ticketed).
- The two independent fold pipelines sharing only `foldedByDefault` is the RIGHT DRY call here —
  CLAUDE.md explicitly documents that the modes share no readiness/identity/parsing logic. Do not
  push a merge of the pipelines.

## Things I verified so a clone need not redo them
- Truth table correct in both modes; `![[x]]-` semantics untouched; default-OFF path still covered
  by the two pre-existing specs (harness deletes `data.json` on every fresh launch).
- No behaviour test removed/renamed/weakened: the diff only ADDS two methods to
  `obsidianHarness.ts`; `foldable-embeds.e2e.ts` and `live-preview-foldable-embeds.e2e.ts` are
  byte-identical.
- No scope creep: no `Compartment`, no `+` marker, no live re-application, no unit runner.
- `main.ts` still lifecycle-only; zero `any` in `src/`; defaults typed exactly once.
- `obsidian-settings` skill checklist: fully compliant for a single-row tab.

---

## ITERATION 1 (`8d1caf9`) — verdict READY

### State at exit
- Working tree CLEAN. Only my two `.ai_out/...` files committed. `src/` and `e2e/` untouched
  (two temporary mutations, both `git checkout --`'d and verified).
- My logs (gitignored `.tmp/`): `rev2-lint.log`, `rev2-build.log`, `rev2-e2e-full.log`,
  `rev2-e2e-mutant-b1.log`, `rev2-e2e-mutant-b2.log`, `rev2-e2e-restored.log`.

### What I actually did (the method that works — reuse it)
Do NOT read the implementer's falsifiability table and nod. Re-apply the mutants yourself; it
costs ~35 s per spec run. Both mutants are one-liners:
- B1: `livePreviewFoldExtension.ts:98` `!EmbedFoldDom.isFolded(embed)` →
  `!effectiveFold(this.view.state, lineFrom, this.readSettings())` ⇒ test `:209` RED (9 passed).
- B2: delete `await this.persistence.saveData(this.current)` from
  `foldableEmbedsSettingsStore.ts` ⇒ test `:202` RED (8 passed). This is the SAME mutant that
  survived in iteration 0 — that is the proof the gap is closed, not just papered over.
Both restored ⇒ full suite 34/34.

### Gates (all reproduce the implementer's claims — again, no dishonesty in the numbers)
lint exit 0 / 0 errors / 1 unchanged ticketed warning; build exit 0; e2e exit 0, **34 passed**
(~5 s). `package.json` untouched ⇒ no unit runner smuggled in.

### Judgement calls (iteration 1)
- Accepted the B1 fix as ROOT, not a patch: the operand question ("what should render" vs
  "what the user is looking at") is genuinely the bug, and lifting it into
  `EmbedFoldDom.isFolded` made reading mode and Live Preview share the one named predicate.
  Do not re-litigate this into "state must always be the operand" — it must not.
- Did NOT block on two residuals, and said so explicitly in the public file: (a) the
  `parseSettings` non-boolean branch is untested, (b) test `:209` could go vacuous if a future
  Obsidian re-syncs the pane between the flip and the click. Both are follow-up material, not
  ship-blockers — I proved `:209` falsifiable TODAY, which is the standard that applies.
- Noted but did not flag: `parseSettings` drops unknown `data.json` keys where the old spread
  kept them. Harmless at one setting; remember it if a downgrade path ever matters.
- The declined unit test for `parseSettings` is a correct 80/20 call (no runner in repo,
  pre-existing ticket). Do not push it.

### Trap to avoid if a future iteration touches `toggle()`
The click listener is wired BEFORE `applyFoldState` inside the same `sync()` iteration
(`livePreviewFoldExtension.ts:65-83`), which is what makes "invert the DOM class" safe — no click
can reach an element the plugin has not projected onto yet. If anyone reorders `sync()`, that
safety argument dies and B1 comes back in the mirror direction.
