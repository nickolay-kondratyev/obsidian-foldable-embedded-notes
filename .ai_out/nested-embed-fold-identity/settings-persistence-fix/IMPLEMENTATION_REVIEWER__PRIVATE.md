# IMPLEMENTATION_REVIEWER — private working notes (run 1)

Diff reviewed: `fd2a9e2..HEAD` (ce2e132 specs, afc21eb fix, cc4d59a docs, 0dbf25a writeup).
Verdict written: NOT-READY, 2 SHOULD-FIX (F1 doc lie about LP, F2 dead superseded branch),
1 NICE-TO-HAVE (F3 miss re-collides), 1 NIT (F4 slot lifetime).
Public file: `IMPLEMENTATION_REVIEW__PUBLIC.md` in this dir.

## Commands I ran (all reproducible)

Obsidian binary: `/home/node/.cache/obsidian-e2e/obsidian-1.12.7/obsidian`
(from `bash scripts/setup-obsidian-bin.sh | tail -1`).

- `npm run lint` → exit 0, 1 warning (pre-existing, settings tab, prefer-setting-definitions).
- `npm run build` → exit 0.
- `npm run test:e2e` → **51 passed (8.4s)**, exit 0. Log `.tmp/review-e2e.log`.
- RED check: `git worktree add .worktree/review-red ce2e132`, symlink node_modules from main
  repo, `OBSIDIAN_PATH=... npm run test:e2e -- foldable-embeds.e2e.ts -g "NESTED"` →
  twins spec FAILED with `Received string: "... fen-embed fen-folded"`; cross-note spec `-`
  (serial skip). Re-ran `-g "ANOTHER host note"` → FAILED same output. Logs
  `.tmp/review-red.log`, `.tmp/review-red2.log`. Worktree removed.
- LP probe (the decisive evidence for F1): worktree at HEAD, added throwaway
  `e2e/review-probe.e2e.ts` (host A / host B each `![[probe-child]]`, child embeds
  `![[probe-grand]]`; open A in LP, click nested title, open B in LP, assert unfolded) →
  FAILED: B's nested embed came up `fen-folded`. Log `.tmp/review-probe.log`. Probe deleted,
  worktree removed, `git status` clean.

## Reasoning chains worth keeping

**F1 (LP cross-note)**: unseen host key = `host::<hostSrc>`; hostSrc is the CHILD link, same in
every host note. Nested own key comes from the child's ctx: same sourcePath, `section === null`
→ same `S<hash>` over the same rendered text, same src, same index. ⇒ identical full key across
host notes. `embedFoldKeys.ts:151-152` claims "different notes no longer do [share]" — false.
CLAUDE.md's bullet understates it too ("same note" only). Empirically confirmed.

**F2 (dead superseded)**: `own.superseded !== null` ⟺ `cachedOccurrenceOf` answered ⟺
`section !== null`. Nested embeds ALWAYS have `section === null` (measured, documented at
embedFoldKeys.ts:90-92). So `nestedIn` always returns `superseded: null`; the host-superseded
qualification never runs. Cold→warm host key change (`::L2` → `::occ::`) therefore strands the
nested fold. Pre-diff, nested keys were cache-independent, so this is a narrow NEW regression.
Suggested fix: qualify with `host.superseded ?? host.current` and `own.superseded ?? own.current`,
return null only when it equals `current`.

**F3**: on a registry miss, twins in one note collapse to the same `host::<src>` prefix AND the
same own key ⇒ same full key ⇒ the original bug, with no takeover path (because of F2). Measured
zero misses in reading view, so acceptable, but the doc should say "re-collides" not "degrades".

## Things I checked and found FINE (don't re-litigate)

- Registration synchronous in `process()` forEach before any await → ordering claim structurally
  sound; SEEN-not-WIRED is the right axis.
- Depth 3+ composes via recursion from `parentElement.closest`.
- `::in::` cannot collide with `occ`/`L`/`S` shapes in practice.
- e2e barrier (`waitForNestedEmbedsWired` on chevron) is sound: chevron injected in the same
  sync block as applyFoldState.
- `expectFreshElement` used before the guarded assertions — real re-render proven.
- `-g` re-run is serial-mode skip, not spec-isolation leakage; fixtures are distinct notes.
- No specs/assertions removed or weakened (e2e diff is additions only). foldStateStore untouched.
- SRP/DRY/naming/constants all good; registry is justified, 95 lines, right home.

