---
id: nid_g3msd70hmmetiq5ye4ca0mviq_e
title: "Live Preview: dash marker hidden inside fenced code blocks"
status: open
deps: []
links: []
created_iso: 2026-07-24T22:24:59Z
status_updated_iso: 2026-07-24T22:24:59Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

In Live Preview, a line that is nothing but `![[x]]-` INSIDE a fenced code block matches the whole-line marker regex in `src/livePreview/markedEmbedLines.ts:19`, so the `Decoration.replace` hides the trailing dash from what should be verbatim code.

No fold happens (Obsidian renders no embed widget in a code fence) — only the dash visually vanishes. Low severity, but it is a correctness wart in code display.

Found during PARETO_COMPLEXITY_ANALYSIS of the Live Preview work; see `.ai_out/live-preview-foldable-embeds/master/PARETO_COMPLEXITY_ANALYSIS__PUBLIC.md` observation 12. The existing WHY comment only reasons about code *spans*, not fences.

## Design

~5 lines: track ``` fence toggling in the existing `iterLines` loop in `src/livePreview/markedEmbedLines.ts` and skip lines while inside a fence.

## Acceptance Criteria

- A whole-line `![[x]]-` inside a fenced code block renders the dash literally in Live Preview.
- Covered by an e2e test in `e2e/live-preview-foldable-embeds.e2e.ts`.
- `npm run lint` and `npm run build` clean; full e2e suite green.

