---
id: nid_6mci5k3ha9t6ks3gm9sm3vpec_e
title: "e2e harness: symmetric browser cleanup on the launch-failure path"
status: open
deps: []
links: []
created_iso: 2026-07-25T04:32:08Z
status_updated_iso: 2026-07-25T04:32:08Z
type: chore
priority: 4
assignee: CC_WITH-nickolaykondratyev
---

In `ObsidianHarness.spawnAndConnect` (e2e/obsidianHarness.ts) the catch path now awaits `killAndWaitForExit`, but does not close the CDP `browser` when `connectOverCDP` succeeded and a LATER boot step threw. Killing the process drops the transport in practice, so there is no observable symptom today.

Deliberately deferred during ticket nid_ocmytlb996sexgks0wagew41s_e as cosmetic: doing it properly needs a hoisted `let browser: Browser | undefined` — mutable state for no observable behaviour change. Recorded so the knowledge is not lost.

## Acceptance Criteria

Revisit only if a failed launch is ever observed to hang. Close as wont-fix otherwise.

