---
id: nid_9bvqz2a3rzved4u2pci21tyfr_e
title: "Plugin disabled during onload's await settings.load() registers a post-processor on an unloaded plugin"
status: open
deps: []
links: []
created_iso: 2026-07-25T05:46:03Z
status_updated_iso: 2026-07-25T05:46:03Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

PRE-EXISTING, spotted during review of 622a483.

src/main.ts `onload()` awaits `settings.load()` BEFORE constructing the post-processor. If the
plugin is disabled during that await, `onunload()` runs with `postProcessor` still `undefined`
(so `teardown()` is never called), and then `onload()` resumes and registers the post-processor
and editor extension on an already-unloaded plugin. Marks made after that point would never be
torn down.

Window is tiny (one `loadData()`), so this is hardening, not a reported bug.

## Design

Options: track an `unloaded` flag set by `onunload()` and bail out of the rest of `onload()`;
or construct the post-processor BEFORE the await so `onunload` always has something to tear down.
Prefer whichever keeps main.ts lifecycle-only per CLAUDE.md.

## Acceptance Criteria

A test (or a clearly reasoned note plus the guard) showing that a disable racing onload leaves
no registered post-processor and no marks behind.

