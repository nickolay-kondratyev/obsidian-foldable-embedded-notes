# Implementation summary — Reading-mode foldable embeds (`![[x]]-`)

**Status: DONE.** Build, lint, and full e2e suite all green. No blocking issues.

## What was implemented
Reading-mode `![[note]]` embeds are foldable via their native `.markdown-embed-title` bar,
which gets a rotating collapse chevron (obsidian `setIcon("right-triangle")`) and is forced
visible even if a theme hides it. `![[note]]-` folds by default using a STRICT marker rule
(`-` is a marker only when it is the first char after `]]` AND followed by whitespace/EOL;
`![[x]]-like` keeps its literal dash). The marker dash is stripped so it never renders. Fold
state is session-only (in-memory, survives re-renders/mode switches, resets on restart); the
store overrides the syntax default after user interaction. Only note embeds are touched —
image/PDF/media embeds are skipped. Live Preview/editing mode is out of scope (documented).

Collapse is entirely class-driven (`.fen-folded`, `is-collapsed`) — no inline styles, no
runtime `<style>` injection. Note embeds load asynchronously, so the post-processor waits
(scoped `MutationObserver`, or synchronously when already loaded) for `.markdown-embed` +
title before wiring folding; media embeds never gain that class and are ignored.

## Files
### Added
- `src/foldStateStore.ts` — session `Map<string, boolean>` fold store (get/set, no persistence).
- `src/foldableEmbedsPostProcessor.ts` — the feature: marker parse/strip, key building
  (`sourcePath::L<lineStart>|i<index>::src` via `ctx.getSectionInfo`), chevron injection,
  fold-state application, title click handler.
- `e2e/foldable-embeds.e2e.ts` — 6 tests against real Obsidian.

### Changed
- `src/main.ts` — stripped ALL sample-plugin scaffolding; now lifecycle-only (registers the
  post-processor). No `async`, no settings.
- `styles.css` — replaced boilerplate with fold CSS (collapse, forced-visible title, chevron rotation).
- `e2e/obsidianHarness.ts` — added `setMarkdownViewMode("preview"|"source")` helper.
- `eslint.config.mts` — added `**/main.js`, `.tmp`, `.dev-vault`, `e2e` to globalIgnores
  (see decision below).
- `README.md`, `CLAUDE.md` — feature docs / module architecture (succinct).

### Deleted
- `src/settings.ts` (v1 has no settings) — and all its call sites in `main.ts`.

## How to run
```bash
npm run build      # tsc -noEmit + esbuild production bundle
npm run lint       # eslint .
npm run test:e2e   # full suite (auto setup:dev-vault + tsc + Playwright/real Obsidian)
npm run test:e2e -- foldable-embeds.e2e.ts   # just the new spec
```

## Test results
```
npm run build   → exit 0 (clean)
npm run lint    → exit 0, 0 problems
npm run test:e2e:
  Running 9 tests using 1 worker
  ✓ unmarked embed renders unfolded
  ✓ `![[child]]-` renders folded with no visible dash
  ✓ chevron is present and reflects fold state
  ✓ clicking the title folds, then unfolds
  ✓ fold state survives a reading -> editing -> reading round-trip
  ✓ strict-marker negative `![[child]]-x` stays unfolded with the dash visible
  ✓ plugin instance is loaded in a real Obsidian
  ✓ plugin id is in Obsidian's enabled-plugins set
  ✓ opening the embedding fixture note makes it the active file
  9 passed
```
The marker logic was verified against a REAL render (not assumed): the folded case strips the
dash (sibling text no longer starts with `-`) and the strict-negative `![[child]]-x` preserves
`-x` and stays unfolded.

## Decisions / callouts
- **eslint ignore fix (pre-existing breakage, fixed).** `master` HEAD already failed
  `npm run lint` (34 errors) — the obsidianmd PLUGIN ruleset was being applied to the Node
  Playwright harness (`e2e/*.ts`), flagging its deliberate `window.app as any` bridge and
  `node:` imports, plus nested build-artifact `main.js` files under `.tmp`/`.dev-vault`. The
  eslint ignore list had drifted from `.gitignore`. Fixed by scoping the plugin lint to `src/`
  (ignore `**/main.js`, `.tmp`, `.dev-vault`, `e2e`). This makes lint clean AND repairs the
  pre-existing CI-red state. Trade-off: e2e code is no longer linted by the obsidian ruleset
  (correct — those rules are for shipped mobile-capable plugin code, not Node test tooling).
- **`minAppVersion` NOT bumped.** `noUnsupportedApi` did not flag `setIcon` /
  `getSectionInfo` at `1.0.0`; `manifest.json` and `versions.json` are unchanged.
- **Click listener** attached directly to the freshly-created title element (lives/dies with
  the DOM node) rather than `registerDomEvent` — avoids accumulating dead listeners across
  re-renders and needs no explicit cleanup.
- **No deviations** from the ticket's product decisions or module design.

## Not done (intentional, per ticket)
- Live Preview / editing-mode folding (out of scope; dash shows literally there).
- No settings tab / ribbon / commands (separate ticket).
- `main.js` not staged (gitignored build artifact).
