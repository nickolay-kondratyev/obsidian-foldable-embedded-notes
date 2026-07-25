---
closed_iso: 2026-07-25T05:06:47Z
id: nid_drtkfuu5gijr9qjec5tj2o2yh_e
title: "Live Preview: fold marker inert with a trailing space"
status: closed
deps: []
links: [nid_ktx90omxm6sqotiude6iliwjn_e]
created_iso: 2026-07-24T22:25:08Z
status_updated_iso: 2026-07-25T05:06:47Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

In Live Preview the whole-line marker regex `WHOLE_LINE_MARKED_EMBED` in `src/livePreview/markedEmbedLines.ts:19` requires the `-` to be the LAST character of the line, so `![[x]]- ` (trailing space) silently does NOT fold by default.

Reading mode accepts it (the marker parse there allows following whitespace). The difference is invisible to the user — a stray space silently disables the feature — so the two modes should align.

Found during PARETO_COMPLEXITY_ANALYSIS of the Live Preview work; see `.ai_out/live-preview-foldable-embeds/master/PARETO_COMPLEXITY_ANALYSIS__PUBLIC.md` observation 13.

## Design

Allow trailing whitespace in the regex. NOTE: this changes the `dashFrom`/`dashTo` arithmetic for the `Decoration.replace` that hides the dash — the replaced range must still cover exactly the dash (and decide deliberately whether trailing spaces are covered too). Do it with a test, not by eye.

## Acceptance Criteria

- `![[x]]- ` (trailing space) folds by default in Live Preview, matching reading mode.
- The hidden range still covers exactly the intended characters (cursor-on-line reveal still correct).
- e2e coverage added; lint, build and full e2e suite green.


## Notes

**2026-07-25T05:06:47Z**

Fixed. WHOLE_LINE_MARKED_EMBED now tolerates trailing spaces/tabs after the dash (`/^!\[\[[^\]\n]+\]\]-[ \t]*$/`), aligning Live Preview with reading mode's stripFoldMarker. dashFrom derives from the dash's real index instead of "last char of the line"; the Decoration.replace still covers exactly the dash, so trailing whitespace stays in the text, as in reading mode.

e2e: new fixture line plus exact-text assertions in e2e/live-preview-foldable-embeds.e2e.ts (the old trimEnd-based helper could not distinguish "space survived" from "space swallowed"). Verified red-before-green. lint, build and the full e2e suite (40 passed) green.

Commits: eebd621, 9a4fd0e. Follow-up filed: nid_ktx90omxm6sqotiude6iliwjn_e (indented `- ![[x]]-` folds in reading mode but not Live Preview).
