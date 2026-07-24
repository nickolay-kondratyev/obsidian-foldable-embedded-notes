---
closed_iso: 2026-07-24T21:00:48Z
id: nid_5ggekhm97uwvthvt7ztxlx88r_e
title: "Explore: foldable embeds in Live Preview (editing mode)"
status: closed
deps: []
links: [nid_otxuhnv0unnuumjdbl0lwqkyi_e]
created_iso: 2026-07-24T18:00:10Z
status_updated_iso: 2026-07-24T21:00:48Z
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
- No hacks and simple integration, if the approach is not robust we would rather not do this.
- Feasibility findings documented; go/no-go decision with Human; if go, follow-up implementation ticket(s) created.

## Findings (2026-07-24)

Full write-up: `.ai_out/live-preview-foldable-embeds/master/EXPLORATION_PUBLIC.md`.
Throwaway prototype + probe spec kept beside it under `prototype/` (NOT in `src/`).

Prototyped against real Obsidian 1.12.7; all of the following verified green in Live Preview:
fold via the existing `styles.css` classes, `-` marker hidden by a CM6 `Decoration.replace`
(revealed when the cursor is on the line), fold-by-default from the marker, click-to-fold,
and fold state surviving edits (CM6 `StateField` position mapping). ~200 lines, one module,
no new runtime deps. Reading mode is unaffected.

Blocking decision for the Human: marker semantics CANNOT be identical across modes without
Obsidian's private markdown syntax-tree node names. A raw-text scan false-positives (e.g. an
`` `![[x]]-` `` inside a code span). The no-hack alternative is a WHOLE-LINE marker rule
(`^![[target]]-$`) in Live Preview only. Fold state would also stay per-mode.

**2026-07-24T21:00:48Z**

GO decision from Human: implement with WHOLE-LINE marker semantics in Live Preview; fold state stays per-mode. Follow-ups created: implement-live-preview-foldable-embeds-cm6, live-preview-e2e-coverage-scope-reading-mode-selectors, document-live-preview-support-and-its-limits-in-readme.

**2026-07-24T21:04:09Z**

Follow-ups consolidated: the e2e and README tickets were merged into nid_otxuhnv0unnuumjdbl0lwqkyi_e; Live Preview is now tracked by that ONE ticket.

**2026-07-24T21:05:57Z**

Correction to the notes above: the e2e and README follow-up tickets were REMOVED (files deleted), not left as closed stubs. Their content lives in the Test work / Docs work sections of nid_otxuhnv0unnuumjdbl0lwqkyi_e. Live Preview = exactly ONE open ticket.
