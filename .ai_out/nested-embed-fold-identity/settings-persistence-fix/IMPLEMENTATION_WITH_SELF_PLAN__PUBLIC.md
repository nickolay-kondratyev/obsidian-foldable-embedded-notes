# IMPLEMENTATION (self-plan) — nested-embed fold identity

Ticket `nid_zqaxj18jbxwnazzz8aeggz91u_e`. Branch `settings-persistence-fix`.
Commits: `ce2e132` (failing specs) → `afc21eb` (fix) → `cc4d59a` (measured ordering + docs)
→ **`7418749`** (review F1/F3/F4 + first F2 attempt) → **`21e1e75`** (F2, measured properly).

## What changed and WHY (original pass — unchanged, summary)

- **`src/embedFoldKeys.ts`** — `nestedIn(host, own)` → `` `<hostKey>::in::<ownKey>` ``, plus
  `unseenHostKey(src)` for a host the post-processor never saw. Key SHAPE lives here only.
- **`src/embedFoldKeyRegistry.ts`** (new) — `WeakMap<embed span, KeySlot>`, registered
  SYNCHRONOUSLY in `process()`, derived LAZILY and MEMOISED; `hostKeyOf` recurses through the
  whole nesting chain. Ordering is structural (an embed BODY is post-processed only after the
  section holding its host span was) and was MEASURED with a throwaway probe: zero misses in a
  reading view.
- **`src/foldableEmbedsPostProcessor.ts`** — registers each span, resolves the pending key.
- Two e2e specs (sibling independence across a reopen; cross-note no-bleed), both reproduced
  RED at `ce2e132` by the reviewer independently.

---

# REVIEW ITERATION 1 — disposition of every finding

## F1 — "Live Preview cross-note no longer shares" is FALSE — **ACCEPTED**

The reviewer disproved it with an LP probe, and re-reading the code confirms it: an unseen
host's key is `host::<src>`, identical in every host note, and the nested own key is identical
too. Corrected in three places, and the honest statement is now "in Live Preview nested embeds
share ONE fold state across ALL hosts — same note and different notes alike; pre-existing,
unchanged by this key":

- `src/embedFoldKeys.ts` → `unseenHostKey` doc.
- `src/embedFoldKeyRegistry.ts` → module doc (see F3).
- `CLAUDE.md` → registry bullet.

Follow-up ticket filed as the reviewer asked: **`nid_jdpdpu7w0nfda3y4decz7f6xy_e`** — "Live
Preview: nested embeds share ONE fold state across all hosts", with an acceptance criterion
that names the two e2e cases. Referenced from both code sites and CLAUDE.md.

No product code changed for F1: the behaviour is pre-existing and out of this ticket's scope
(reading-mode identity). Only the lies were removed.

## F2 — the superseded branch is dead — **ACCEPTED, and the suggested fix was NOT sufficient**

The finding is correct and the defect is real. The suggested 2-line fix is not, and I only
found that out by MEASURING — which is the substance of this iteration.

**Attempt 1** (commit `7418749`) was the reviewer's shape: one superseded key, each half
falling back to its own current key.

**Attempt 1 was still RED.** A temporary probe (logging every derived key, since removed)
against real Obsidian 1.12.7 shows why — the two halves of a nested key warm up
INDEPENDENTLY:

```
COLD render (host note hidden from getCache):
  host   CUR=[cold-host.md::L2::cold-child::#0]  SUP=[]
  nested CUR=[cold-host.md::L2::cold-child::#0::in::cold-child.md::occ::cold-grandchild::#0]
                              ^^ WEAK host                          ^^^ STRONG own half
WARM re-render:
  nested CUR=[cold-host.md::occ::cold-child::#0::in::cold-child.md::occ::cold-grandchild::#0]
```

The fold sits under `L2 … :: in :: … occ …`. The original code produced no superseded key at
all; the reviewer's form produces `L2 … :: in :: … L2 …` — the both-weak combination, which
nothing ever recorded under. Neither reclaims the recording.

