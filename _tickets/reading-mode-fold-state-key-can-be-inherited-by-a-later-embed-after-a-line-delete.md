---
id: nid_z4jq8me8mhstojozeua8fufdr_e
title: "Reading mode: fold state key can be inherited by a later embed after a line delete"
status: open
deps: []
links: [nid_hsjklsk99tgzq3y97tv0kwfr1_e]
created_iso: 2026-07-25T04:47:16Z
status_updated_iso: 2026-07-25T04:47:16Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview, reading-mode, fold-state]
---

Same bug class as `nid_hsjklsk99tgzq3y97tv0kwfr1_e` (fixed for Live Preview via `ExplicitFold.mapMode = TrackAfter`), but in READING mode. Found during review of commit `c52f646`; deliberately left out of scope there.

The reading-mode session fold key is built in `src/foldableEmbedsPostProcessor.ts` (`buildKey`):

    `${ctx.sourcePath}::L${lineStart}::${src}::#${indexWithinSection}`

(`lineStart` comes from `ctx.getSectionInfo(sectionEl)`; there is an `S<hash>` fallback when the section info is null.)

PROBLEM: `lineStart` is a POSITION, and the key is stored in `src/foldStateStore.ts` (an in-memory Map, no mapping through document edits). Delete the line of a folded embed, and a LATER embed that shifts up onto that same `lineStart` will produce the SAME key and silently inherit the fold — content hidden the user never asked to hide.

Narrower than the Live Preview variant: the `src` and the index-within-section must ALSO match, so it needs two embeds of the SAME note. Still real, and reachable (e.g. a list of repeated `![[daily-template]]` embeds).

Suggested approach (evaluate, do not assume): either invalidate/rekey the store entries for a `sourcePath` when the file changes, or key on something that survives edits rather than a raw line number. Weigh against 80/20 — the failure mode is a wrong fold, not data loss.

Start with a FAILING e2e in `e2e/` (the Live Preview equivalent, the delete-line test in `e2e/live-preview-foldable-embeds.e2e.ts`, is the model to copy) before changing code.

## Acceptance Criteria

- A failing-first e2e reproduces a later reading-mode embed inheriting a deleted embed's fold state.
- Fix makes it pass; full e2e suite stays green.
- The WHY is captured next to the key-construction code.

