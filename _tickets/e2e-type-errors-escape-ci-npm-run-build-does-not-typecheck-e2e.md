---
id: nid_q0lwq06py1qnhp0b6e4d1w2dh_e
title: "e2e type errors escape CI: npm run build does not typecheck e2e/"
status: open
deps: []
links: []
created_iso: 2026-07-25T08:02:34Z
status_updated_iso: 2026-07-25T08:02:34Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

MEASURED while clearing review nits on nid_zqaxj18jbxwnazzz8aeggz91u_e: `npm run build` (esbuild, see esbuild.config.mjs) does NOT typecheck the Playwright harness under `e2e/`. A type error there is only caught by running `npx tsc -p e2e/tsconfig.json` by hand, which nothing in CI or the release gate does.

Concretely: an `interface ... extends` form in `e2e/obsidianHarness.ts` failed with TS2499 and was found ONLY because the agent ran `tsc -p e2e/tsconfig.json` manually. A broken e2e harness type would otherwise reach master silently, and `./release_to_public.sh` gates on lint/build/e2e without ever typechecking the harness itself.

Note the specs still RUN (Playwright transpiles them), so the failure mode is a silently-wrong harness type, not a red suite.

## Design

Simplest shape: add a `typecheck:e2e` npm script running `tsc -p e2e/tsconfig.json --noEmit`, and chain it into whatever CI already runs `npm run lint` (.github/workflows) and into `./release_to_public.sh` next to the existing lint/build gates.

Check first whether `src/` is itself typechecked anywhere, or whether esbuild is the only compile step — if `src/` is also untypechecked, cover BOTH with one script rather than adding an e2e-only special case.

## Acceptance Criteria

- A single npm script typechecks the harness (and src/, if it is currently uncovered).
- Deliberately introducing a type error in e2e/ fails that script — demonstrated, not assumed.
- CI runs it on every commit; release_to_public.sh gates on it.
- lint, build and full e2e stay green.

