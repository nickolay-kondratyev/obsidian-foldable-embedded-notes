---
id: nid_js55rt1e78e55nuj83xh2lg3h_e
title: "e2e harness: keep a bounded ring buffer of Obsidian stderr for the whole session"
status: open
deps: []
links: []
created_iso: 2026-07-25T04:32:08Z
status_updated_iso: 2026-07-25T04:32:08Z
type: feature
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

e2e/obsidianHarness.ts now correctly DETACHES the boot-time stderr listener once CDP is up (fixing an unbounded in-memory accumulation). Consequence: an Obsidian crash MID-SUITE produces no diagnostic at all — just a wall of assertion timeouts that look random.

## Design

Keep a bounded ring buffer of the last N KB of stderr for the process lifetime (bounded, so the original leak does not return). Print it when a spec fails or when the harness closes uncleanly.

## Acceptance Criteria

A mid-suite Obsidian crash surfaces its stderr tail in the failure output; memory stays bounded over a long run.

