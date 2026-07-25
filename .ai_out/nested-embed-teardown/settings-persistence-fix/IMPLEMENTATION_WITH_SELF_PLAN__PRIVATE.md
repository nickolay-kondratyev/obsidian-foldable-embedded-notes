# PRIVATE memory — nested-embed teardown fix

## Goal
Reading-mode post-processor must be able to UNDO everything it injects, because embed
BODIES it renders live inside Live Preview widget DOM that Obsidian REUSES across plugin
unload. Plus: wiring guards must not be CSS classes (a leftover class blocks rewiring).

## Plan
1. e2e FIRST: new test in `e2e/live-preview-foldable-embeds.e2e.ts`, placed AFTER the
   existing nested test (`clicking a NESTED embed's title never folds...`), because the
   file is SERIAL and the existing teardown test at ~:345 runs against `lp-embeds.md`
   (no nested embed open at that point). Adding a nested embed to `lp-embeds.md` would
   shift every `EMBED_*` index — forbidden by "robust tests".
2. Verify empirically whether `ctx.addChild(MarkdownRenderChild)` alone gives teardown on
   plugin DISABLE. Expectation: NO — the render child's parent component is Obsidian's
   (the embed/preview renderer), which does not unload when a plugin is disabled.
3. Implement: per-embed `MarkdownRenderChild` (self-cleanup + rewire enablement) PLUS a
   processor-level registry so `main.onunload()` can unload them all.
4. WeakSet wiring guards (shared `WiredElements` type, used by both modes).
5. NOT doing ticket part 3 (LP `destroy()` sweeping nested embeds) — redundant once (3)
   lands, and actively harmful when the LP view is destroyed while the plugin lives.

## Key facts learned
- `e2e/live-preview-foldable-embeds.e2e.ts` is `mode: "serial"`, one Obsidian per spec file.
- `harness.setPluginEnabled(bool)` = real enable/disable via `app.plugins`.
- Nested embeds ARE wired by the post-processor even inside Live Preview (proven by the
  existing nested test at :387).
- `EmbedFoldDom.onTitleClick` already takes `AddEventListenerOptions` → `{ signal }`.
- `Component.unload()` is guarded by `_loaded`, so calling `unload()` manually AND letting
  Obsidian unload the same child later fires `onunload` only once.
- e2e: `npm run test:e2e -- e2e/live-preview-foldable-embeds.e2e.ts -g "<name>"`.
- Obsidian binary cached at /home/node/.cache/obsidian-e2e/obsidian-1.12.7/obsidian.

## Status: DONE (not committed — TOP_LEVEL_AGENT owns git; ticket left OPEN)

Result: lint PASS, build PASS, e2e 43/43 PASS (`.tmp/e2e-full2.log`).
New files: `src/foldableEmbedMark.ts`, `src/wiredElements.ts`. Modified: post-processor,
main, livePreviewFoldExtension, embedFoldDom (docs), CLAUDE.md, LP e2e spec.

### Measured, do not re-litigate
- `ctx.addChild` does NOT fire on plugin disable (`.tmp/e2e-experiment-addchild-only.log`)
  → processor-level `teardown()` unloading each mark is REQUIRED.
- A preview↔source round trip REUSES the rendered embed body → the re-enabled plugin does
  not rewire nested embeds until the note is REOPENED. The e2e test therefore navigates
  away and back; a bare mode switch leaves chevrons at 0 and the test red.
- With the plugin off, the nested title click has `defaultPrevented === false`.
- Ticket part 3 (LP `destroy()` sweeping nested embeds) intentionally NOT done — see
  PUBLIC.md for the redundancy + live-listener-orphaning argument.

## Iteration 1 (post-review) — DONE, comment/doc/ticket only, NOT committed

Review verdict was SHIP WITH FIXES; no code-correctness blocker. Both MUST-FIX done.
Lint PASS, build PASS (`.tmp/iter1-lint.log`, `.tmp/iter1-build.log`). e2e deliberately NOT
re-run — nothing executable changed (`git diff` = CLAUDE.md + 2 doc comments + 2 ticket files).

### Ground truth from `node_modules/obsidian/obsidian.d.ts` — do not re-guess
- `Component.addChild`: "Adds a child component, **loading** it if this component is loaded".
  It NEVER unloads. The old comment claiming otherwise was wrong and is deleted.
- `MarkdownPostProcessorContext.addChild`: "if the **containerEl** of the child is ever removed,
  the component's unload will be called". THAT is the boundedness mechanism; `containerEl` is
  the embed span. Plugin disable removes nothing → does not fire → `teardown()` is required.

### Tickets filed this iteration (do not re-file)
- `nid_o44oqs41s0z21xttblyk513v7_e` — adopt already-rendered embeds on load (the AC3 caveat).
- `nid_5w4yyxmghxg4zteq5xjmdrxd9_e` — scope `EmbedFoldDom.unmark`'s chevron query.
- `nid_afu1pcd19esc3v9i2xckicrtq_e` — cross-mode double-wiring net (latent, unmeasured).
- `nid_9bvqz2a3rzved4u2pci21tyfr_e` — disable racing `onload`'s await (pre-existing).
- `nid_856xzuo22pkposozpsvbkd8x5_e` — e2e count-0 assertions can fail at the wrong line.
Notes added to `nid_1ngosntduq5baizn9b7056h34_e` (AC3 caveat + part-3 rationale) and to the
closed `nid_tto6kyjdm8dsi86mvvnqey2sh_e` (cross-reference).

Rejected: review OPTIONAL #5 (merge `liveMarks`+`wiredEmbeds` — would force a strong-retaining
Map for a two-line saving) and #7 (unobserved "watch" item, no action possible).

### Gotchas encoded in the code
- `mark.load()` is explicit: an unloaded Component ignores `unload()`.
- `ctx.addChild(mark)` is the LAST statement of `makeFoldable` for the same reason.
- `teardown()` iterates a COPY of `liveMarks` (each unload calls `forget`).
