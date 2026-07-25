# IMPLEMENTATION_ITERATION 1 — verdict (`nid_7qbtubxk89team9oadnl3hanr_e`)

Fresh IMPLEMENTATION_REVIEWER instance. Reviewed `git diff 9e5525c..HEAD` with focus on the 4
new commits (`ee8b761`, `f0e7cd5`, `7c45b7c`, `e3dce98`) on top of `e45c52b`.

## VERDICT: READY — 0 BLOCKING remaining.

The B1 cold-cache regression is genuinely fixed IN THE PRODUCT, and I proved it myself rather
than trusting the implementer's numbers.

## Verification I ran myself

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 1 pre-existing warning (`prefer-setting-definitions`) → `.tmp/rev2-lint.log` |
| `npm run build` | clean → `.tmp/rev2-build.log` |
| `npm run test:e2e` (full) × 3 | **49 passed** each → `.tmp/rev2-e2e-{1,2,3}.log` |
| `foldable-embeds.e2e.ts` × 8, product AS IS | **8/8 green**, 30 passed, 3.0s each → `.tmp/rev2-adopt-{1..8}.log` |
| **REVERT PROOF**: same spec × 8 in `.worktree/revert-proof` with ONLY the `adoptRecordingOf` call removed | **4 of 8 RED**, always `foldable-embeds.e2e.ts:129 "fold state survives leaving the note and coming back"`, `Received: "…is-loaded fen-embed"` (fold gone) |
| **REVERT PROOF**: `keyFor` forced onto the positional fallback (line-key simulation), new e2e case 3 alone | **RED** — `Expected pattern: /\bfen-folded\b/` |
| `git diff e5970b3..HEAD -- e2e/reading-mode-fold-key.e2e.ts` | tests 1 & 2 assertion bodies BYTE-IDENTICAL to the version that was red |
| No `sanity_check.sh` in the repo | n/a |

Worktree removed; `git worktree list` shows only the main tree; `git status` clean.

## 1. Is the BLOCKING regression genuinely gone?

**Yes, and it is falsifiable.** My revert proof is stronger evidence than the implementer's:
deleting only the 5-line `adoptRecordingOf` call turns the pre-existing behaviour test red in
**4 of 8** runs; restoring it gives 8 of 8 green plus 3 clean full suites. The failing runs cost
18s (retry timeout) versus 3.0s green, so the two populations are unmistakable. This is a real
guard, not a coincidence.

Scrutiny of the takeover, point by point:

- **Can it adopt the WRONG embed's fold?** Within one render, no. The positional key is
  `sourcePath::L<sectionLineStart>::src::#indexWithinSection`; two embeds of the same render
  cannot share it (distinct section `lineStart`, or distinct `indexWithinSection` inside one
  section). Cross-render, only if the document was EDITED between the cold render and the first
  warm one — which is exactly the residue documented at `src/embedFoldKeys.ts:80-82`, and which
  the LINE key did unconditionally. So the takeover is never worse than what it replaced.
- **Stale entry from an earlier session?** Impossible. `FoldStateStore` is an in-memory `Map`
  with no persistence; there is no cross-session state to adopt.
- **Can an `S<hash>` key be adopted by mistake?** No, and the branches are mutually exclusive by
  construction: `section === null` ⇒ `current` IS the `S…` key and `superseded` is `null`;
  `section !== null` ⇒ `superseded` is always an `L…` key. An `occ` key can therefore never
  reclaim an `S…` recording, nor vice versa. `getSectionInfo` returning null is handled — that
  path simply never adopts.
- **One-shot or repeating?** Effectively one-shot per key: the source entry is DELETED, so every
  later render's call is a no-op `get` miss. The repetition is a cheap map lookup, not a rewrite.
- **Leak / double-write?** No. `has(toKey)` short-circuits before any mutation, so an existing
  recording is never clobbered; the delete+set pair keeps the map size constant. Net cost of the
  whole mechanism on the hot path is one extra string join per warm render, and the djb2 hash is
  still computed ONLY on the `section === null` branch (I checked — `positionalFallbackKey` short
  -circuits on `lineStart !== undefined`).
- **SRP.** `FoldStateStore` gained a re-key operation on its own `Map`, not a second
  responsibility: it holds no knowledge of how keys are derived (that stays in `EmbedFoldKeys`).
  `EmbedFoldKey` as a named type instead of a `Pair`-ish tuple matches CLAUDE.md's "be classy".
  Acceptable as-is.

## 2. Failing-first evidence — not softened

`git diff e5970b3..HEAD -- e2e/reading-mode-fold-key.e2e.ts` touches only: the file/helper docs,
the new fixture, `waitForBothEmbedsWired` → `waitForEmbedsWired(expected)` (a parameterisation,
same two assertions), the `waitUntilIndexed` call, and the new case 3. **Every assertion in tests
1 and 2 is unchanged** from the run that was red. I also confirmed that at `e5970b3` the harness
`openFile` had NO index wait, so the red evidence was produced without today's precondition —
and the wait cannot rescue those tests anyway, since the line key is cache-independent.

