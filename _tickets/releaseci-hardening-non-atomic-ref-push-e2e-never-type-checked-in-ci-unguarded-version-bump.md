---
id: nid_tqofahw292qjv6igw7c1w94zz_e
title: "Release/CI hardening: non-atomic ref push, e2e never type-checked in CI, unguarded version-bump"
status: open
deps: []
links: []
created_iso: 2026-07-25T00:44:51Z
status_updated_iso: 2026-07-25T00:44:51Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

Review findings around release plumbing. None of these is a live user-facing bug; each is a way a release or CI run can go wrong silently.

1. `release_to_public.sh:64-71` creates the commit + tag locally and then pushes the branch and the tag as SEPARATE steps. If `git push origin master` fails (remote advanced), the script exits before pushing the tag: a local tag naming a version nobody can install, with the retry blocked by `git pull --ff-only` (`:43`). In the other order, `master` carries the new version while no release is ever published (the tag is the only trigger).

2. Also in that script: `npm version` writes the new `package.json` BEFORE running the `version` lifecycle script, so if `version-bump.mjs` throws (invalid `versions.json`, unwritable `manifest.json`) npm aborts with no commit and leaves a DIRTY, half-bumped tree; the next run then dies on the clean-tree gate (`:37-40`) with no hint about what to revert.

3. `.github/workflows/lint.yml:18-27` runs build + lint only, and `scripts/run-e2e.sh:29` is the ONLY place `tsc -p e2e/tsconfig.json` runs — so a broken e2e spec or harness type error lands on master fully green and surfaces only when a human cuts a release (and can be skipped with `SKIP_E2E=1`, `release_to_public.sh:54-59`).

4. `.github/workflows/release.yml` verifies tag == manifest version but never checks that `versions.json` contains the tag, so a release can ship without its `versions.json` entry.

5. `version-bump.mjs:3` uses `process.env.npm_package_version` unguarded: run outside npm it sets `manifest.version = undefined`, which `JSON.stringify` DROPS — committing a manifest with no `version` (an unloadable plugin). Lines `:9`/`:16` also write without a trailing newline, contradicting `.editorconfig`'s `insert_final_newline = true`.

REFUTED while reviewing (do not re-investigate): no path makes the tag disagree with `manifest.json` — `npm version` stages `manifest.json` before it commits and tags, and `.github/workflows/release.yml:31-38` re-verifies.

## Design

1. Push both refs atomically: `git push --atomic origin "${RELEASE_BRANCH}" "refs/tags/${version}"`.
2. Add a trap after `npm version` that prints exact recovery commands (`git tag -d <v>; git reset --hard origin/master`).
3. Add `npx tsc -p e2e/tsconfig.json` to `.github/workflows/lint.yml`.
4. Add a `versions.json` contains-tag check next to the existing tag/manifest check in `release.yml`.
5. Guard `targetVersion` in `version-bump.mjs` (throw when absent) and write a trailing newline.

## Acceptance Criteria

- A failed branch push cannot leave a pushed tag (or vice versa).
- CI type-checks the e2e sources on every commit.
- The release workflow fails when `versions.json` lacks the tag.
- `node version-bump.mjs` outside npm fails loudly instead of writing a version-less manifest.

