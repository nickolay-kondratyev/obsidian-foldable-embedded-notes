# IMPLEMENTATION (self-plan) — reading-mode foldable embeds

## Goal
Reading-mode `![[note]]` embeds foldable via native title bar + rotating setIcon chevron;
`![[note]]-` (STRICT marker) folded by default with dash hidden; session-only fold store.

## Plan / checklist
1. [ ] `src/foldStateStore.ts` — session Map<string,boolean>. get/set only.
2. [ ] `src/foldableEmbedsPostProcessor.ts` — class, injected store; process(el,ctx).
   - whenMarkdownEmbedReady (handles ASYNC embed load via MutationObserver; media never fires).
   - strict marker strip on nextSibling text node (text[0]==='-' AND after is ws/EOL).
   - key = sourcePath::L<lineStart>|i<idx>::src.  store.get() ?? markerDefault.
   - chevron via title.createSpan({prepend}) + setIcon(right-triangle).
   - click on title: preventDefault+stopPropagation, toggle fen-folded + is-collapsed, store.set.
3. [ ] `src/main.ts` — strip ALL sample scaffolding; onload registers postprocessor only.
4. [ ] DELETE `src/settings.ts`.
5. [ ] `styles.css` — fold CSS.
6. [ ] harness: add setMarkdownViewMode("preview"|"source").
7. [ ] `e2e/foldable-embeds.e2e.ts` — 6 tests.
8. [ ] build + lint + e2e green. Bump minAppVersion if noUnsupportedApi flags.
9. [ ] docs (README/CLAUDE) succinct.

## Key decisions / gotchas
- ASYNC embed load: at postprocess time `.internal-embed` exists but `.markdown-embed`
  class + title load async. So use MutationObserver on the span until markdown-embed+title
  ready. Sync path taken when already loaded. Media embeds never get markdown-embed → their
  observer is an isolated GC-able cycle when DOM detaches (no leak).
- Click listener attached to freshly-created title element (lives/dies with DOM) → plain
  addEventListener, no register* needed (no leak). CLAUDE register* rule is for things needing
  cleanup; this doesn't.
- Marker strip: set sibling.textContent = afterMarker (removes only the dash, keeps rest).
- Guard re-processing with CLS_FOLDABLE check.

## Commands
- build: `npm run build`  (tsc -noEmit + esbuild)
- lint:  `npm run lint`
- e2e:   `npm run test:e2e -- foldable-embeds.e2e.ts` (logs to .tmp/)

## Status: DONE — build+lint+e2e all GREEN

## Verified gotchas (real Obsidian 1.12.7)
- setViewState shape that works: `{ ...vs, state: { ...vs.state, mode: "preview"|"source" } }`
  on `app.workspace.getLeaf(false)`. Added as `harness.setMarkdownViewMode()`.
- Marker text node: my strict `text.startsWith("-")` + `after is ws/EOL` logic matches real
  render — e2e test 2 (marked → stripped, sibling not `^-`) and test 6 (`![[child]]-x` →
  sibling `^-x` preserved, not folded) both pass. No leading-newline surprise in marker case.
- minAppVersion: `noUnsupportedApi` did NOT flag `setIcon`/`getSectionInfo` at 1.0.0, so NO
  bump needed. manifest.json / versions.json UNTOUCHED.
- Async embed load: MutationObserver path is robust; in practice embeds resolve fast (tests
  green). `.markdown-embed` class gating naturally skips media embeds.
- PRE-EXISTING lint breakage: master baseline `npm run lint` already failed (34 errors) on
  e2e/*.ts (`no-unsafe-*` on the intentional `window.app as any` bridge + `node:` imports) and
  on nested build-artifact `main.js` files. Root cause: eslint globalIgnores never mirrored
  .gitignore and the obsidian plugin ruleset was applied to Node test tooling. Fixed by adding
  `**/main.js`, `.tmp`, `.dev-vault`, `e2e` to globalIgnores in eslint.config.mts. Lint now 0.

## Final results
- `npm run build` → exit 0 (.tmp/impl-build.log)
- `npm run lint`  → exit 0, 0 problems (.tmp/impl-lint2.log)
- `npm run test:e2e` → 9 passed (6 new + 3 hello-world) (.tmp/impl-e2e-full.log)

## Iteration 1 (review feedback — APPROVED_WITH_MINORS)
- MINOR-1/2 (key collision): key is now `sourcePath::(L<lineStart>|S<djb2(sectionText)>)::src::#<indexWithinSection>`.
  Occurrence index appended UNCONDITIONALLY → same-note same-section embeds independent.
  Null-getSectionInfo fallback now uses a stable content hash (sectionHash, djb2) as section discriminator.
- MINOR-3 (observer leak): liveObservers Set in the processor; stopObserving() removes on resolve/media;
  disconnectAll() called from main.ts onunload. main.ts stays lifecycle-only (holds processor ref, delegates).
- MINOR-4 (content hidden): test 1 asserts `.markdown-embed-content` first() VISIBLE when unfolded;
  test 2 asserts HIDDEN when folded → non-tautological (same locator, opposite result).
- MINOR-5a: twins.md (`![[child]]` x2) — fold nth(0), assert nth(1) stays unfolded (validates key fix).
- MINOR-5b: ref-child.md (heading "Section A" + `^blockid`) + ref-parent.md with
  `![[ref-child#Section A]]-` and `![[ref-child#^blockid]]-`; both fold-by-default, dash stripped.
- NIT-6 REJECTED (per coordinator): left eslint.config.mts ignoring e2e — legitimate 80/20 scoping.
- Final: build exit 0, lint 0 problems, e2e 11 passed (.tmp/iter-*.log).
