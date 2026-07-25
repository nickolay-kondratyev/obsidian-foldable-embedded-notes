# Implementation: unresolved-embed observer leak (nid_78cl6bo3t8umqbndughsbjez9_e)

> **Iteration 1 (post-review) supersedes parts of this file.** The ticket's design point 1
> (classify `file-embed` as settled) was WRONG and has been REMOVED: `mod-empty` means "target
> missing right now", and Obsidian upgrades that span in place when the note appears. See
> `IMPLEMENTATION_ITERATION__PUBLIC.md`. Current state: `MEDIA_EMBED_CLASSES` (no `file-embed`),
> a per-instance "already waiting" guard, and two extra e2e tests — **57 passed** in full.

## What changed

- **NEW `src/pendingEmbedObserver.ts`** — `PendingEmbedObserver extends MarkdownRenderChild`:
  ONE MutationObserver waiting for ONE embed, whose `containerEl` IS the embed span. Handed to
  `ctx.addChild`, so the observer is disconnected when the embed span leaves the DOM — for ANY
  reason an embed never resolves, not only the class lists we happen to know.
- **`src/foldableEmbedsPostProcessor.ts`**
  - `MEDIA_EMBED_CLASSES` → `NON_NOTE_EMBED_CLASSES`, with `file-embed` added (covers
    `![[notes.txt]]` = `file-embed mod-generic` AND `![[missing]]` = `file-embed mod-empty`).
    `isMediaEmbed` → `isNonNoteEmbed`.
  - `whenMarkdownEmbedReady` now takes `ctx`, bails synchronously when the embed has ALREADY
    settled as a non-note one, and otherwise creates/loads/`addChild`s a `PendingEmbedObserver`.
  - `liveObservers` is now `Set<PendingEmbedObserver>`; `teardown()` unloads them (was:
    `disconnect()`), and unload calls back into `forgetObserver`.
  - Stop-then-notify order preserved (`pending.unload()` before `onReady`), so `onReady`'s own
    DOM writes are not observed as further mutations of the same embed.
- **`e2e/unresolved-embed-observers.e2e.ts`** — new spec (3 tests).
- **CLAUDE.md** — new module documented; the post-processor bullet now states when the wait ends.

## Test evidence

Failing-test-first. Committed the spec against unchanged code, MEASURED:

```
Expected: <= 2      (observers after the first render)
Received:    6      (after three renders — the ticket's 2 -> 4 -> 6)
```
(`.tmp/e2e-failing.log`; the spec was commit `a952ca9`, the fix `2b80c06`.)

After the fix: `npm run test:e2e` → **55 passed, 0 failed** (`.tmp/e2e-full.log`,
`.tmp/e2e-full-final.log`). `npm run lint` → 0 errors, 1 PRE-EXISTING warning
(`obsidianmd/settings-tab/prefer-setting-definitions` on `foldableEmbedsSettingTab.ts`,
untouched by this work). `npm run build` clean.

The spec reads `plugin.postProcessor.liveObservers.size` via `page.evaluate`. Deliberate and
documented in the spec header: a leaked observer has NO user-visible surface, so a
production-side "count my observers" API would exist only for the test. The read throws if the
field is ever renamed, so it cannot silently pass.

## Measurements against real Obsidian 1.12.7 (throwaway probes in gitignored `.tmp/probe/`)

**(a) Can `file-embed` appear TRANSIENTLY on an embed that later resolves?** — NO.
`probeB-atcall.e2e.ts` wraps `whenMarkdownEmbedReady` in the renderer and logs the class list
at decision time plus every later mutation (`.tmp/probe/runB.log`):

```
CALL pb-child     :: internal-embed          MUT :: internal-embed markdown-embed inline-embed is-loaded
CALL pb-img.png   :: internal-embed          MUT :: internal-embed media-embed image-embed is-loaded
CALL pb-doc.txt   :: internal-embed          MUT :: internal-embed file-embed mod-generic is-loaded
CALL pb-missing   :: internal-embed          MUT :: internal-embed is-loaded file-embed mod-empty
```
Classes are assigned in ONE shot from a bare `internal-embed`, so classifying on `file-embed`
is correct, not merely convenient. The same measurement shows the ticket's "run the check on
the synchronous path too" is a NO-OP on a fresh render (the span is bare there) — it was still
kept, because it does fire over DOM Obsidian REUSES (a Live Preview widget's embed body), and
the code comment says exactly that instead of implying it guards the normal path.

**(b) Is `liveObservers` / the teardown loop still needed?** — YES.
`probeC-lifetime.e2e.ts` + `probeD-lpdisable.e2e.ts` against a PATCHED build (`file-embed`
removed from the class list AND teardown's observer loop + `clear()` removed), `.tmp/probe/runCD.log`:

```
PROBEC round=[0..2] observers=[2] [2] [2]     <- render-child lifetime ALONE stops the growth
PROBEC after-disable observers=[0]            <- reading view: disable unloads it anyway
PROBED live-preview observers=[1]
PROBED after-disable observers=[1] embedStillInDom=[1]   <- LP-nested: survives; loop earns its keep
```
First run of that experiment was INVALID (I had left `liveObservers.clear()` in, which zeroes
the count regardless of unload) and was redone — the numbers above are from the corrected run.

## Decisions / deviations

- **Both ticket design points implemented**, but design point 2 (render-child lifetime) is the
  load-bearing one: it alone holds the count flat (probe C). Design point 1 is the cheap
  additional bound that also stops pointless observation of a settled embed, now that
  measurement (a) proves the classification safe.
- **REJECTED: deleting `liveObservers`.** Measured (b): an observer on a Live-Preview-nested
  embed body survives plugin disable without the teardown loop.
- **REJECTED: a production test seam** (e.g. an exported observer count). The spec reaches into
  the instance `main.ts` already keeps; no product code knows it is under test.
- **REJECTED: `mod-empty` as the signal.** `file-embed` is the class that means "settled, and
  not a note"; `mod-empty` would miss `![[notes.txt]]` (`file-embed mod-generic`), which leaked
  identically.
- Out of scope, untouched: nested-embed teardown ticket nid_1ngosntduq5baizn9b7056h34_e. NOTE
  for whoever takes it: `PendingEmbedObserver` is a second worked example of the
  `MarkdownRenderChild` + owner-callback pattern that ticket wants, and `teardown()`'s two
  loops are now symmetric.

## Known limitations

- Live Preview's own extension is untouched; this is a reading-mode post-processor concern only.
- An observer stops when the embed span is REMOVED. An embed span Obsidian keeps forever and
  never settles (not observed in practice — every embed settled in a single mutation) would
  still hold one observer for as long as its DOM lives. That is bounded by the live DOM, which
  is the same bound `liveMarks` has.
