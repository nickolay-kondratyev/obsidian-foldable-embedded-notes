---
id: nid_3axo1iklky5s5n9us7947nr4i_e
title: "Reading mode: an embed wrapped in inline markup (`**![[x]]-** tail`) still loses its dash"
status: open
deps: []
links: [nid_7ge9y22j5luopjsposmfoi718_e, nid_sos38zx0quvy2ec2j5seqsh7e_e]
created_iso: 2026-07-25T06:08:56Z
status_updated_iso: 2026-07-25T06:08:56Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

Known limitation recorded while fixing nid_7ge9y22j5luopjsposmfoi718_e.

`isEndOfLine` in `src/foldableEmbedsPostProcessor.ts` only inspects the marker text node's SIBLINGS. When the embed plus dash are wrapped in inline markup, e.g. `**![[x]]-** tail`, the dash is last inside the `<strong>` element, so it counts as end of line: the marker arms and the literal dash is deleted from the rendered output, even though visible text follows.

Fixing it needs an ancestor walk (climb while the node is last-child of an INLINE element, then test that ancestor's next sibling). Deferred as rare + not worth the complexity at the time (80/20).

## Acceptance Criteria

- `**![[x]]-** tail` renders the dash literally and does not fold.
- Existing marker e2e cases in `e2e/foldable-embeds.e2e.ts` stay green.

