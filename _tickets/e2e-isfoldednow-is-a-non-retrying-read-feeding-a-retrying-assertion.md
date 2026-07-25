---
id: nid_1oipd3ymnbsdlbql01h7hue4p_e
title: "e2e: isFoldedNow is a non-retrying read feeding a retrying assertion"
status: open
deps: []
links: []
created_iso: 2026-07-25T04:32:08Z
status_updated_iso: 2026-07-25T04:32:08Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

In e2e/start-collapsed-setting.e2e.ts, the test "a title click is never dead after the setting is flipped" reads `classList.contains` through a raw `page.evaluate` (`isFoldedNow`) and feeds that snapshot into a RETRYING `expect` three lines later (dynamic polarity `!foldedBeforeClick`).

If the settings flip re-render lands between the snapshot and the click, the test asserts the wrong polarity and fails for a reason unrelated to the bug it guards — a latent flake in a test whose whole job is catching a dead click.

## Design

Take the "before" reading behind a settled barrier — e.g. assert the pre-click state with `expectFolded` first, then derive the expectation from that settled value — or drive the whole test off a single retried observation.

## Acceptance Criteria

No raw non-retrying DOM read feeds a retrying assertion in that test; test still fails when the click is made dead.

