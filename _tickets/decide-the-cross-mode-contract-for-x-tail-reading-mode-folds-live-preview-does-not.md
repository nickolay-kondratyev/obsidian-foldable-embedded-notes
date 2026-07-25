---
id: nid_sos38zx0quvy2ec2j5seqsh7e_e
title: "Decide the cross-mode contract for `![[x]]- tail` (reading mode folds, Live Preview does not)"
status: open
deps: []
links: [nid_3axo1iklky5s5n9us7947nr4i_e, nid_7ge9y22j5luopjsposmfoi718_e]
created_iso: 2026-07-25T06:09:11Z
status_updated_iso: 2026-07-25T06:09:11Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

Noticed while fixing nid_7ge9y22j5luopjsposmfoi718_e (see `.ai_out/dash-inline-markup-marker/settings-persistence-fix/IMPLEMENTATION_REVIEW__PUBLIC.md`).

The two modes disagree when a dash is followed by whitespace and then more text on the same line:
- READING mode (`stripFoldMarker` in `src/foldableEmbedsPostProcessor.ts`): the dash is followed by whitespace, so the marker ARMS — the embed folds and the dash is stripped.
- LIVE PREVIEW (`src/livePreview/markedEmbedLines.ts`): a WHOLE-LINE regex, so trailing text makes the line not match — no marker, no fold.

Both behaviours are defensible; what is not defensible is that they differ. This is a PRODUCT decision, not a bug fix: pick one contract (most likely "marker only at end of line", matching Live Preview and the newly tightened reading-mode end-of-line rule), then align the other mode and the docs.

Deliberately out of scope of the inline-markup fix, which only tightened the empty-after-dash case.

## Acceptance Criteria

- One documented rule for `![[x]]- tail` shared by both modes.
- Both modes behave identically for it, covered by e2e in `e2e/foldable-embeds.e2e.ts`.
- CLAUDE.md marker documentation updated to state the single rule.

