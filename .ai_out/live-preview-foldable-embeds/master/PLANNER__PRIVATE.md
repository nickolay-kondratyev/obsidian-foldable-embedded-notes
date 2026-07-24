# PLANNER private memory — live-preview-foldable-embeds (master)

Phase: DETAILED_PLANNING → PLAN_ITERATION round 1 → DONE. `PLANNER: READY`.
Deliverables (same dir): `DETAILED_PLANNING__PUBLIC.md` (**rev 2**, single authoritative plan),
`PLAN_ITERATION__PUBLIC.md` (disposition table), this file.
No `#QUESTION_FOR_HUMAN` raised. Nothing outside `.ai_out/…/master/` was written.

## What I read (all of it)

Round 0: ticket `_tickets/implement-live-preview-foldable-embeds-cm6.md`; `EXPLORATION_PUBLIC.md`;
`prototype/livePreviewFoldPrototype.ts` + `prototype/probe-live-preview.e2e.ts`;
`src/main.ts`, `src/foldableEmbedsPostProcessor.ts`, `src/foldStateStore.ts`, `styles.css`;
`e2e/obsidianHarness.ts`, `e2e/foldable-embeds.e2e.ts`, `e2e/playwright.config.ts`;
`eslint.config.mts`, `tsconfig.json`, `esbuild.config.mjs`, `package.json`,
`scripts/run-e2e.sh`, `scripts/setup-dev-vault.sh`, `.dev-vault/*.md`, `README.md`, `CLAUDE.md`.
Round 1: `DETAILED_PLAN_REVIEW__PUBLIC.md` + re-verified `foldableEmbedsPostProcessor.ts`,
`prototype/livePreviewFoldPrototype.ts`, `e2e/obsidianHarness.ts`, `src/main.ts`.

## Facts verified (do not re-derive)

- `editorLivePreviewField: StateField<boolean>` IS public — `node_modules/obsidian/obsidian.d.ts:2485`.
- `@codemirror/state@6.5.0` + `@codemirror/view@6.38.6` = obsidian peerDeps, present in
  `node_modules`, already in the esbuild `external` list; NOT in our `package.json`.
- `npm run lint` currently CLEAN; eslint `globalIgnores` covers `.ai_out` and `e2e`.
- `foldableEmbedsPostProcessor.ts:177-182` observes `attributeFilter: ["class"]` — proof that
  `markdown-embed` arrives as an ATTRIBUTE mutation (this is what killed rev 1's
  `.internal-embed.markdown-embed` selector; see F3).
- `foldableEmbedsPostProcessor.ts:79-81` — reading mode's "listener dies with the title element"
  comment. It does NOT transfer to LP (Obsidian owns and reuses the LP embed DOM) — F1.
- `e2e/obsidianHarness.ts:350-361` already uses `app.plugins.setEnable/enablePlugin` → a
  `reloadPlugin()` helper is ~5 lines, which is why F1 got a real e2e test, not a manual check.
- e2e: `workers: 1`, `fullyParallel: false`; each spec launches its own Obsidian in `beforeAll`;
  fixtures layered via `ObsidianHarness.launch({ extraFixtures })`; vault re-copied per launch.
- `.dev-vault/parent.md` contains the code-span false-positive line; whole-line regex won't match it.

## Decisions I own (defend these)

1. Extract ONLY `src/embedFoldDom.ts` (DOM contract), NOT the readiness observer. Reviewer ACCEPTED
   the call; F3 tightened the readiness condition to "title present", which made it simpler still.
2. Rejected `FoldableEmbedController` + `FoldStateSource` — incompatible lifecycles and identities.
3. Three LP files under `src/livePreview/`: `markedEmbedLines.ts` → `foldStateField.ts` →
   `livePreviewFoldExtension.ts` (one-way dep, no cycles).
4. `effectiveFold(state, lineFrom)` lives in `foldStateField.ts` (the state module owns "what is the
   fold state") and imports `markedEmbedLinesField`. Both `sync()` and `toggle()` call it — F2.
5. Fold state read/written by LINE RANGE (`between(line.from, line.to)`), not exact position — F4.
   `MapMode.TrackDel` (rev 1) was wrong: it governs deletion, not insertion assoc.
6. `markedEmbedLinesField` StateField caches the scan behind `docChanged` — F6.
7. Teardown: `AbortController` for listeners + `EmbedFoldDom.unmark()` + per-view
   `WeakSet<HTMLElement> wiredTitles` so "has chevron" ≠ "is wired" — F1.
8. `EmbedFoldDom` members: constants, `markFoldable`, `ensureChevron`, `applyFoldState`,
   `onTitleClick(title, cb, options?)`, `unmark`. Dropped `isFoldable`/`isFolded` (F7).
   `unmark` kept despite ONE caller — it is the inverse of the injection, i.e. duplicated
   knowledge; caller count is not the extraction criterion.
9. `editorLivePreviewField` guard (§3.6) — deliberate addition beyond ticket text; reviewer
   ACCEPTED (F9). Droppable in isolation if a human objects.
10. `@codemirror/*` → devDependencies; move to `dependencies` only if lint demands. Never a disable.
11. No unit-test framework this ticket (F10 accepted); follow-up ticket names
    `findMarkedEmbedLines`, `effectiveFold`, the line-range field update.
12. Marker char `-` stays duplicated (regex literal vs `FOLD_MARKER`) with a WHY-NOT comment.

## Test suite shape (11 tests, `e2e/live-preview-foldable-embeds.e2e.ts`)

1 baseline unmarked · 2 click folds/unfolds · 3 marked folded + dash hidden · 4 FIRST click on
marked UNFOLDS (F2 guard) · 5 cursor reveals/hides dash · 6 mid-paragraph (PROBE FIRST — F8) ·
7 fold survives edit elsewhere · 8 typing at line start keeps fold (F4/R7 guard) · 9 code-span line ·
10 `reloadPlugin()` then click still folds (F1 guard, second-to-last) · 11 `livePreview=false`
literal dash (last). Harness additions: `setLivePreviewEnabled`, `setCursor`, `replaceRange`,
`reloadPlugin`. No fixed sleeps ever; `.cm-line` text via `expect.poll` over `page.evaluate`.

## Commit plan

A: e2e `.markdown-reading-view` scoping (green BEFORE the feature) → B: extract `embedFoldDom.ts`
(pure refactor; reading suite is the proof; `unmark` lands unused here) → C: LP feature — probe test
6, author the spec and watch it fail, then implement, commit spec+impl together → D: README +
CLAUDE.md → E: change_log, close ticket, create unit-harness follow-up ticket.

## Watch-list for later phases

- Test 6 fixture: does a mid-paragraph `![[x]]-` render a widget in LP at all? Unverified.
- Test 10 (plugin reload) may flake → REPORT and downgrade to a documented manual check, never
  delete silently, never add a sleep.
- Test 11 mutates app config → keep last.
- R12: DOM writes inside `update()` — if CM warns, use `view.requestMeasure({ write })`, not a timer.
