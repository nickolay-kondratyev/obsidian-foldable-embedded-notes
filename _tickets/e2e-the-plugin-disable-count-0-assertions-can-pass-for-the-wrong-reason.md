---
id: nid_856xzuo22pkposozpsvbkd8x5_e
title: "e2e: the plugin-disable count-0 assertions can pass for the wrong reason"
status: open
deps: []
links: []
created_iso: 2026-07-25T05:46:07Z
status_updated_iso: 2026-07-25T05:46:07Z
type: task
priority: 4
assignee: CC_WITH-nickolaykondratyev
---

In e2e/live-preview-foldable-embeds.e2e.ts, test "disabling the plugin strips its injected DOM
from NESTED embeds, and re-enabling rewires them", the three `toHaveCount(0)` assertions right
after `setPluginEnabled(false)` also pass if the editor was rebuilt pristine (the very thing the
comment says must not happen) or if the nested embed vanished entirely.

The test as a whole is NOT vacuous — the following `clickNestedTitleInPage()` throws when the
nested embed or its title is missing — but a failure would point at the wrong line.

Fix: add `await expect(nestedEmbed()).toBeAttached();` immediately after `setPluginEnabled(false)`,
before the count assertions. Raised by review of 622a483; deferred because that iteration was
doc-only and this touches an executable spec.

## Acceptance Criteria

The assertion is present and the test still passes.

