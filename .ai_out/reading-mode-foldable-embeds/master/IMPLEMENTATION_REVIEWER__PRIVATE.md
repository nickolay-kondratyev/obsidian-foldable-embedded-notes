# IMPLEMENTATION_REVIEWER — private memory (rehydration)

## Context
Reviewed impl commit `aa47b61` (HEAD). Parent `15bd6a4`. Ticket:
`_tickets/reading-mode-foldable-embeds-with-x-fold-by-default-syntax.md`.
Diff base per task said `da579bc..HEAD` but real feature commit is `aa47b61`.

## Commands run + results
- `npm run build` → exit 0 (tsc -noEmit + esbuild). Clean.
- `npm run lint` → exit 0, 0 problems.
- `npm run test:e2e` → exit 0, 9/9 passed (6 foldable + 3 hello-world). Headless Obsidian 1.12.7.
- Lint-red baseline verification: `npx eslint --config <da579bc eslint.config.mts> e2e/ src/`
  → exit 1, 67 problems (41 errors). Errors are obsidianmd plugin ruleset (no-unsafe-*,
  no-explicit-any, node: imports, Buffer, prefer-window-timers) hitting the Node Playwright
  harness. CONFIRMS implementer's "master lint red (34 errors)" claim in spirit. The e2e
  harness legitimately needs `window.app as any` + node: imports. Ignoring e2e from the
  PLUGIN ruleset is defensible.
- `grep innerHTML|outerHTML|require(|node:|eval|fetch` in src/ → NONE. Clean/mobile-safe.
- manifest: isDesktopOnly=false, minAppVersion 1.0.0 (setIcon/getSectionInfo available at 1.0.0).
- Follow-up tickets exist: commands-fold-all-expand-all..., explore-foldable-embeds-in-live-preview...

## Files inspected
main.ts (lifecycle-only, 15 lines, good), foldStateStore.ts (clean Map wrapper),
foldableEmbedsPostProcessor.ts (173 lines, the feature), styles.css (class-driven, no inline),
e2e/foldable-embeds.e2e.ts (6 serial tests), e2e/obsidianHarness.ts (added setMarkdownViewMode),
eslint.config.mts (widened ignores), README.md (limitations documented), settings.ts deleted.

## Key reasoning / findings
- Strict marker parse (stripFoldMarker) is structural (no regex lookbehind) → mobile-safe. EOL
  and space-followed cases handled. `![[x]]-like` preserved. Verified by e2e negative test.
- store.get(key) ?? foldedByDefault → store wins over syntax. Correct. Re-render re-strips dash
  from fresh DOM each time (source re-rendered), so idempotent.
- buildKey = `sourcePath::L<lineStart>|i<index>::src`. FOLLOWS TICKET FORMULA EXACTLY (ticket
  says use lineStart, fall back to occurrence index only when section info null). BUT: two
  same-note embeds sharing one section (same line, or consecutive lines in one paragraph) →
  same lineStart + same src → KEY COLLISION → shared fold state. Ticket edge case wants
  independent state. Cheap fix: append indexWithinSection unconditionally (stable across
  re-renders since section renders embeds in same order). MINOR (ticket-faithful, low freq;
  dev-vault fixture separates embeds with blank lines so not triggered).
- Null-fallback `i<index>` lacks section discriminator → cross-section collision possible if
  getSectionInfo null. Rare. MINOR.
- MutationObserver: disconnects on title-ready or media detection. For NEVER-resolving embeds
  (broken `![[missing]]`) observer stays until DOM GC; not tracked for onunload disconnect.
  Bounded, MINOR vs CLAUDE.md explicit-cleanup preference.
- CSS `.fen-folded > .markdown-embed-content{display:none}` hides BOTH content divs (child
  combinator). Prototype-validated (fact #4). e2e only asserts CLASS, not actual hidden state.
- Title click: preventDefault+stopPropagation suppresses navigation. Listener on fresh title
  node, no explicit dereg (justified).

## Verdict: APPROVED_WITH_MINORS. 0 BLOCKER, 0 MAJOR. All green reproduced.
