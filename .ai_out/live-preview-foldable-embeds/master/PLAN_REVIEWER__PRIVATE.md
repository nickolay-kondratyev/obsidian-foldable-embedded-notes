# PLAN_REVIEWER private memory (rehydration)

## State
Review COMPLETE. Wrote `DETAILED_PLAN_REVIEW__PUBLIC.md`. Verdict: PLAN_ITERATION: REQUIRED.
Counts: 1 BLOCKING, 4 MAJOR, 7 MINOR (2 of the MINORs are explicit ACCEPTs of the flagged additions).

## What I read
- `DETAILED_PLANNING__PUBLIC.md` (full), ticket `_tickets/implement-live-preview-foldable-embeds-cm6.md`,
  `EXPLORATION_PUBLIC.md`, `prototype/livePreviewFoldPrototype.ts`, `prototype/probe-live-preview.e2e.ts`.
- `src/foldableEmbedsPostProcessor.ts`, `src/main.ts`, `src/foldStateStore.ts` (skim), `styles.css`,
  `e2e/foldable-embeds.e2e.ts`, `e2e/obsidianHarness.ts`, `e2e/playwright.config.ts`,
  `package.json`, `esbuild.config.mjs`, `.dev-vault/parent.md`.

## Independently verified facts
- `node_modules/obsidian` = 1.12.3; peerDependencies `@codemirror/state@6.5.0`, `@codemirror/view@6.38.6`;
  both present in `node_modules/@codemirror/`. Already externalised in `esbuild.config.mjs`. → §3.8 accurate.
- `editorLivePreviewField` IS public: `node_modules/obsidian/obsidian.d.ts:2485`. → §3.6 accurate.
- Reading-mode post-processor observes `attributes: true, attributeFilter: ["class"]`
  (foldableEmbedsPostProcessor.ts:177-182) because `.markdown-embed` class arrives LATE → basis of F3.
- Reading-mode listener comment "lives and dies with this freshly-created title element" (lines 79-81)
  → does NOT hold in LP where Obsidian reuses widget DOM → basis of F1.
- `e2e/playwright.config.ts`: workers:1, fullyParallel:false → no vault-copy race between the two suites.
- `ObsidianHarness.prepareVaultCopy` wipes+recopies `.dev-vault` per launch → test 9's `setConfig`
  cannot leak across runs. (I initially suspected leakage; it is a non-issue.)
- Harness currently has only openFile / runCommand / setMarkdownViewMode / setTheme → no cursor/edit
  helpers → basis of F5.

## Findings (short form)
- F1 BLOCKING — no `destroy()` teardown. LP widget DOM survives unload; stale listener + on re-enable
  `ensureChevron` finds leftover chevron so click handler is never re-attached → dead chevrons.
  Fix: teardown classes+chevron+listener (AbortController signal is the 3-line version).
- F2 MAJOR — `toggle()` must use effective fold (`explicit ?? marker`); plan says "read from CM state"
  which, if read as explicit-only, makes the first click on a marked embed a no-op. Extract one
  `effectiveFold(state, lineFrom)` used by sync + toggle. Add test: first click on marked embed unfolds.
- F3 MAJOR — dropping per-embed observers also drops the late `.markdown-embed` CLASS wait (attribute
  mutation, deliberately unobserved). Fix: select `.internal-embed` and gate on title presence
  (title ⇒ note embed; media embeds never get a title). Do NOT observe attributes (R2 loop).
- F4 MAJOR — R7's `MapMode.TrackDel` is the wrong lever for insert-at-line-start. Use LINE-RANGE
  read/write (`between(line.from, line.to)` / filter over the line) — matches the per-line semantics.
- F5 MAJOR — harness needs setCursor/replaceRange (tests 4/6/7); plan's own "one bridge" rationale.
  Also specify `expect.poll` for `.cm-line` textContent assertions (probe used setTimeout(400)).
- F6 MINOR — full-doc `findMarkedEmbedLines` scan on every selection change AND every sync; cache in a
  StateField recomputed on docChanged.
- F7 MINOR — drop single-caller `isFoldable`/`isFolded` from EmbedFoldDom.
- F8 MINOR — mid-paragraph embed rendering in LP never prototype-verified (test 5 fixture risk).
- F9 ACCEPT — editorLivePreviewField guard. F10 ACCEPT — deferring unit harness.
- F11 MINOR — DOM writes inside update(); fallback is requestMeasure, never a timer.
- F12 MINOR — `.markdown-reading-view` scoping IS sufficient (all locators derive from foldableEmbeds()).

## Positions I would defend under pushback
- F1 is genuinely blocking: the plan states "nothing else to clean up", which is wrong, and the
  failure mode (dead chevrons after plugin update/reload) is user-visible.
- F3: the plan presents a simplification as strictly better; it silently removes a hedge the reading
  mode module needed. The `.internal-embed` + title-gate fix keeps the simplification AND is correct.
- The embedFoldDom extraction decision itself is CORRECT — do not let iteration undo it.

## Inline edits I made to the plan
- §3.8 only: annotated CodeMirror pinned versions as verified against node_modules/obsidian 1.12.3.

## AC coverage
All 8 ACs mapped to concrete tests/checks; no unmapped AC. No scope violation of the settled
"Scope (KISS)" section.

---

## Convergence check round 1 (state: COMPLETE)

Verdict: **PLAN_REVIEWER: READY**. All 12 findings RESOLVED in `DETAILED_PLANNING__PUBLIC.md` rev 2
text (verified against the plan body, not the disposition table). Zero NOT-RESOLVED.

Key verifications made:
- F1: §3.5 has AbortController + `wiredTitles` WeakSet + `unmark` loop in `destroy()`; §3.7's
  "nothing to clean up" claim removed; R11 + test 10 added. The chevron/wired conflation is now
  structurally impossible.
- F4: §3.4 shows the actual line-range filter code; R7 explicitly retracts `MapMode.TrackDel`.
- Test renumbering (9 → 11 tests) does NOT drop any AC; tests 4, 8, 10 are net additions.

Rejected sub-options judged SOUND (I would defend each):
- AbortController > WeakMap-of-removers (WeakSet still carries the "is wired" fact).
- Three named harness methods > generic `withActiveEditor` (a typed escape hatch leaks `app as any`
  back into specs) — better than my own original suggestion.
- `unmark()` added despite one caller: criterion is duplicated KNOWLEDGE (must co-change with
  markFoldable/ensureChevron), not caller count. No contradiction with dropping isFoldable/isFolded,
  which had no such coupling.

Deliberately NOT raised as findings (trivia, implementer-level naming, would be nitpicking):
- §3.4 references `isMarkedLine` which §3.3 does not name as an export.
- §3.2's constants table omits the chevron / `is-collapsed` class names that `unmark` needs.
Both are recorded in the public doc as explicit non-findings so nobody re-opens iteration for them.

Complexity delta accepted: ~20 lines added, one selector condition + two predicates + one doc scan
removed; no new module, interface, layer or dependency. Ticket "Scope (KISS)" untouched.

If pushed further: do NOT re-open iteration. The plan is implementable; remaining unknowns
(mid-paragraph widget rendering, test 10 reload flake) are correctly handled as probe-first /
report-and-downgrade instructions inside the plan rather than as plan defects.
