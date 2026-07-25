# IMPLEMENTATION_WITH_SELF_PLAN — reading-mode fold key (nid_7qbtubxk89team9oadnl3hanr_e)

Branch `settings-persistence-fix`. Route taken: the ticket's PRIMARY design (occurrence key).
The 80/20 escape hatch was NOT needed — the occurrence key works, measured.

**Review iteration 1 (fresh instance) — see the last section for what the review changed.**
The BLOCKING finding is **RESOLVED IN THE PRODUCT**, not escalated.

## What changed

| File | Change |
|---|---|
| `e2e/reading-mode-fold-key.e2e.ts` | NEW spec, written and run FAILING first. Two measured scenarios + (iteration 1) a third pinning the PER-LINK ordinal. |
| `src/embedFoldKeys.ts` | NEW. `EmbedFoldKeys` + the `ReadEmbeds` port + `EmbedOccurrence` + (iteration 1) `EmbedFoldKey`. Owns the key, including the positional fallback. |
| `src/foldStateStore.ts` | (iteration 1) `adoptRecordingOf` — the cold-cache takeover. |
| `src/foldableEmbedsPostProcessor.ts` | `buildKey`/`sectionHash` removed; gathers an `EmbedOccurrence`, asks `EmbedFoldKeys`, and runs the takeover before reading the fold. |
| `src/main.ts` | Injects `new EmbedFoldKeys((p) => this.app.metadataCache.getCache(p)?.embeds ?? [])`. |
| `e2e/obsidianHarness.ts`, `e2e/obsidianAppApi.ts` | (iteration 1) the index wait added in iteration 0 is REVERTED — `openFile` is back to what it was, with a comment saying WHY it must not wait. |
| `CLAUDE.md` | `src/embedFoldKeys.ts` bullet: identity, key shape, takeover, and a pointer to the module for the limits (no longer duplicated). |

Commits: `e5970b3` (failing spec), `83a79a6` (fix + docs), `ee8b761` (iteration 1: takeover +
harness revert + third e2e case), plus a docs commit.

## The key

`sourcePath::occ::<EmbedCache.link>::#<ordinalAmongSameLinkInThatNote>`

- Located by POSITION, never by string: the section's `[lineStart, lineEnd]` window selects the
  cache entries, then `indexWithinSection` picks this one. The DOM `src` ↔ `EmbedCache.link` join
  the exploration flagged as unmeasured is therefore not on the correctness path at all.
- Stable under insertions/deletions ABOVE (the bug), and under unrelated embeds added anywhere
  (only same-link embeds are counted — now pinned by e2e case 3).
- Fallback (no section info / no usable cache) is EXACTLY the old key, under an `L…`/`S…` locator
  field, so occurrence keys and fallback keys can never collide.
- **The takeover (iteration 1).** `keyFor` returns `{ current, superseded }`: when it CAN derive
  the occurrence key it also reports the positional key the very same embed would have got from a
  cold-cache render. `FoldStateStore.adoptRecordingOf(superseded, current)` moves a recording
  found under the old key and DELETES it, so nothing that later occupies that line inherits it.
  No events, no waits, no retries: the next render is the notification.

## Measurements (all against real Obsidian 1.12.7)

1. `MarkdownSectionInformation.text` is the WHOLE document, not the section.
2. `span.src` DOES equal `EmbedCache.link` for subpath embeds. Aliases still unmeasured, still
   irrelevant (nothing joins on the string).
3. Ordinal alignment holds (inline-code `` `![[ ]]-` `` produces neither span nor cache entry).
4. Staleness after an edit: NOT observed for edit-then-reopen.
5. COLD cache at launch: OBSERVED. Quantified in iteration 1 — see below.

## The cold-cache window: what iteration 1 measured and fixed

The reviewer's B1 was CORRECT: the cold window was a REGRESSION, because the line key it replaced
was cache-independent and kept that fold. Iteration 1 treated it as such.

- **Failing-first, in the product's own guard.** Reverted the harness index wait, then ran
  `foldable-embeds.e2e.ts` 6 times: **2 RED**, both at `:129 "fold state survives leaving the note
  and coming back"`, `Received: "…fen-embed"` (the fold gone). Logs `.tmp/pre-fix-run-{1..6}.log`.
- **After the takeover:** 8 runs of that spec, **8 green** (`.tmp/post-fix-run-{1..8}.log`).
- **Proof the takeover is what did it** (not luck): a temporary `console.log` in
  `adoptRecordingOf`, 6 runs → it fires in **2 of 6**, the same proportion as the failures, always
  `parent.md::L4::child::#0` → `parent.md::occ::child::#0` with `folded=true`. Instrumentation
  removed afterwards.
- **`reading-mode-fold-key.e2e.ts` does not need a wait either**: instrumented `keyFor`, 6 runs →
  **0 cold-cache derivations**. That spec opens its note inside the first test rather than in
  `beforeAll`, which is late enough. Measured, not assumed.

### Options considered for B1, and why this one

