---
id: nid_lgos6hbf2hvl2sp5jns0xgg5u_e
title: "Cover (or correct) the title-click preventDefault/stopPropagation"
status: open
deps: []
links: []
created_iso: 2026-07-25T04:32:08Z
status_updated_iso: 2026-07-25T04:32:08Z
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
---

`EmbedFoldDom.onTitleClick` (src/embedFoldDom.ts) suppresses two default behaviours via `event.preventDefault()` + `event.stopPropagation()`, and NOTHING asserts either.

Measured twice independently (implementation + review passes, 2026-07-25): the full e2e suite stays GREEN with both calls deleted on Obsidian 1.12.7. So the code is currently defended only by its comment. The comment has been softened to what is actually known, but the coverage gap remains.

## Design

In READING mode: click a title and assert `app.workspace.getActiveFile().path` is unchanged after the fold has visibly landed.
In LIVE PREVIEW: click a title and assert the CM6 cursor did not jump onto the embed line.

Note a naive active-file assertion was already tried and REJECTED as vacuous — it passed with AND without the code. Any new assertion must be proven by sabotage (delete the calls, observe red, revert).

## Acceptance Criteria

Either an assertion exists that FAILS when preventDefault/stopPropagation are deleted, OR the calls are deleted on the evidence that no such assertion can be built. Never delete on a green suite alone.

