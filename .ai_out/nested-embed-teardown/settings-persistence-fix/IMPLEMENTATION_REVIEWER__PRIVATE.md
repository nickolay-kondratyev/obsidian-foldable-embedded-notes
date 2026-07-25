# IMPLEMENTATION_REVIEWER — private notes (rehydration)

Reviewed commit `622a483` on branch `settings-persistence-fix`. Verdict: **SHIP WITH FIXES**
(all must-fixes are doc/ticket honesty; no code correctness blocker found).
Public artifact: `IMPLEMENTATION_REVIEW__PUBLIC.md` in this dir.

## What I actually verified (so a rehydrated me does not redo it)

- `npm run lint` exit 0 (1 pre-existing ticketed warning), `npm run build` exit 0.
  Logs: `.tmp/rev-lint.log`, `.tmp/rev-build.log`. Did NOT run e2e (trusted 43/43).
- Read in full: `src/foldableEmbedsPostProcessor.ts`, `src/foldableEmbedMark.ts`,
  `src/wiredElements.ts`, `src/embedFoldDom.ts`, `src/livePreview/livePreviewFoldExtension.ts`,
  `src/main.ts`, `styles.css`, the new e2e test + `e2e/foldAssertions.ts`, the ticket.
- `node_modules/obsidian/obsidian.d.ts`: `Component.addChild` = "Adds a child component,
  **loading** it if this component is loaded" (never unloads);
  `MarkdownPostProcessorContext.addChild` = child unloads when its `containerEl` is removed.
  This is the evidence behind MUST-FIX #1.

## Key reasoning I do not want to reconstruct

- **Part-3 rejection ACCEPTED.** Invariant: marked ⟺ live mark in `liveMarks`
  (registry add precedes DOM marking; the only exit is `onunload`, which unmarks in the same
  call; LP never marks nested). And the risk argument is concrete because `styles.css:21`
  collapses on `.fen-folded` alone — so an LP `destroy()` during a live-plugin view
  recreation would leave an embed that still collapses but loses `.fen-embed`'s
  forced-visible title styling.
- **Double ownership is safe.** `makeFoldable` bails while `wiredEmbeds.has(embed)`, and the
  embed leaves `wiredEmbeds` only in the same call that unmarks → an old mark can never
  unmark DOM a newer mark owns. `Component.unload()` is `_loaded`-guarded → no double
  `onunload`. Manual `mark.load()` is load-bearing (unloaded component ignores `unload()`).
- **WeakSet is per-instance** (`FoldableEmbedsPostProcessor` field, constructed in `onload`;
  LP's is per-view). No module-level singleton. Both former class guards gone (`:81`, `:187`).
- **e2e AC2 is strong**: in-page `dispatchEvent` + synchronous read of
  `folded`/`defaultPrevented`, throws if the nested embed is missing → non-vacuous.

## Must-fix list (short)

1. `foldableEmbedsPostProcessor.ts:114-115` "addChild can unload it right away" contradicts
   the documented API; also restate the boundedness WHY in `foldableEmbedMark.ts:23-25` /
   `foldableEmbedsPostProcessor.ts:30-33` as "child unloads when containerEl is removed".
2. AC3 only holds after reopening the note (plugin UPDATE = disable+enable → nested embeds
   silently unfoldable until reopen). Record in ticket Notes + file the load-time-adoption
   follow-up ticket; human to sign off on the deviation and on skipping ticket part 3.

Optional items (3–8 in the public doc): cross-mode double-wiring net removed with the class
guard; `EmbedFoldDom.unmark:106` unscoped chevron `querySelector`; `liveMarks` + `wiredEmbeds`
DRY into one `Map`; e2e `toBeAttached()` before the count-0 asserts; embed re-attach loses
marks; `onload` await/disable race (pre-existing).