| Option | Verdict |
|---|---|
| **Takeover of the superseded key (chosen)** | ~25 lines, one concept, no new lifecycle, self-cleaning, and the pre-existing e2e proves it. |
| Defer wiring until `getCache !== null` (reviewer's suggestion) | REJECTED: on a large vault the index takes seconds, so every embed that should START folded would render expanded and then pop shut. A worse, more visible regression than the one being fixed. |
| Re-key on `metadataCache.on("resolved")` | REJECTED: needs an event port + per-mark subscription lifetime, and is UNTESTABLE (a cold cache cannot be reproduced on demand). The takeover gets the same result from the next render. |
| Look up the `L` key on any `occ` miss | REJECTED, as the reviewer said: it would misattribute after an edit. The takeover is not this — it only ever fires for the ONE positional key this embed itself would have produced this render, and removes it. |
| Compute the ordinal from the DOM instead of the cache | REJECTED: reading mode renders sections lazily, so "all embeds of the note" is not in the DOM at wiring time. |
| Parse embeds out of the raw source | REJECTED (unchanged): a second, sloppier markdown parser. |

**Honest residue** (documented on `EmbedFoldKeys`, NOT claimed fixed): a fold made in the cold
window AND followed by an edit before any re-render can still land on whatever embed now sits on
that line — which is exactly what the line key did unconditionally. So the new key is no worse
than its predecessor anywhere, and better everywhere else.

## Review findings — disposition (1 BLOCKING, 5 SHOULD-FIX, 4 NITs)

| # | Disposition | What was done |
|---|---|---|
| **B1** cold window is a regression | **INCORPORATED (fixed in product)** | The takeover; harness wait reverted; measured above. No human sign-off needed because the trade no longer exists. |
| **S2** "strictly less lossy" is false | **INCORPORATED** | Sentence deleted from `src/embedFoldKeys.ts`; the ticket body now says REGRESSION; a retraction note added to the ticket. |
| **S3** `z4jq` frequency changed | **INCORPORATED** | `EmbedFoldKeys` now says the line key had the same FLAW but not the same frequency (line-coincidence vs. any deletion in the note). `z4jq` stays OPEN. |
| **S4** harness wait narrower than claimed | **INCORPORATED by REMOVAL** | The wait is gone, so all three sub-points (stale-but-non-null, nested `sourcePath`, no timeout message) are moot. `openFile`'s comment now says why it must NOT wait. |
| **S5** nested-embed mechanism unmeasured | **INCORPORATED** | Reworded to state the mechanism as EXPECTED/UNMEASURED, keeping the conclusion. Not measured: it belongs to `nid_zqaxj18jbxwnazzz8aeggz91u_e`, which is out of scope. |
| **S6** CLAUDE.md duplicates the limits | **INCORPORATED** | Bullet trimmed to identity + shape + takeover + "limits are documented ONCE, on the module". |
| NIT `getCache(path): unknown \| null` | **MOOT** | The whole `metadataCache` typing is deleted with the wait. |
| NIT locator constants inconsistent | **INCORPORATED** | `LINE_LOCATOR` / `SECTION_HASH_LOCATOR` added next to `OCCURRENCE_LOCATOR`. |
| NIT over-long CLAUDE.md line | **INCORPORATED** | Rewrapped. |
| NIT no e2e for the per-link ordinal | **INCORPORATED** | Third case in `reading-mode-fold-key.e2e.ts`; VERIFIED it goes RED when key derivation is forced onto the positional fallback (`.tmp/foldkey-t3-linekey-sim.log`). |

Nothing was rejected: every finding was either correct or made moot by the B1 fix.

## Out-of-scope tickets

- `nid_zqaxj18jbxwnazzz8aeggz91u_e` (nested embeds share ONE key): not fixed, not regressed.
- `nid_z4jq8me8mhstojozeua8fufdr_e` (later embed inherits a DELETED same-`src` embed's key):
  **NOT fixed** — confirmed again. Do not close it; its frequency framing is now documented.
- `nid_zf4num1ja4c9tpwpgj672ijgn_e` (cold cache): its acceptance criterion is now MET. Left open
  for the human to confirm the close; a note records the fix and the measurements.

## Test evidence (iteration 1)

- `npm run lint`: 0 errors, 1 pre-existing warning. `npm run build`: clean.
- **Full suite: 4 consecutive runs, 49 passed each** (`.tmp/full-{1..4}.log`) — 48 pre-existing + 1
  new case.
- Plus, targeted at the cache race: 6 pre-fix runs of `foldable-embeds.e2e.ts` (2 red), 8 post-fix
  (all green), 6 instrumented (all green, takeover firing twice), 6 runs of
  `reading-mode-fold-key.e2e.ts` (all green, 0 cold derivations).

## Residual risks

1. The cold-window-then-edit residue described above. Documented, not fixed, no ticket: it is
   strictly inside `nid_z4jq…`/line-key territory and is not a regression.
2. A STALE (not cold) cache after a very fast edit→re-render could misattribute, as the line key
   always did. Not reproduced.
3. `reading-mode-fold-key.e2e.ts` is not COLD-proof by construction, only by measurement (0/6). If
   it ever flakes on slower CI, the fix is a spec-local index wait, not a global one.
4. No unit tests — none can exist here (`nid_lcehddb2tdcq6qxztmhvhpgga_e` is open for a runner).
   `EmbedFoldKeys` and `FoldStateStore.adoptRecordingOf` are pure and are the first candidates.
5. Key strings are not escaped: a `sourcePath` or link containing `::` could in theory collide.
   Pre-existing, unchanged.
