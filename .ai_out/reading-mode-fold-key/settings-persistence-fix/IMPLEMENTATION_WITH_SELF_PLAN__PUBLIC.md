# IMPLEMENTATION_WITH_SELF_PLAN — reading-mode fold key (nid_7qbtubxk89team9oadnl3hanr_e)

Branch `settings-persistence-fix`. Route taken: the ticket's PRIMARY design (occurrence key).
The 80/20 escape hatch was NOT needed — the occurrence key works, measured.

## What changed

| File | Change |
|---|---|
| `e2e/reading-mode-fold-key.e2e.ts` | NEW spec, written and run FAILING first. Both measured scenarios. |
| `src/embedFoldKeys.ts` | NEW. `EmbedFoldKeys` + the `ReadEmbeds` port + `EmbedOccurrence`. Owns the key, including the old key as fallback. |
| `src/foldableEmbedsPostProcessor.ts` | `buildKey`/`sectionHash` removed; now gathers an `EmbedOccurrence` and asks `EmbedFoldKeys`. Constructor takes the keys collaborator. |
| `src/main.ts` | Injects `new EmbedFoldKeys((p) => this.app.metadataCache.getCache(p)?.embeds ?? [])`. |
| `e2e/obsidianHarness.ts`, `e2e/obsidianAppApi.ts` | `openFile` waits until the file is INDEXED (see "the flake" below). |
| `CLAUDE.md` | New `src/embedFoldKeys.ts` bullet: identity, key shape, and its REAL stability guarantees/limits. |

Commits: `e5970b3` (failing spec), `83a79a6` (fix + docs + ticket).

## The key

`sourcePath::occ::<EmbedCache.link>::#<ordinalAmongSameLinkInThatNote>`

- Located by POSITION, never by string: the section's `[lineStart, lineEnd]` window selects the
  cache entries, then `indexWithinSection` picks this one. The DOM `src` ↔ `EmbedCache.link` join
  the exploration flagged as unmeasured is therefore not on the correctness path at all.
- Stable under insertions/deletions ABOVE (the bug), and under unrelated embeds added anywhere
  (only same-link embeds are counted).
- Shape composes with the linked tickets: opaque string, `::` delimiter, parseable `sourcePath`
  prefix for later per-file invalidation, one key per wired embed.
- Fallback (no section info / no usable cache) is EXACTLY the old key, under an `L…`/`S…` locator
  field, so occurrence keys and fallback keys can never collide. Its weakness (djb2 over the
  RENDERED section text, which contains the embedded child's body) is now stated honestly in the
  doc comment instead of being called "stable across re-renders".

## Measurements (all against real Obsidian 1.12.7, via a temporary `console.log` in `keyFor`)

1. **`MarkdownSectionInformation.text` is the WHOLE document**, not the section — `lineStart`/
   `lineEnd` index into it. (Noted for whoever considers parsing raw source later; not used here.)
2. **`span.src` DOES equal `EmbedCache.link`** for subpath embeds: `ref-child#Section A` and
   `ref-child#^blockid` matched exactly. Aliases (`![[a|c]]`) still unmeasured — and still
   irrelevant, since nothing joins on the string.
3. **Ordinal alignment holds**: an inline-code `` `![[ ]]-` `` (in `parent.md`) produces neither a
   rendered span nor a cache entry, so the two sequences stayed aligned.
4. **Staleness after an edit: NOT observed.** In the edit-then-reopen scenario the cache had
   already re-parsed; both new tests pass deterministically (7 consecutive full-suite runs).
5. **COLD cache at launch: OBSERVED, and it bit.** See below.

## The flake this uncovered (honest account)

The first full-suite run after the fix FAILED the pre-existing test
`e2e/foldable-embeds.e2e.ts` "fold state survives leaving the note and coming back". Instrumented
re-runs showed why: in ~1 run in 4, the FIRST render after Obsidian boots sees
`metadataCache.getCache("parent.md") === null` (vault index still building) — logged literally as
`"cached":null,"embeds":[]`. The fold was then stored under the fallback line key, and the later
warm-cache render looked it up by occurrence. Different key ⇒ fold lost.

Two separate consequences, handled separately and deliberately NOT conflated:

- **Product**: a fold made in that boot window does not survive the next render. Narrow (app start
  only) and strictly less lossy than the line key it replaces. Documented on `EmbedFoldKeys` and in
  `CLAUDE.md`, and filed as ticket **`nid_zf4num1ja4c9tpwpgj672ijgn_e`** (linked to this one) with
  the three repair options. NOT silently fixed inside this ticket.
- **Suite**: `ObsidianHarness.openFile` now waits for `metadataCache.getCache(path) !== null`. This
  is app READINESS (like the existing `layoutReady` wait), not an assertion — without it every fold
  spec randomly exercises the cold-cache fallback. It makes the suite deterministic; it does not
  make a wrong behaviour look right, and the doc comment on `openFile` says exactly that.

## Rejected

- **Joining `span.src` to `EmbedCache.link`** — unmeasured for aliases, and unnecessary.
- **Global embed index** instead of per-link ordinal — shifts when an unrelated embed is added
  above; per-link ordinal does not.
- **Parsing embeds out of the raw source** (now known to be reachable via `section.text`) to dodge
  the cache entirely — a second, sloppier markdown parser (code fences, escapes). Rejected on
  KISS/80-20; the metadata cache is the real parse.
- **Waiting for / retrying the metadata cache inside the plugin** — delays the fold projection and
  needs key-rename machinery in the store. Filed as the follow-up instead.
- **`page.waitForTimeout`** anywhere in the new spec — none used; every assertion is web-first.

## Out-of-scope tickets

- `nid_zqaxj18jbxwnazzz8aeggz91u_e` (nested embeds share ONE key): **not fixed, not regressed** —
  the occurrence is computed in the child note's coordinates, identically for every host.
- `nid_z4jq8me8mhstojozeua8fufdr_e` (later embed inherits a DELETED same-`src` embed's key):
  **NOT fixed** — deleting an earlier same-link embed makes the next one occurrence #0 and it
  inherits the fold, exactly as the exploration predicted. Do not close it.

## Test evidence

- Failing-first: `.tmp/e2e-foldkey-failing.log` (test 1), `.tmp/e2e-foldkey-failing-2.log` (test 2).
  Both fail with `expect(locator).toHaveClass(/\bfen-folded\b/)` on the embed the user folded —
  i.e. the fold was lost, the bug.
- After the fix: `.tmp/e2e-foldkey-after-fix.log` (2 passed), and full suite `.tmp/e2e-full-1..7.log`
  — **48 passed, 7 runs in a row**, including the `twins.md` independence test and the heading/
  block-ref test the exploration flagged as traps.
- `npm run lint`: 0 errors, 1 pre-existing warning (settings-tab declarative API).
- `npm run build`: clean (`tsc -noEmit` + esbuild).

## Residual risks

1. The cold-cache window (ticket filed above). The only known way to observe the new key regressing
   fold state relative to a warm session.
2. A stale (not cold) cache after a very fast edit→re-render could in principle select the wrong
   entry and misattribute, exactly as the line key always did. Not reproduced.
3. No unit tests — none can exist here (`nid_lcehddb2tdcq6qxztmhvhpgga_e` is open for a runner).
   `EmbedFoldKeys` is pure over the injected `ReadEmbeds` port, so it is a drop-in first candidate.
4. Key strings are not escaped: a `sourcePath` or link containing `::` could in theory collide.
   Pre-existing, unchanged, and only matters once someone parses the prefix.