**The fix actually shipped** (commit `21e1e75`): `EmbedFoldKey.superseded: string | null`
becomes `supersededKeys: readonly string[]`. `nestedIn` returns EVERY combination of the two
levels' `[current, ...superseded]` keys minus `current`; the post-processor adopts from each in
turn, and `FoldStateStore.adoptRecordingOf`'s existing "target already recorded → return" guard
makes every attempt after the first a no-op. `keyFor` returns `[]` or `[positionalKey]`.
`FoldStateStore` itself is UNCHANGED.

Cost: one extra field type change and a 4-line `flatMap`. Depth-N nesting yields 2^N−1
candidates, and N is 2–3 in practice.

Also corrected while there: the module doc claimed `ctx.getSectionInfo` "answers null for an
embed body" — measured above, it answers a real section for some embed bodies. The doc now
says either derivation can happen and that the collision holds regardless (which is the point).

### F2 evidence — deterministic RED/GREEN, all runs mine

New spec `e2e/nested-fold-cold-start.e2e.ts` (own Obsidian instance) folds a nested embed while
its host note is unindexed, then re-renders it warm and asserts the fold survived.

**Why the cold window is INJECTED and not raced for — measured first.** My first version of
this spec just opened a note right after launch. It passed **6/6 with the takeover reverted** —
vacuous. A probe then showed why: `getCache` already answers for every fixture by the time the
harness has a workspace and the plugin enabled (`cacheAtOpen=[WARM]` in 3/3 runs). So
`ObsidianHarness.withUnindexedNote(path, body)` replaces exactly the ONE call the plugin makes
(`app.metadataCache.getCache`, see `main.ts`) for exactly ONE path, and restores it in a
`finally`. No product code knows it is under test. I judged this a legitimate fault injection
rather than a hack, and said so on the method; the alternative was a spec that cannot fail.

| Variant of `nestedIn` | Result |
|---|---|
| ORIGINAL (pre-review, `own.superseded === null ? null : …`) | **1 failed** — `Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed"` (no `fen-folded`) |
| The REVIEW's suggested 2-line fix | **1 failed** — same output |
| Shipped (`supersededKeys`, all combinations) | **1 passed** |

Both reds were produced in a scratch worktree at `.worktree/f2-revert` with ONLY `nestedIn`
altered; the worktree is removed and `git status` is clean.

## F3 — a host-lookup MISS silently recreates the bug — **ACCEPTED (doc only)**

`src/embedFoldKeyRegistry.ts` module doc now states plainly that the fallback is "NOT safe, it
is only the least bad answer": a miss re-collides, and no `adoptRecordingOf` takeover can undo
it (the keys are equal, not weaker/stronger). The per-element-counter alternative and its
trade-off (never collides, but loses the fold on every DOM rebuild) is recorded, with the
reason it was not taken. No behaviour change — I agree with the reviewer that shipping the
measured-zero-miss fallback is right.

## F4 — key slots outlive marks — **ACCEPTED (doc only)**

`register`'s doc now says the slot deliberately outlives the mark, and WHY: re-deriving on
rewire would let a host disagree with the children it already handed a prefix to.

## Out-of-band: `.worktree/` broke `npm run lint`

Creating the scratch worktree under `.worktree/` (the CLAUDE.md convention) made `npm run lint`
fail with 15 parse errors — eslint linted the second repo copy. Added `.worktree` to
`eslint.config.mts` `globalIgnores` and to `.gitignore`, alongside the existing `.tmp` /
`.dev-vault` entries. Dev-environment hygiene, not product change.

## Nothing REJECTED

Every finding was accepted. F2's suggested IMPLEMENTATION was replaced by a measurement-driven
one, which is a stronger form of agreement, not a rejection.

## Verification — my own runs, this iteration