Case 3 was never naturally red (the product already handled it), so I verified its power myself
by forcing `keyFor` onto the positional fallback: it goes RED with the right message. Honest
substitute, independently confirmed.

## 3. The remaining `waitUntilIndexed` opt-in — LEGITIMATE

Not flake suppression. Three reasons:

1. The blanket wait is genuinely gone: `openFile` no longer touches `metadataCache`, and
   `grep -rn waitUntilIndexed e2e/` shows exactly ONE caller,
   `reading-mode-fold-key.e2e.ts:106`.
2. The coverage it would have removed is demonstrably back: I measured
   `foldable-embeds.e2e.ts` catching the cold-cache regression 4 times in 8 runs. The harness doc
   comment's claim — "which is the only place it is guarded" — is TRUE.
3. What the wait hides for its own spec is the documented residue (fold recorded cold, then an
   EDIT before any re-render), which is not a regression and cannot be fixed by the takeover.
   The spec's subject is the edit; starting it from an indexed note is scoping, not evasion.

The implementer's self-correction here (first judged it cold-safe on a 6-run sample, then a full
run went red, then said so in writing) is the behaviour CLAUDE.md asks for. Credit, not a ding.

## 4. Predecessor's 9 other findings — confirmation

| # | Claimed | Confirmed |
|---|---|---|
| **B1** | fixed in product | **YES** — see §1; independently revert-proved. |
| **S2** "strictly less lossy" is false | removed | **YES** — gone from `src/embedFoldKeys.ts`; the ticket body now reads "a REGRESSION against the line key", plus an explicit retraction note. `grep` finds the phrase nowhere in `src/` or `_tickets/`. |
| **S3** `z4jq` frequency changed | documented | **YES** — `src/embedFoldKeys.ts:76-79` now states the line key handed the fold over "only when the survivor happened to land on the deleted embed's line, whereas an ordinal is inherited after a deletion ANYWHERE". Accurate. Ticket left OPEN. |
| **S4** harness wait narrower than claimed | blanket wait reverted, opt-in retained | **YES** — see §3. Sub-points 1-2 are genuinely moot now. Sub-point 3 (no timeout message) is inherited and left; agreed, not worth a round. |
| **S5** nested-embed mechanism unmeasured | reworded | **YES** — now "The mechanism is UNMEASURED: `ctx.getSectionInfo` is expected to return null…", conclusion kept. The word MEASURED stays load-bearing in that file. |
| **S6** CLAUDE.md duplicates the limits | trimmed | **YES** — 13 lines → 5, ending "documented ONCE, on the module". No knowledge duplicated. |
| NIT `getCache(): unknown \| null` | moot/fixed | **DONE** — typed `object | null` (the typing survived the revert, so it was fixed rather than deleted; better than claimed). |
| NIT locator constants inconsistent | fixed | **YES** — `LINE_LOCATOR` / `SECTION_HASH_LOCATOR` next to `OCCURRENCE_LOCATOR`, both used. |
| NIT over-long CLAUDE.md line | fixed | **YES** — rewrapped. |
| NIT no e2e for the per-link ordinal | fixed | **YES** — case 3, and I verified it goes red under a forced fallback. |

All 10 real, none nominal.

## 5. New defects introduced this round

None found. Comment-honesty sweep over every comment added in `ee8b761`/`f0e7cd5`/`7c45b7c`:
each claim is either true by construction (the `superseded`/`current` mutual exclusivity, the
delete-not-copy rationale, "no-op unless only `fromKey` has a recording") or one I measured (the
`foldable-embeds.e2e.ts` guard claim). No overstatement of the kind that opened this ticket.

## 💡 Suggestions (non-blocking, do NOT hold the merge)

- The boot-window guard is PROBABILISTIC — I measured it firing in 4 of 8 runs, so a single CI
  run can be green with the takeover broken. There is no product seam to force a cold cache, so
  this is the honest 80/20; worth one sentence in `foldable-embeds.e2e.ts` near that test so a
  future maintainer does not read a single green run as proof.
- `src/foldStateStore.ts:29` is a noticeably long doc line (lint does not flag it).

## Documentation updates needed

None. `CLAUDE.md`, `src/embedFoldKeys.ts`, both tickets and the harness comments are consistent
with the code as verified.

## Follow-ups for the human (unchanged by me)

- `nid_zf4num1ja4c9tpwpgj672ijgn_e` (cold cache): acceptance criterion now MET — the human's
  call to close.
- `nid_z4jq8me8mhstojozeua8fufdr_e` and `nid_zqaxj18jbxwnazzz8aeggz91u_e`: correctly still open.
- `nid_7qbtubxk89team9oadnl3hanr_e` can be closed.
