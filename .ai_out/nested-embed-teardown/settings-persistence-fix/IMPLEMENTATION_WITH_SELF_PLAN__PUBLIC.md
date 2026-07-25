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

## Iteration 1 — response to `IMPLEMENTATION_REVIEW__PUBLIC.md` (verdict: SHIP WITH FIXES)

Changes in this iteration are **comment/doc/ticket only** — `git diff` touches `CLAUDE.md`,
two doc comments in `src/`, and two ticket files. **The e2e suite was NOT re-run**, deliberately:
nothing executable changed. Lint PASS (exit 0, the one pre-existing ticketed
`prefer-setting-definitions` warning), build PASS (exit 0) — `.tmp/iter1-lint.log`, `.tmp/iter1-build.log`.

### MUST-FIX — both ACCEPTED

**#1 — wrong WHY in three comments.** Verified against `node_modules/obsidian/obsidian.d.ts`
before rewriting (I did not swap one guess for another):
- `Component.addChild` — *"Adds a child component, loading it if this component is loaded"*.
  It never unloads. The old *"adding the child can unload it right away"* was simply false and is gone.
- `MarkdownPostProcessorContext.addChild` — *"if the containerEl of the child is ever removed,
  the component's unload will be called"*. That is the real trigger, and `containerEl` here is
  the embed span. Both boundedness comments (`src/foldableEmbedMark.ts`,
  `FoldableEmbedsPostProcessor.liveMarks`) now state it, and say plainly that it does NOT fire on
  plugin disable (nothing removes the span) — which is what `teardown()` is for.
- `ctx.addChild(mark)` is still the last statement, but the comment now says the ordering is
  **not** load-bearing (it just hands over a fully wired mark) instead of inventing a reason.

**#2 — AC3 holds only after REOPENING the note.** Recorded in three places, none of them
overstating: `CLAUDE.md` (a "KNOWN LIMITATION, measured" sub-bullet under `foldableEmbedMark.ts`,
including the contrast with Live Preview's top-level embeds, which `registerEditorExtension`
rebuilds immediately), a note on the open ticket (`nid_1ngosntduq5baizn9b7056h34_e`, together
with the part-3 rejection rationale so it is not re-fixed later), and a new follow-up ticket
`nid_o44oqs41s0z21xttblyk513v7_e` ("adopt already-rendered embeds on plugin load"). The e2e
comment at the navigate-away-and-back step was already accurate and was left alone.
Also done, as the reviewer asked: a cross-reference note on the closed ticket
`nid_tto6kyjdm8dsi86mvvnqey2sh_e` so it no longer reads as contradicting the code.

### OPTIONAL — ticketed rather than done here

Per the iteration's comment-only scope, each of these is a code change and would have forced a
full e2e re-run; all are filed with the reproduction and the suggested fix, none are dropped:
- **#4** unscoped chevron query in `EmbedFoldDom.unmark` → `nid_5w4yyxmghxg4zteq5xjmdrxd9_e`
  (real hardening now that nested embeds are marked; safe today only by document order).
- **#3** no cross-mode double-wiring net → `nid_afu1pcd19esc3v9i2xckicrtq_e` (latent, unmeasured;
  the ticket says to look for a failing case FIRST and close as WONTFIX if none exists).
- **#8** disable racing `onload`'s `await settings.load()` → `nid_9bvqz2a3rzved4u2pci21tyfr_e`.
- **#6** count-0 assertions that could fail at the wrong line → `nid_856xzuo22pkposozpsvbkd8x5_e`.

### OPTIONAL — REJECTED

- **#5 (DRY: merge `liveMarks` + `wiredEmbeds` into one `Map`)** — rejected: the pair is added and
  removed in exactly one place each, and merging them changes `WiredElements` from a WeakSet to a
  strongly-retaining Map for a two-line saving. Not worth touching working teardown code.
- **#7 (embed span detached and re-attached without a re-render loses its marks)** — nothing to do:
  the reviewer filed it as "watch", it is unobserved, and the failure mode (no folding until the
  next render) is the plugin's documented rule, not a leak.

### Readiness

**READY TO SHIP.** No code-correctness blocker was raised; both MUST-FIX items are addressed and
verified against the type definitions. The one thing still needing the human's word is
acceptance of the AC3 ship-state (nested embeds regain folding on the next render, i.e. after
reopening the note) before the ticket is closed.

## Open questions / possible follow-ups

1. Want ticket part 3 anyway (see deviation above)? My recommendation: no.
2. Should a freshly enabled plugin ADOPT already-rendered embeds (a load-time sweep) instead
   of waiting for the next render? Would remove the "reopen the note" caveat above; it is a
   new behaviour, not part of this ticket — happy to file a ticket.
3. The WeakSet guard is not INDEPENDENTLY proven by a test (with teardown in place there is
   no leftover class left to block rewiring). It is stated as what it is: the guard no longer
   depends on DOM state, so guard and teardown cannot disagree.
