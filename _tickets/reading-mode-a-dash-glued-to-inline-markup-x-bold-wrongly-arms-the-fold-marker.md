---
closed_iso: 2026-07-25T06:09:29Z
id: nid_7ge9y22j5luopjsposmfoi718_e
title: "Reading mode: a dash glued to inline markup (`![[x]]-**bold**`) wrongly arms the fold marker"
status: closed
deps: []
links: [nid_3axo1iklky5s5n9us7947nr4i_e, nid_sos38zx0quvy2ec2j5seqsh7e_e]
created_iso: 2026-07-25T00:44:50Z
status_updated_iso: 2026-07-25T06:09:29Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

`stripFoldMarker` (`src/foldableEmbedsPostProcessor.ts:94-110`) treats `afterMarker === ""` (`:104`) as "end of line", but it only means "end of THIS text node". Any inline markup right after the dash starts a new node, so the dash is the whole text node and counts as a marker.

MEASURED in reading mode:
- ``![[g]]-**bold** tail`` -> FOLDED, dash stripped (renders as "bold tail")
- ``![[g]]-`code` `` -> FOLDED, dash stripped
- `![[g]]-x` -> correctly literal and unfolded

So the documented rule at `:81-85` ("`![[x]]-like` therefore keeps its literal dash") holds only when the following text is PLAIN; otherwise the marker silently arms and the user's dash is deleted from the rendered output.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Require the marker to be at a real end-of-line, not merely end-of-text-node: keep the existing "followed by whitespace" branch, and for the empty case additionally require the text node to be the last inline before a break/block end (`sibling.nextSibling === null || sibling.nextSibling instanceof HTMLBRElement`). Keep the structural (no-lookbehind) style — it is required for Obsidian mobile/iOS Safari.

## Acceptance Criteria

- ``![[x]]-**bold**`` renders the dash literally and does NOT fold by default.
- `![[x]]-` (alone, and followed by whitespace/text) still folds by default with the dash stripped.
- e2e coverage in `e2e/foldable-embeds.e2e.ts` alongside the existing `![[child]]-x` negative case; lint, build and full e2e green.


## Notes

**2026-07-25T06:09:29Z**

RESOLVED in commits 39501ab + af1d63c.

`stripFoldMarker` now arms the marker only when the dash is followed by whitespace or a REAL end of line (new private `isEndOfLine`: `nextSibling === null || nextSibling.instanceOf(HTMLBRElement)`, cross-window safe via obsidian`s `Node.instanceOf`). Structural, no lookbehind, so mobile/iOS Safari stays supported.

e2e in `e2e/foldable-embeds.e2e.ts`: `![[child]]-**bold**` (literal dash, unfolded), `![[child]]- tail` (whitespace branch) and a `marker-soft-break.md` fixture for the `<br>` branch, mutation-proved to be coupled to it. lint/build/full e2e green (46 passed), verified independently by the reviewer.

KNOWN LIMITATION recorded, split into nid_3axo1iklky5s5n9us7947nr4i_e: `**![[x]]-** tail` (embed wrapped in inline markup) still loses its dash. Cross-mode divergence for `![[x]]- tail` tracked in nid_sos38zx0quvy2ec2j5seqsh7e_e.