```
npm run lint      exit 0    1 problem (0 errors, 1 warning)
                            obsidianmd/settings-tab/prefer-setting-definitions
                            src/settings/foldableEmbedsSettingTab.ts:12 — PRE-EXISTING
npm run build     exit 0
npm run test:e2e  exit 0    52 passed (9.3s)
```

51 → 52 tests: the one addition is `e2e/nested-fold-cold-start.e2e.ts`. No existing spec or
assertion was removed, weakened or reordered.

Logs: `.tmp/iter1-lint-final.log`, `.tmp/iter1-build-final.log`, `.tmp/iter1-e2e-final.log`;
red runs in `.tmp/redA.log` (original) and `.tmp/redB.log` (review's suggestion);
vacuity measurement in `.tmp/revert-run{1..6}.log` and `.tmp/probe-run{1..3}.log`.

## Known limitations, restated honestly

- **Live Preview nested embeds share ONE fold state across ALL hosts.** Pre-existing;
  ticket `nid_jdpdpu7w0nfda3y4decz7f6xy_e`.
- **A host-lookup miss re-collides** (reading mode never takes that path, MEASURED).
- Reading-mode fold state remains SESSION-only — this ticket is identity, not persistence.
- No unit-test framework exists in this repo; coverage is the real-Obsidian Playwright suite.

---

# FINAL NIT PASS (re-review verdict READY, 0 BLOCKING / 0 SHOULD-FIX)

Tightly scoped cleanup of the four NITs. No design change, no scope growth, no assertion touched.

| NIT | Disposition |
|---|---|
| **N1** 2^N candidate growth not in the code | **DONE** — three lines added to the `nestedIn` doc in `src/embedFoldKeys.ts`: 2^depth − 1 candidates (3 at the real depth 2, 7 at 3), fine while each is one `Map` lookup, and a reason not to add a third cache-dependent key component. |
| **N2** "at most one weaker key holds a recording" overstated | **DONE** — `src/foldableEmbedsPostProcessor.ts:99-101` now says "in practice only one … if two ever did (two panes rendered at different cache warmth), the first listed wins and the rest are no-ops". No code change; the claim is now true. |
| **N3** `.gitignore` rewritten CRLF→LF | **DONE** — file restored to its original CRLF bytes (from `68871cf`) with only the two intended lines inserted. `git diff 68871cf -- .gitignore` is now a **2-line addition** (`# Scratch git worktrees (CLAUDE.md convention).` + `.worktree`), no full-file rewrite. |
| **N4** `__fenOriginalGetCache` on the `ObsidianApp` interface | **DONE** — removed from `e2e/obsidianAppApi.ts`; the stash field now lives in `e2e/obsidianHarness.ts` as a harness-local `type PatchableMetadataCache = ObsidianApp["metadataCache"] & { __fenOriginalGetCache?: … }`, applied as a cast at the two `page.evaluate` seams. `ObsidianApp` again models only Obsidian's API. (A `interface … extends` form does not compile — TS2499, an interface cannot extend an indexed-access type — hence the alias.) |

Nothing rejected. All four were correct and cheap.

## Verification — my own runs, this pass

```
npm run lint                              exit 0    1 problem (0 errors, 1 warning)
                                                    obsidianmd/settings-tab/prefer-setting-definitions
                                                    src/settings/foldableEmbedsSettingTab.ts:12 — PRE-EXISTING
npm run build                             exit 0
npx tsc -noEmit -p e2e/tsconfig.json      exit 0    (added: the e2e tree is NOT covered by `npm run build`)
npm run test:e2e                          exit 0    52 passed (9.4s)
```

Logs: `.tmp/nits-lint.log`, `.tmp/nits-build.log`, `.tmp/nits-e2e-tsc.log`, `.tmp/nits-e2e.log`.
Test count unchanged at 52; no spec, assertion or product behaviour was altered by this pass
(N1/N2 are comments, N3 is line endings, N4 is a compile-time type move).

## NOT done by design (owned by TOP_LEVEL_AGENT)

`change_log` entry; closing the ticket.
