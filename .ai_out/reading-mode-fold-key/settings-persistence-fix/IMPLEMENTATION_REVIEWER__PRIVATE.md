# IMPLEMENTATION_REVIEWER — private notes (rehydration)

## Round 0 (predecessor instance)

Reviewed `9e5525c..HEAD` at `e45c52b`. Findings in `IMPLEMENTATION_REVIEW__PUBLIC.md`
(1 BLOCKING, 5 SHOULD-FIX, 4 NITs). Read-only on src/e2e.

Reasoning worth keeping:

- **B1 (cold cache) was a genuine REGRESSION**, not just an unfixed edge: the old line key was
  cache-independent, so cold and warm renders agreed. New key: cold writes `L…`, warm reads
  `occ…` → miss.
- **The cheap repair "on `occ` miss, read the `L` key" is WRONG** — it re-introduces the
  misattribution test 2 pins. The takeover the implementer built is NOT that: it fires only for
  the one positional key this very embed would have produced THIS render, and deletes it.
- **Ordinal alignment is safe** because `SEL_INTERNAL_EMBED` is `.internal-embed` (media
  included) and `EmbedCache` includes media too.
- **`waitForEmbedsWired` is not a vacuous barrier**: `markFoldable` → `ensureChevron` →
  `applyFoldState` is ONE synchronous block, so a chevron on the last embed means the fold
  projection already ran.

## Round 1 (this instance) — VERDICT READY, 0 BLOCKING

Reviewed `ee8b761`, `f0e7cd5`, `7c45b7c`, `e3dce98`. Public verdict:
`IMPLEMENTATION_ITERATION__PUBLIC.md`. Read-only on src/e2e — nothing changed in the main tree.

### Evidence I produced (do not redo)

- `.tmp/rev2-lint.log` (0 errors), `.tmp/rev2-build.log` (clean).
- `.tmp/rev2-e2e-{1,2,3}.log` — full suite × 3, 49 passed each.
- `.tmp/rev2-adopt-{1..8}.log` — `foldable-embeds.e2e.ts` × 8 on the product as is: 8/8 green,
  3.0s each.
- **REVERT PROOF** in a scratch worktree (since removed), removing ONLY the `adoptRecordingOf`
  call from `foldableEmbedsPostProcessor.makeFoldable`: **4 of 8 RED** at
  `foldable-embeds.e2e.ts:129`. Red runs take 18s, green 3.0s — the populations are obvious.
- **LINE-KEY SIMULATION** (`keyFor`'s `cached` forced to null), new e2e case 3 run alone with
  `npm run test:e2e -- -g "inserting an UNRELATED embed"`: RED. Note `npx playwright test`
  directly does NOT work — `OBSIDIAN_PATH` is exported by `scripts/run-e2e.sh`; always go
  through `npm run test:e2e`. In a worktree, symlink `node_modules` from the main checkout.

### Analysis I do not want to redo

- **The takeover cannot cross key families.** `section === null` ⇒ `current` is the `S…` key and
  `superseded` is `null`; `section !== null` ⇒ `superseded` is always an `L…` key. So an `occ`
  key never reclaims an `S…` recording. `getSectionInfo` → null is handled by never adopting.
- **Positional keys are unique within one render** (distinct section `lineStart`, or distinct
  `indexWithinSection`), so no same-render misadoption. Cross-render misadoption needs an EDIT
  inside the cold window — the documented residue, which the line key did unconditionally.
- **No leak / no double-write**: `has(toKey)` guards before mutation; delete+set keeps map size
  constant; after one adoption every later call is a `get` miss.
- **djb2 is still only computed on the `section === null` branch** — the takeover added no hot
  -path hashing.
- **`waitUntilIndexed` is legitimate scoping**, not flake suppression: one caller only, and the
  boot-window coverage it would have removed is demonstrably back (my 4-of-8 measurement).
- **Tests 1 & 2 were not softened**: their assertion bodies are byte-identical to `e5970b3`, and
  at `e5970b3` `openFile` had no index wait, so the red evidence predates the precondition.

### Non-blocking leftovers I deliberately did NOT escalate

- The boot-window guard is probabilistic (4/8), so one green CI run does not prove the takeover
  works. Suggested a comment; no product seam exists to make it deterministic.
- `waitUntilIndexed` has no explicit timeout message (inherited from the pre-existing style).
- `src/foldStateStore.ts:29` is a long doc line.
