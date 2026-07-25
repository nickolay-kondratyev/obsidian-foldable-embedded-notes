---
id: nid_jbtcd5ty1u4urr7p01n4ngnuw_e
title: "Decide whether e2e runs in CI"
status: open
deps: []
links: []
created_iso: 2026-07-25T04:32:08Z
status_updated_iso: 2026-07-25T04:32:08Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

.github/workflows/lint.yml runs build + lint only — e2e is never run in CI. Every guarantee produced by the assertion-robustness work (ticket nid_ocmytlb996sexgks0wagew41s_e) is therefore a LOCAL-only gate, and a regression can reach master unchallenged.

The harness already downloads a pinned Obsidian (1.12.7) and runs headless in Docker via `--ozone-platform=headless` with no X server, so this is mostly workflow wiring plus a binary cache.

## Design

Add an e2e job to CI with a cache for ~/.cache/obsidian-e2e and ~/.cache/ms-playwright. Weigh runtime and flake budget.

## Acceptance Criteria

An explicit decision is recorded — either e2e runs in CI, or the reason not to is written down.

