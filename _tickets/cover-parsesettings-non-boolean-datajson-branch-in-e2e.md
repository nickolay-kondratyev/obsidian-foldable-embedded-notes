---
id: nid_fp6hsv6aljxz1ifawlezcfdgu_e
title: "Cover parseSettings' non-boolean data.json branch in e2e"
status: open
deps: []
links: []
created_iso: 2026-07-24T23:46:30Z
status_updated_iso: 2026-07-24T23:46:30Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [settings, testing]
---

The defensive branch in `parseSettings` (src/settings/foldableEmbedsSettings.ts:25-40) — a `startCollapsed` value in `.obsidian/plugins/<id>/data.json` that is not a boolean — is the one line added by the "start embedded notes collapsed" feature that no test exercises.

Context: the e2e harness already seeds plugin data via `harness.launch({ extraFixtures: { ".obsidian/plugins/<id>/data.json": ... } })` (e2e/obsidianHarness.ts), so this is cheap.

Raised as an explicitly NON-blocking residual in .ai_out/default-collapsed-setting/master/IMPLEMENTATION_REVIEW__PUBLIC.md (Residual item 1).

## Acceptance Criteria

- New case in e2e/start-collapsed-setting.e2e.ts seeds `{"startCollapsed": "false"}` (a STRING, not a boolean) and asserts embeds render EXPANDED, i.e. the default is projected rather than the junk value being coerced.
- Test is mutation-proven: it goes red when the `typeof === "boolean"` guard is removed.
- `npm run lint` and `npm run build` stay green; the rest of the e2e suite is unchanged.

