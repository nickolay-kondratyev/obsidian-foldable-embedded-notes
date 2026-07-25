# Nested-embed teardown + wiring-guard fix — implementation

Ticket: `_tickets/nested-embeds-inside-live-preview-widgets-are-never-unmarked-and-the-disabled-plugins-click-listener-keeps-handling-them.md`
(left OPEN — closing/committing is TOP_LEVEL_AGENT's call.)

## Verification of the design question (asked by the ticket)

**`ctx.addChild(MarkdownRenderChild)` alone is NOT enough — MEASURED, not assumed.**
I implemented the render-child route first and ran the new e2e test with the
processor-level unload loop disabled: after `disablePlugin`, `.cm-content .fen-embed`
was still 1 (the nested embed). Log: `.tmp/e2e-experiment-addchild-only.log`.
Reason: a plugin disable does not unload Obsidian's own render components, so children
hanging off them are never unloaded.

So the shipped design uses BOTH, each for a different job:
- `MarkdownRenderChild` (`ctx.addChild`) — undoes one embed's marks when Obsidian unloads
  whatever rendered it (section re-render, widget rebuild). Keeps the owner's registry
  bounded and lets a REUSED element be wired again afterwards.
- a processor-level registry of live marks, unloaded by `FoldableEmbedsPostProcessor.teardown()`
  from `Plugin.onunload()` — the only thing that covers plugin disable.

## What changed

- **`src/foldableEmbedMark.ts` (new)** — `FoldableEmbedMark extends MarkdownRenderChild`:
  owns one `AbortController` for the title listener; `onunload()` aborts it, calls
  `EmbedFoldDom.unmark`, and tells its owner to forget it. The exact inverse of one wiring.
- **`src/wiredElements.ts` (new)** — `WiredElements`, a named `WeakSet` of elements THIS
  instance wired. Used by BOTH modes (post-processor keys on the embed, Live Preview on the
  title, as before). Extraction is one small type carrying the shared WHY ("never infer
  'already wired' from the DOM"); the differing key stays at each call site.
- **`src/foldableEmbedsPostProcessor.ts`** — both CSS-class guards (`:58`, `:143`) now ask
  `WiredElements`; each wired embed gets a `FoldableEmbedMark` whose signal is passed to
  `EmbedFoldDom.onTitleClick`; `disconnectAll()` became `teardown()` (observers + unload
  every live mark). The mark is `load()`ed explicitly (an unloaded component ignores
  `unload()`, which would make teardown a no-op) and `ctx.addChild` is called LAST (adding
  can unload immediately, and that unload must find the wiring in place to undo it).
- **`src/main.ts`** — `onunload()` calls `teardown()`.
- **`src/livePreview/livePreviewFoldExtension.ts`** — `wiredTitles` is now a `WiredElements`.
- **`e2e/live-preview-foldable-embeds.e2e.ts`** — new test
  `"disabling the plugin strips its injected DOM from NESTED embeds, and re-enabling rewires them"`,
  plus `nestedEmbed()` and `clickNestedTitleInPage()` helpers.
- **`CLAUDE.md`**, `src/embedFoldDom.ts` doc comments — brought in line (the old claim that
  reading mode needs no listener removal was exactly the bug).

## Deliberate deviation: ticket part 3 NOT implemented

`LivePreviewFoldView.destroy()` still sweeps only `topLevelEmbeds()`. WHY:
1. **Redundant** — with the post-processor's own teardown, nested embeds are unmarked on
   plugin unload by their owner; the acceptance criteria pass without touching `destroy()`.
2. **Actively risky** — `destroy()` also runs while the plugin is ALIVE (view recreation).
   Unmarking a nested embed there would strip classes and chevron out from under a LIVE
   post-processor listener that `destroy()` cannot reach, leaving an embed that looks
   unfoldable but still toggles `fen-folded` on click. Live Preview must not undo marks it
   did not make.
The exploration notes anticipated exactly this ("worth checking whether destroy() still
needs to sweep nested embeds at all"). Say the word if you want it as belt-and-braces.

## How to verify

```bash
npm run lint && npm run build
npm run test:e2e -- e2e/live-preview-foldable-embeds.e2e.ts -g "strips its injected DOM from NESTED"
npm run test:e2e
```
Results on this tree: lint PASS (1 pre-existing warning, already ticketed:
`prefer-setting-definitions`), build PASS, e2e **43 passed** (`.tmp/e2e-full2.log`).
The new test was confirmed RED first for the right reason — `.cm-content .fen-embed`
expected 0, received 1 (`.tmp/e2e-fail-first.log`).

## Measured facts worth keeping (Obsidian 1.12.7)

- With the plugin off, a click on a nested embed's title has `defaultPrevented === false`
  and folds nothing — asserted, so the swallowed-click regression cannot come back.
- A **preview↔source round trip REUSES an already-rendered embed body**: the reloaded
  plugin's post-processor is never invoked over it, so the nested embed is NOT rewired by a
  mode switch. Reopening the note re-renders it and rewiring works (the test does that, with
  the reason spelled out). Consistent with the plugin's documented rule that a change lands
  on the NEXT render — but it means "re-enable the plugin" alone does not restore folding
  for embeds already on screen.

## Open questions / possible follow-ups

1. Want ticket part 3 anyway (see deviation above)? My recommendation: no.
2. Should a freshly enabled plugin ADOPT already-rendered embeds (a load-time sweep) instead
   of waiting for the next render? Would remove the "reopen the note" caveat above; it is a
   new behaviour, not part of this ticket — happy to file a ticket.
3. The WeakSet guard is not INDEPENDENTLY proven by a test (with teardown in place there is
   no leftover class left to block rewiring). It is stated as what it is: the guard no longer
   depends on DOM state, so guard and teardown cannot disagree.
