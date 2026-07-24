---
id: nid_5ggekhm97uwvthvt7ztxlx88r_e
title: "Explore: foldable embeds in Live Preview (editing mode)"
status: open
deps: []
links: []
created_iso: 2026-07-24T18:00:10Z
status_updated_iso: 2026-07-24T18:00:10Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview, backlog]
---

## Context
V1 (reading mode) is planned in the core foldable-embeds ticket. In Live Preview the `![[note]]-` marker renders as a literal `-` next to the embed widget — a documented v1 limitation.

## Goal
Research + prototype Live Preview support: CodeMirror 6 ViewPlugin/Decoration that (a) hides the `-` marker char, (b) makes the embed widget foldable consistently with reading mode (shared fold classes + `src/foldStateStore.ts`).

## Notes
- CM6 editor embeds are widget decorations, DOM differs from reading view — needs its own throwaway prototyping pass (e2e harness in e2e/obsidianHarness.ts supports this; force mode source with livePreview).
- Keep marker semantics identical (strict: `-` after `]]` followed by whitespace/EOL).

## Acceptance Criteria

Feasibility findings documented; go/no-go decision with Human; if go, follow-up implementation ticket(s) created.

