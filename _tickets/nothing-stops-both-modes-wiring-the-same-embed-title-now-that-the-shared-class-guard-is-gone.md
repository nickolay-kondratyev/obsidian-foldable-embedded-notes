---
id: nid_afu1pcd19esc3v9i2xckicrtq_e
title: "Nothing stops BOTH modes wiring the same embed title now that the shared class guard is gone"
status: open
deps: []
links: []
created_iso: 2026-07-25T05:45:54Z
status_updated_iso: 2026-07-25T05:45:54Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

LATENT RISK raised by review of 622a483 (not observed, not measured).

Before that commit the reading-mode post-processor bailed on `embed.classList.contains(CLS_FOLDABLE)`,
which also made it defer to an embed LIVE PREVIEW had already marked. That cross-mode net is gone:
each mode now has its OWN per-instance `WiredElements` (src/wiredElements.ts) — the post-processor
keys on the embed (src/foldableEmbedsPostProcessor.ts), Live Preview on the title
(src/livePreview/livePreviewFoldExtension.ts). Removing the class guard was correct (a leftover
class from a previous plugin instance blocked rewiring), so do NOT bring it back.

It only bites an embed that is simultaneously (a) inside DOM the post-processor renders and
(b) NOT `isNested` by Live Preview's definition (livePreviewFoldExtension.ts `topLevelEmbeds`,
which looks only for an enclosing `.internal-embed`). The reviewer could not construct such a
case against Obsidian 1.12.7.

Symptom if it happens: two click listeners on one title, each inverting the other -> a DEAD click.

## Design

Suggested: hoist ONE per-plugin-instance `WiredElements` keyed on the EMBED and inject it into
both modes; first mode to wire wins. Keeps the "never infer wiring from the DOM" property.
FIRST try to construct a failing case; if none exists, close as WONTFIX rather than adding
machinery for a hypothetical.

## Acceptance Criteria

Either a test reproducing the double-wired dead click plus the fix, or a written finding that
the case is unreachable in the supported Obsidian versions.

