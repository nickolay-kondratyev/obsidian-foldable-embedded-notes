# EXPLORATION_RUNTIME — PUBLIC

Scope: (A) can the e2e suite run in this environment, (B) how to deliberately break each guarded
behaviour so an assertion can be proven non-vacuous.

> Written by TOP_LEVEL_AGENT on behalf of the Explore agent (that role had no write tool).
> Claims below are the explorer's; the IMPLEMENTATION agent MUST re-verify by running the suite
> itself rather than trusting the cached log referenced here.

## A. Can e2e run here? — YES (reported as confirmed)

- Entry point: `npm run test:e2e` → `scripts/run-e2e.sh`, which
  1. resolves/downloads Obsidian via `scripts/setup-obsidian-bin.sh` (skipped if `OBSIDIAN_PATH` set),
  2. seeds `.dev-vault` (`npm run setup:dev-vault`),
  3. type-checks `e2e/tsconfig.json`,
  4. runs `npx playwright test --config e2e/playwright.config.ts`.
- Obsidian pinned at `OBSIDIAN_VERSION=1.12.7`, cached at `${XDG_CACHE_HOME:-$HOME/.cache}/obsidian-e2e`.
  `~/.cache/obsidian-e2e/obsidian-1.12.7/` already exists on this machine.
- Playwright 1.61.1 in `node_modules`; `~/.cache/ms-playwright` has `chromium_headless_shell-1228`.
- No display (`DISPLAY`/`WAYLAND_DISPLAY` unset, no Xvfb). `run-e2e.sh` detects this and sets
  `OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"` — no X server needed.
- `e2e/playwright.config.ts`: `workers: 1`, `fullyParallel: false`, 120s test timeout, 15s expect timeout.
- Evidence of a recent green run: `.tmp/e2e-final.log` — 37/37 specs passing (~6.7s Playwright time).
- **CI does NOT run e2e** (`.github/workflows/lint.yml` = build + lint only). e2e is a local-only gate.

Commands:

```bash
mkdir -p .tmp
npm run test:e2e > .tmp/e2e-run.log 2>&1                            # full suite
npm run test:e2e -- start-collapsed-setting.e2e.ts > .tmp/x.log 2>&1  # single spec
```

No env vars needed. Realistic wall time per invocation ~15-30s (tsc + vault rebuild dominate).

## B. Deliberate one-line sabotages (for proving assertions non-vacuous)

Each must be reverted immediately after the proof run; `git status` must end clean.

### `src/foldStateStore.ts` — session fold memory
In-memory `Map<string, boolean>`, keyed per embed occurrence (`buildKey` in the post-processor:
`sourcePath::L<lineStart|S<hash>>::src::#index`). No persistence; resets on app restart by design.
`get()` returns `undefined` until the user toggles, then overrides the marker default.

- **Break**: make `get(key)` always return `undefined` (or `false`).
- **Observable**: after toggling and forcing a genuine re-render, the embed reverts to its syntax
  default instead of the user's last click — `.fen-folded` disagrees with the last click.
- **Guards**: the reading → editing → reading round-trip test (defect 1).

### `src/embedFoldDom.ts` — title-click handler (~lines 70-100)
Calls `event.preventDefault()` + `event.stopPropagation()` before `onClick()`, suppressing
Obsidian's own "navigate into the embedded note".

- **Break**: delete `event.preventDefault();` (and/or `stopPropagation()`).
- **Observable**: the click falls through to Obsidian's navigation; the active leaf changes and the
  embed locator DETACHES. This is exactly the regression defect 2 says currently goes green.
- **Guards**: `start-collapsed-setting.e2e.ts:180-188` (the dead-click guard test).

### `src/foldableEmbedsPostProcessor.ts` — reading-mode render pass
Runs on every source→DOM render (file open, mode switch, section re-render). Re-derives
`store.get(key) ?? foldedByDefault(...)`; guarded by `embed.classList.contains(CLS_FOLDABLE)` against
double-processing the same live node. Waits async (`MutationObserver`) for `.markdown-embed` + title.

- **Break A**: `folded = foldedByDefault(...)` (drop the `store.get(key) ??`) — integration-boundary
  version of the store break; same failure mode for the round-trip test.
- **Break B**: in `stripFoldMarker`, `text.startsWith(FOLD_MARKER)` → `text.endsWith(FOLD_MARKER)` —
  `![[child]]-` stops stripping its dash; "folded, body hidden, no visible dash" assertions fail.
