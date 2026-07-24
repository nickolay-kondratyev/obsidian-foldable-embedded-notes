---
closed_iso: 2026-07-24T22:26:03Z
id: nid_otxuhnv0unnuumjdbl0lwqkyi_e
title: "Implement Live Preview foldable embeds (CM6)"
status: closed
deps: []
links: [nid_5ggekhm97uwvthvt7ztxlx88r_e]
created_iso: 2026-07-24T21:00:24Z
status_updated_iso: 2026-07-24T22:26:03Z
type: feature
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

Make `![[note]]` embeds foldable in Live Preview (editing mode), per the GO decision on
`_tickets/explore-foldable-embeds-in-live-preview-editing-mode.md`.

This is the SINGLE ticket for Live Preview support: code, e2e, and docs.

Findings + a WORKING throwaway prototype (start from these, do not re-derive):
- `.ai_out/live-preview-foldable-embeds/master/EXPLORATION_PUBLIC.md`
- `.ai_out/live-preview-foldable-embeds/master/prototype/livePreviewFoldPrototype.ts`
- `.ai_out/live-preview-foldable-embeds/master/prototype/probe-live-preview.e2e.ts`

## Scope (KISS — agreed with the Human)

- The `-` fold marker applies in Live Preview **only when the embed is the ENTIRE line**
  (`^![[target]]-$`). No inline / mid-paragraph marker handling.
  WHY: in CM6 only raw document text is available, and a text scan false-positives inside
  code spans (verified: `` `![[ ]]-` `` in prose matched). Matching reading mode exactly would
  need Obsidian's private markdown syntax-tree node names. A whole-line match cannot occur
  inside a code span.
  WHY-NOT a settings toggle: no option, no migration, no second code path — one behaviour.
- Fold state stays **per-mode** (Live Preview keeps its own CM6 state; no sharing with
  `src/foldStateStore.ts`, no cross-mode key translation).
- Click-to-fold applies to ALL note embeds in Live Preview (marker or not) — only the
  fold-by-DEFAULT marker is whole-line-restricted.

## Design shape (validated against real Obsidian 1.12.7)

- New module under `src/`, registered via `Plugin.registerEditorExtension` from `src/main.ts`
  (main.ts stays lifecycle-only).
- CM6 `StateField` holds explicit fold state; positions map through document changes
  automatically. Anchor at the LINE START — `view.posAtDOM()` on an embed widget is only
  line-accurate (an inline embed reports a few chars into its line). Consequence: embeds
  sharing a line share fold state.
- `Decoration.replace` hides the marker dash; reveal it when the cursor is on that line
  (standard Live Preview convention).
- Toggle the EXISTING `fen-embed` / `fen-folded` / `fen-collapse-icon` classes from
  `styles.css` — no CSS changes, no inline styles.
- A `MutationObserver` on `view.contentDOM` is REQUIRED: Obsidian renders embed widgets
  asynchronously, outside CM's update cycle, so `ViewPlugin.update()` alone never sees them.
- Click-to-fold needs a direct listener on `.markdown-embed-title`;
  `EditorView.domEventHandlers` never fires (Obsidian swallows the event first).
- `@codemirror/state` / `@codemirror/view` are already installed and externalised in
  `esbuild.config.mjs` (Obsidian provides them at runtime) — add them to package.json deps to
  silence the eslint `import/no-extraneous-dependencies` warning.
- Open design call for the implementer: reading mode and Live Preview both need the
  "wait for the async embed title" observer and the chevron/title wiring. Extract the shared
  piece out of `src/foldableEmbedsPostProcessor.ts` ONLY if the abstraction stays obvious;
  otherwise keep them separate and say why.

## Test work (part of this ticket)

- `e2e/foldable-embeds.e2e.ts` selects `.markdown-embed.fen-embed` UNSCOPED. Once embeds in
  the editor DOM are also marked, that selector matches the HIDDEN Live Preview editor and
  the suite fails on visibility assertions (verified during exploration). Scope the
  reading-mode locators to `.markdown-reading-view`.
- Add a Live Preview e2e suite covering: marker folds by default + dash hidden, unmarked
  embed stays unfolded with a chevron, click toggles, fold survives inserting lines above,
  cursor on the line reveals the dash. Start from the archived probe spec above.
- Harness: force Live Preview with `app.vault.setConfig("livePreview", true)`, then
  `ObsidianHarness.setMarkdownViewMode("source")` (see `e2e/obsidianHarness.ts`).

## Docs work (part of this ticket)

- `README.md`: document Live Preview support and, explicitly, the two deliberate limits —
  whole-line-only marker, and per-mode (per-session) fold state.
- `CLAUDE.md`: extend the feature-architecture section if the module layout changes.

## Acceptance Criteria

- `![[note]]` embeds are click-foldable in Live Preview with the same chevron/appearance as
  reading mode.
- A whole-line `![[note]]-` renders folded by default with the dash NOT visible; the dash
  reappears when the cursor is on that line.
- A mid-paragraph `text ![[note]]- text` is left alone in Live Preview (dash renders
  literally) — the documented, intended divergence from reading mode.
- Fold state survives edits elsewhere in the document (position mapping).
- Reading-mode e2e suite passes with the feature active; new Live Preview suite passes.
- `npm run lint` and `npm run build` clean.
- No use of Obsidian private markdown syntax-tree node names.
- README states both limitations.

## Notes

**2026-07-24T22:26:03Z**

Done. Live Preview foldable embeds shipped as a CM6 editor extension (`src/livePreview/`), sharing `src/embedFoldDom.ts` (the styles.css DOM contract) with the reading-mode post-processor. All 8 acceptance criteria met; 23/23 e2e green against real Obsidian 1.12.7; lint + build clean. README documents both deliberate limits (whole-line-only marker, per-mode session fold state). Artifacts: .ai_out/live-preview-foldable-embeds/master/. Follow-ups filed: fenced-code-block dash, trailing-space marker, reading-mode unload unmark, unit-test harness.
