---
id: nid_ktx90omxm6sqotiude6iliwjn_e
title: "Live Preview: an INDENTED marked embed (list item / quote) never folds"
status: open
deps: []
links: [nid_drtkfuu5gijr9qjec5tj2o2yh_e]
created_iso: 2026-07-25T05:05:07Z
status_updated_iso: 2026-07-25T05:05:07Z
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

In Live Preview a marked embed that is not at column 0 is not recognised as a fold marker, while reading mode folds it. Concretely, in a note containing:

```
- ![[child]]-
```

(a list item, or the same inside a `> ` blockquote), reading mode renders the embed FOLDED and strips the dash; Live Preview renders it UNFOLDED and shows the dash literally.

Cause: `WHOLE_LINE_MARKED_EMBED` in `src/livePreview/markedEmbedLines.ts` is anchored at `^!`, so any leading list/quote/indent markup makes the whole line fail the match. Reading mode (`src/foldableEmbedsPostProcessor.ts`, `stripFoldMarker`) parses the text node that FOLLOWS the embed span and does not care about what precedes it on the line.

Same FAMILY as ticket nid_drtkfuu5gijr9qjec5tj2o2yh_e (Live Preview trailing space, fixed): a whole-line rule that is stricter than the reading-mode rule. Raised as a suggestion (S1) in `.ai_out/live-preview-trailing-space-marker/settings-persistence-fix/IMPLEMENTATION_REVIEW__PUBLIC.md` and deliberately kept OUT of that change.

## Design

The `^!` anchor exists to keep the marker whole-line only, so that a `-` inside prose (`Inline ![[x]]- tail text.`) and inside a code span stays literal. An indented line is still not inside a code span, so relaxing the prefix to leading whitespace and/or list/quote markup — e.g. `^[ \t]*(?:[-*+]|\d+[.)]|>)?[ \t]*!\[\[...` — may well be safe. That needs its own thinking, not a drive-by:

- `- ![[x]]-` is BOTH a list bullet and a line that ends in the marker dash; the leading `-` must NOT be confused with the marker.
- `dashFrom` currently relies on the marker dash being the line's LAST `-`. A leading list bullet keeps that true (it precedes the embed), but the invariant must be re-argued at the call site.
- Fold state is anchored per LINE (`posAtDOM` is line-accurate only), which is unaffected by indentation.
- Decide deliberately whether nested/multi-level indentation and blockquote prefixes are in scope.

## Acceptance Criteria

- `- ![[child]]-` inside a list folds by default in Live Preview, and only the marker dash is hidden (the bullet stays).
- The same line inside a `> ` blockquote behaves consistently with whatever scope is chosen (in scope: folds; out of scope: documented and asserted as not folding).
- Existing negative cases still hold: `Inline ![[child]]- tail text.` and a code-span `![[child]]-` remain literal and unfolded in Live Preview.
- e2e coverage added to `e2e/live-preview-foldable-embeds.e2e.ts`, proven RED before the fix; lint, build and the full e2e suite green.

