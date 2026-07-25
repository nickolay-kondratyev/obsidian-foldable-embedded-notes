---
id: nid_o44oqs41s0z21xttblyk513v7_e
title: "Re-enabled plugin does not adopt already-rendered embeds, so nested embeds stay unfoldable until the note is reopened"
status: open
deps: []
links: []
created_iso: 2026-07-25T05:45:34Z
status_updated_iso: 2026-07-25T05:45:34Z
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

MEASURED on Obsidian 1.12.7 while fixing nid_1ngosntduq5baizn9b7056h34_e.

After the plugin is disabled and re-enabled (which is exactly what a plugin UPDATE does), an
embed BODY nested inside a Live Preview widget is NOT rewired: a preview<->source round trip
REUSES the already-rendered body, so `FoldableEmbedsPostProcessor.process`
(src/foldableEmbedsPostProcessor.ts) is never invoked over it. The user sees a nested embed
with no chevron that does not fold, until the note is REOPENED.

Live Preview TOP-LEVEL embeds do not have this problem, because `registerEditorExtension`
rebuilds open editors on load — so the inconsistency is user-visible within one note.

Proof of the current behaviour is in the e2e test "disabling the plugin strips its injected DOM
from NESTED embeds, and re-enabling rewires them"
(e2e/live-preview-foldable-embeds.e2e.ts), which navigates away and back for exactly this reason.

## Design

Proposed: on plugin load, one ADOPTION sweep over already-rendered embeds — query the open
markdown views for `.internal-embed.markdown-embed` that are not in `WiredElements`
(src/wiredElements.ts) and wire each through the same path `makeFoldable` uses.

Open questions the implementer must settle:
- Fold-state identity: `buildKey` needs a `MarkdownPostProcessorContext` (sourcePath, section
  info). An adopted embed has no ctx. Either derive an equivalent key or accept default state.
- Lifetime: an adopted mark has no renderer to `ctx.addChild` to, so its unload trigger has to
  come from somewhere else (processor `teardown()` still covers plugin unload).
- This is NEW behaviour, deliberately out of scope of the teardown fix.

## Acceptance Criteria

e2e: with a nested embed on screen in Live Preview, disable then re-enable the plugin, and —
WITHOUT reopening or renavigating the note — the nested embed has a chevron and one click on
its title folds it.

