# Implementation Iteration — review feedback disposition

Review: `IMPLEMENTATION_REVIEW__PUBLIC.md` (APPROVED_WITH_MINORS, 0 blocker / 0 major).
All accepted findings fixed; rejected NIT confirmed rejected. Build, lint, and full e2e green.

## Per-finding disposition

| Finding | Disposition | What changed |
|---|---|---|
| MINOR-1 — key collision for same-note embeds in one section | FIXED | Occurrence index appended UNCONDITIONALLY to the fold key. |
| MINOR-2 — null-fallback lacks section discriminator | FIXED | Fallback locator now uses a stable djb2 content hash of the section. |
| MINOR-3 — MutationObserver not disconnected on unload | FIXED | Observers tracked in a Set; `disconnectAll()` called from `onunload`. |
| MINOR-4 — e2e proved the class, not hidden content | FIXED | Added visible-when-unfolded + hidden-when-folded assertions (non-tautological). |
| MINOR-5a — no test for independent same-note fold state | FIXED | New `twins.md` test: fold one, assert the other stays unfolded. |
| MINOR-5b — no test for heading/block-ref marker variants | FIXED | New `ref-*.md` test: `![[note#heading]]-` and `![[note#^block]]-` fold + dash stripped. |
| NIT-6 — separate eslint config for e2e | REJECTED (per coordinator) | `eslint.config.mts` left as-is; ignoring the Node harness from the obsidian PLUGIN ruleset is a legitimate 80/20 scoping. |

## Detail of fixes

**MINOR-1/2 (fold-state key).** New key shape:
`${sourcePath}::${locator}::${src}::#${indexWithinSection}` where
`locator = lineStart !== undefined ? "L"+lineStart : "S"+djb2(sectionText)`.
- Index appended unconditionally → two embeds of the same note on one line/section are independent.
- Index is stable across re-renders (a section always renders its embeds in the same DOM order).
- Null-`getSectionInfo` fallback now carries a section-distinguishing, re-render-stable content hash
  instead of a bare index. (`getSectionInfo` is reliable in reading mode, so this path is rare.)

**MINOR-3 (observer cleanup).** `FoldableEmbedsPostProcessor` holds `liveObservers: Set<MutationObserver>`;
`stopObserving()` disconnects + removes on title-ready or media detection, and `disconnectAll()`
disconnects any still-live observer (e.g. a never-resolving `![[missing]]`). `main.ts` stays
lifecycle-only: it keeps the processor reference and its `onunload()` just calls `disconnectAll()`.

**MINOR-4 (content actually hidden).** The unfolded test asserts
`.markdown-embed-content` first() `toBeVisible()`; the folded test asserts the SAME locator
`toBeHidden()`. Because the two assertions use the same selector with opposite expected results, a
wrong CSS target (e.g. hiding only the empty second div) would fail the folded assertion — not tautological.

**MINOR-5 (edge-case coverage).** Two new tests via `extraFixtures`:
- `twins.md` = `![[child]]` twice → fold #1, assert #2 unfolded (also exercises the MINOR-1 key fix).
- `ref-child.md` (heading `## Section A` + `^blockid` block) + `ref-parent.md`
  (`![[ref-child#Section A]]-`, `![[ref-child#^blockid]]-`) → both fold-by-default, dash stripped.

## Files changed this iteration
- `src/foldableEmbedsPostProcessor.ts` — unconditional index + `sectionHash` in key; `liveObservers`
  Set, `stopObserving`, `disconnectAll`.
- `src/main.ts` — holds processor ref; `onunload()` → `disconnectAll()`.
- `e2e/foldable-embeds.e2e.ts` — content visible/hidden assertions; twins + ref-variant fixtures & tests.

(No changes to `eslint.config.mts`, `styles.css`, `foldStateStore.ts`, `manifest.json`, docs.)

## Final results (this iteration)
```
npm run build   → exit 0 (clean)            (.tmp/iter-build.log)
npm run lint    → exit 0, 0 problems         (.tmp/iter-lint.log)
npm run test:e2e:
  Running 11 tests using 1 worker
  ✓ unmarked embed renders unfolded with its body visible
  ✓ `![[child]]-` renders folded, body hidden, no visible dash
  ✓ chevron is present and reflects fold state
  ✓ clicking the title folds, then unfolds
  ✓ fold state survives a reading -> editing -> reading round-trip
  ✓ strict-marker negative `![[child]]-x` stays unfolded with the dash visible
  ✓ two embeds of the SAME note fold independently
  ✓ heading- and block-ref `![[note#...]]-` fold by default with the dash stripped
  ✓ plugin instance is loaded in a real Obsidian
  ✓ plugin id is in Obsidian's enabled-plugins set
  ✓ opening the embedding fixture note makes it the active file
  11 passed                                  (.tmp/iter-e2e-full.log)
```

## Residual callouts
- None blocking. `minAppVersion` still `1.0.0` (`noUnsupportedApi` never flagged `setIcon`/`getSectionInfo`).
- e2e code remains unlinted by the obsidian ruleset (accepted trade-off from NIT-6 rejection).
