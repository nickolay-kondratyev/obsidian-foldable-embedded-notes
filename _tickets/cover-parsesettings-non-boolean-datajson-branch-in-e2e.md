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


## Notes

**2026-07-25T03:58:33Z**

SECOND CASE for this ticket (added after the settings-persistence fix, commit 503f05b):
cover `asKeyedObject` in src/settings/foldableEmbedsSettingsStore.ts (the
non-object-root branches). It belongs here because this ticket already owns
hostile-`data.json` seeding through `harness.launch({ extraFixtures: ... })`.

What it guards: the store now RE-WRITES the unknown keys it found in data.json
(`{ ...this.persisted, ...this.current }`), so a root that is not a plain object must be
DROPPED rather than spread. `asKeyedObject` rejects `null`, arrays and non-objects.
Nothing exercises those branches at any level today.

Failure scenario: a refactor drops the `Array.isArray` check; a data.json whose root is
`[1,2]` is then spread into `{"0":1,"1":2,"startCollapsed":true}` and written back,
permanently mangling the user's file - and every gate stays green.

Acceptance for this case: seed a data.json whose root is an ARRAY (and/or a bare string),
toggle the setting through the real settings dialog, then assert the file on disk is
EXACTLY `{"startCollapsed": true}` - no index keys, no mangling. Mutation-proven: goes red
when the `Array.isArray` guard is removed.

Cheaper alternative if the unit-test runner (nid_lcehddb2tdcq6qxztmhvhpgga_e) lands first:
cover `asKeyedObject` there as pure logic instead, and close this case out.

Raised as SHOULD-FIX 2 in
.ai_out/settings-persistence/settings-persistence-fix/IMPLEMENTATION_REVIEW__PUBLIC.md.