## If asked to re-review after fixes

Check: (a) embedFoldKeys.ts:150-152 + CLAUDE.md LP wording corrected; (b) nestedIn superseded
either fixed or the comment corrected; (c) registry doc says a miss re-collides; (d) follow-up
ticket for LP nested identity exists; (e) suite still 51+ green.

---

# RUN 2 (re-review of iteration 1) — fresh instance, same role

Diff: `0f27551..HEAD` (7418749, 21e1e75, 575edaa). Verdict: **READY**, 0 blocking,
0 should-fix, 4 NITs (N1 2^N growth undocumented in code, N2 "at most one recording"
slightly overstated, N3 .gitignore CRLF→LF wholesale rewrite, N4 `__fenOriginalGetCache`
on the ObsidianApp interface). None worth another round.

## Commands (all mine, reproducible)

Obsidian: `/home/node/.cache/obsidian-e2e/obsidian-1.12.7/obsidian`.

- `npm run lint` → exit 0, 1 pre-existing warning. `.tmp/rr-lint.log`
- `npm run build` → exit 0. `.tmp/rr-build.log`
- `npm run test:e2e` → **52 passed (9.2s)**, exit 0, grep for skipped/flaky → none.
  `.tmp/rr-e2e-full.log`
- Revert check, worktree `.worktree/rr-revert` at HEAD (node_modules symlinked), ONLY
  `nestedIn` patched, spec `nested-fold-cold-start.e2e.ts`:
  - variant A = original pre-review semantics → **1 failed**, `unexpected value
    "internal-embed markdown-embed inline-embed is-loaded fen-embed"` at spec line 96
    (`.tmp/rr-revertA.log`).
  - variant B = MY run-1 suggested 2-line fix → **1 failed** (`.tmp/rr-revertB.log`).
  Worktree removed, `git worktree prune`, `git status` clean.
- `git diff 0f27551..HEAD --stat` on `e2e/foldable-embeds.e2e.ts`, `e2e/foldAssertions.ts`,
  `e2e/reRenderGuard.ts`, `src/foldStateStore.ts` → EMPTY. Original specs untouched.

## Reasoning worth keeping

**Why my run-1 F2 fix was wrong.** I assumed the two halves of a nested key warm together.
They do not: the own half reads the CHILD note's cache, the host half the HOST note's, so
warm-own/cold-host is a real state. Single-superseded covers exactly one of the 3 possible
colder combinations; the product covers all. Lesson: when a composite key has independently
sourced components, the "colder version of this key" is a SET, not a value.

**Sibling re-merge (the thing I most feared) does NOT happen.** All candidates are
`{hostCur, hostSup} × {ownCur, ownSup}`. Siblings share the own half entirely but never the
host half — warm hosts differ by occurrence ordinal (`#0`/`#1`), cold hosts by
`section.lineStart` (separate paragraphs) or by `indexWithinSection` (same paragraph), and
the positional key carries BOTH. Disjoint candidate sets ⇒ no cross-adoption. Also no
cross-shape collision: `L`/`S` locator can never equal `occ`.

**Bound.** `keyFor` returns supersededKeys of length 0 or 1 ⇒ 2 candidates per level ⇒ 2^N
total, N = nesting depth (2–3 real). No duplicates possible (locator fields differ).

**Partial-warmth chain composes**: cold/cold → (hostL,ownS); warm-own/cold-host render has
current (hostL,ownOcc) + superseded [(hostL,ownS)] and adopts; fully warm adopts (hostL,ownOcc).
Every intermediate state is a link in the chain.

**Spec non-vacuity is structural, not just observed**: it fails at the final THEN (line 96),
after `expectFreshElement`, so it cannot go red for a setup reason.

## If asked to review this area again

- The LP nested identity gap is ticket `nid_jdpdpu7w0nfda3y4decz7f6xy_e` — do NOT re-raise it
  as a finding here; it is correctly scoped out and honestly documented in 3 places.
- Don't re-litigate: registry design, WeakMap lifetime, ordering, `::in::` collision safety,
  the miss-re-collides fallback — all checked in run 1 and unchanged.
