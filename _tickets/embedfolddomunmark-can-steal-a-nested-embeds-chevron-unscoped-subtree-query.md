---
id: nid_5w4yyxmghxg4zteq5xjmdrxd9_e
title: "EmbedFoldDom.unmark can steal a NESTED embed's chevron (unscoped subtree query)"
status: open
deps: []
links: []
created_iso: 2026-07-25T05:45:45Z
status_updated_iso: 2026-07-25T05:45:45Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

src/embedFoldDom.ts:106 removes the chevron with an UNSCOPED subtree query:

    embed.querySelector(`.${EmbedFoldDom.CLS_CHEVRON}`)?.remove();

Since nested embeds became first-class marked elements (nid_1ngosntduq5baizn9b7056h34_e), an
outer embed can contain a nested embed that carries its own chevron. Safe TODAY only because an
embed's own title bar precedes its content in document order, so the outer chevron is found
first. If the outer chevron is ever absent while a nested one is present, `unmark(outer)` deletes
the NESTED embed's chevron and leaves that nested mark half-undone (classes still on).

Raised by review of 622a483 as OPTIONAL; deferred because that iteration was doc-only.

## Design

Scope the query the way styles.css already does with `>`:

    embed.querySelector(":scope > .markdown-embed-title > .fen-collapse-icon")?.remove();

Use the existing CLS_/SEL_ constants rather than literals.

## Acceptance Criteria

A unit/e2e case where an outer embed has NO chevron and a nested one does: `unmark(outer)`
leaves the nested chevron attached.

