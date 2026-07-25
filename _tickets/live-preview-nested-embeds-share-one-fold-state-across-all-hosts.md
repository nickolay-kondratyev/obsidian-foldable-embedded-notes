---
id: nid_jdpdpu7w0nfda3y4decz7f6xy_e
title: "Live Preview: nested embeds share ONE fold state across all hosts"
status: open
deps: []
links: []
created_iso: 2026-07-25T07:39:42Z
status_updated_iso: 2026-07-25T07:39:42Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

In LIVE PREVIEW, an embed nested inside a top-level embed has no distinguishing fold
identity: `src/embedFoldKeys.ts` `unseenHostKey()` keys the host by its LINK alone
(`host::<src>`), because the top-level embed span is built by CM6 and the reading-mode
post-processor (`src/foldableEmbedsPostProcessor.ts`) never registers it in
`src/embedFoldKeyRegistry.ts`. The nested embed's own key is identical too (same child
note, same section text, same index), so two Live Preview hosts — in the SAME note or in
DIFFERENT notes — produce the identical key and fold together.

MEASURED on Obsidian 1.12.7 by the reviewer of ticket nid_zqaxj18jbxwnazzz8aeggz91u_e:
folding the nested embed in host A leaves it `fen-folded` when host B is opened in Live
Preview. Pre-existing behaviour; reading mode was fixed by that ticket, Live Preview was
not.

Fixing it needs a stable identity for a CM6 widget span (Live Preview's business, see
`src/livePreview/`), which is a genuinely different mechanism from the reading-mode
occurrence key — hence a separate ticket.

## Acceptance Criteria

An e2e in `e2e/live-preview-foldable-embeds.e2e.ts` (or a sibling file) folds a nested
embed in host A in Live Preview and asserts it is NOT folded in host B; and two Live
Preview embeds of the SAME host note fold their nested embeds independently.

