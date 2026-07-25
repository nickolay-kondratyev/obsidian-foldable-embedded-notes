# IMPLEMENTATION REVIEW — nested-embed fold identity

Ticket `nid_zqaxj18jbxwnazzz8aeggz91u_e`, branch `settings-persistence-fix`, diff `fd2a9e2..HEAD`
(4 commits). Reviewed the FINAL files, not only the diff.

## Verdict

**NOT-READY** — the implementation is correct and well tested for its ticket scope, but two
CLAIMS it makes in the source are FALSE. One of them I disproved empirically. Per the
"behaviour must match naming/docs, no lies" bar in CLAUDE.md, those must be corrected before
merge. Neither requires redesign.

Must-fix set (minimal):
1. F1 — the Live Preview "different notes no longer do [share]" claim is false (MEASURED here).
2. F2 — `nestedIn`'s superseded branch is dead for real nested embeds, so the cold-window
   takeover it documents does not happen; either fix it (2 lines) or state the truth.

Everything else below is NICE-TO-HAVE / NIT.

---

## Summary of the change

A nested embed's key becomes `<hostKey>::in::<ownKey>`. `src/embedFoldKeyRegistry.ts` (new,
95 lines) is a `WeakMap<span, KeySlot>` populated SYNCHRONOUSLY in
`FoldableEmbedsPostProcessor.process()` with a LAZY, MEMOISED derivation; `hostKeyOf` walks
`parentElement.closest('.internal-embed')` and recurses. `makeFoldable` now resolves a
`PendingEmbedFoldKey` instead of deriving one (and lost two parameters). Two e2e specs plus
fixtures; CLAUDE.md updated. No source file was deleted, no existing spec or assertion was
removed or weakened (verified by reading the full e2e diff — additions only).

## Green claims — INDEPENDENTLY VERIFIED

| Claim | My run | Result |
|---|---|---|
| `lint exit=0`, 1 pre-existing warning | `npm run lint` | exit 0, `1 problem (0 errors, 1 warning)` — `obsidianmd/settings-tab/prefer-setting-definitions` in `src/settings/foldableEmbedsSettingTab.ts:12`, pre-existing |
| `build exit=0` | `npm run build` | exit 0 |
| e2e 51 passed | `npm run test:e2e` | **51 passed (8.4s), exit 0** |
| RED before the fix | worktree at `ce2e132` (specs, no fix) | twins spec **FAILED**, `Received string: "... fen-embed fen-folded"` — exactly the reported output |
| RED for the cross-note spec alone | same worktree, `-g "ANOTHER host note"` | **FAILED**, same output |

So the red-then-green claim is honest and the specs are NOT vacuous — I reproduced both reds
myself. That is the most important thing to verify here and it holds.

## What I VERIFIED as correct

- **Discrimination in `nested-twins.md`.** Host spans are top-level in the host note, so their
  own keys are `nested-twins.md::occ::nested-child::#0` / `#1` (warm) or `::L2` / `::L4`
  (cold) — distinct either way. The two nested own keys ARE byte-identical
  (`nested-child.md::S<hash>::nested-grandchild::#0`, because `ctx.getSectionInfo` is null for
  an embed body), so the host prefix is doing 100% of the discriminating work. That is exactly
  what the module doc says, and it is honest about it (`embedFoldKeys.ts:88-93`).
- **Depth 3+ composes.** `hostKeyOf` starts at `parentElement` (cannot re-find `embed`) and
  recurses through `resolve`, so a grandchild yields `hostKey::in::childOwn::in::grandOwn`.
  Correct, and the memoisation means each level is computed once.
- **Registration really is synchronous and un-reorderable.** `process()`
  (`foldableEmbedsPostProcessor.ts:74-85`) registers every `.internal-embed` of the section in
  a plain `forEach` before any `await`/observer; the only async part is `whenMarkdownEmbedReady`.
  The SEEN-not-WIRED distinction is genuinely the right call: keying off WIRED would race two
  independent MutationObservers. The structural argument (an embed BODY can only be
  post-processed after the section holding the host span was) is sound and was measured.
- **Memoisation prevents host/nested disagreement.** `resolve` caches on the slot, so a host
  cannot hand out prefix A to one nested embed and prefix B to another, even though derivation
  time varies.
- **`WeakMap` per plugin INSTANCE**, mirroring `WiredElements` — no detached-DOM retention, and
  a re-enabled plugin re-derives. Consistent with the existing pattern.
- **No collision between the new shape and the old ones.** `occ` / `L…` / `S…` locators sit in
  field 2 of an own key; `::in::` only ever appears as a joiner. For two different structures
  to produce one string you would need a `sourcePath` or link literally containing `::in::`,
  which Obsidian's filename rules make unreachable in practice. Not a real risk.
- **`sourcePath`-prefix parseability holds for reading-mode nested keys**: the prefix is the
  HOST note's path, and sweeping a note's embeds-inside-embeds along with it is the desirable
  semantics — correctly argued at `embedFoldKeys.ts:96-99`.
- **Test barrier is not hand-wavy.** `waitForNestedEmbedsWired` keys off the chevron, which
  `makeFoldable` injects in the same synchronous block as `applyFoldState`
  (`foldableEmbedsPostProcessor.ts:115-117`) — so a "NOT folded" assertion cannot be green
  merely for being early. Good reasoning, correctly documented.
- **The re-render round trip is real.** The twins spec uses `harness.reopenThroughOtherFile`
  (two `openFile` hops) AND `expectFreshElement` from `e2e/reRenderGuard.ts` BEFORE the
  assertions it guards. This is exactly the anti-vacuity shape the repo already established.
- **Assertions are specific**: both specs assert the UNTOUCHED sibling / other note is NOT
  folded via `expectFolded(..., false)`, which itself asserts attachment first
  (`e2e/foldAssertions.ts:33-34`) — cannot pass on a vanished element.
- **Reading-mode fold state remains session-only.** `src/foldStateStore.ts` is untouched. AC met.
- **The `-g` re-run is NOT a spec-isolation problem.** I confirmed the second spec is reported
  as `-` (skipped) because `test.describe.configure({ mode: "serial" })` skips the rest of the
  file after a failure. Its fixtures (`nested-host-a/b.md`) are distinct notes from the twins
  fixture, so no fold state leaks between the two specs; running it alone gave the same red.
  Serial-with-shared-vault is this suite's deliberate, documented design, not new fragility.

---

## Findings

### F1 — SHOULD-FIX (blocking as a correctness-of-DOCUMENTATION issue): the Live Preview cross-note claim is FALSE

`src/embedFoldKeys.ts:150-152`

> "KNOWN LIMITATION: two Live Preview embeds of the SAME note therefore still share the fold
> state of the embeds nested inside them; **different notes no longer do**."

and the plan's "it DOES fix the cross-note case there".

**This is wrong.** For an unseen (Live Preview) host, `unseenHostKey` returns
`host::<hostSrc>` — `hostSrc` is the CHILD link, which is identical in every host note that
embeds the same child. And the nested own key is derived from the CHILD's `ctx` (same
`sourcePath`, `section === null` → same `S<hash>` of the same rendered text, same `src`, same
index). So host A and host B produce the **identical** key
`host::probe-child::in::probe-child.md::S…::probe-grand::#0`.

**MEASURED, not reasoned**: I ran a throwaway probe in a scratch worktree at HEAD (fold the
nested embed in Live Preview in host A, open host B in Live Preview, assert unfolded):

```
✘ LIVE PREVIEW: folding a nested embed in host A leaves it unfolded in host B (15.2s)
  Error: expect(locator).not.toHaveClass(expected) failed
  Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded"
```

(probe deleted, worktree removed; `git status` clean.)

This is NOT a regression — it is exactly the pre-existing behaviour — so it does not block the
ticket's reading-mode AC. What blocks is the false claim in the source, which a future
maintainer will trust. Direction:
- Correct `embedFoldKeys.ts:150-152` and the plan write-up to: an unseen host degrades to
  `host::<src>`, which is the SAME for every host note, so **Live Preview nested embeds still
  share fold state across hosts entirely** (same note and different notes alike).
- Correct the CLAUDE.md bullet the same way — it currently says only "two Live Preview embeds
  of the same note still share their nested folds", which understates it.
- File a follow-up ticket for LP nested identity (it needs an identity for a CM6 widget span;
  genuinely Live Preview's business, correctly scoped out here).

### F2 — SHOULD-FIX: `nestedIn`'s superseded key is dead code, so a cold-window nested fold is now LOST

`src/embedFoldKeys.ts:137-143`

```ts
superseded: own.superseded === null ? null : this.qualify(host.superseded ?? host.current, own.superseded),
```

`own.superseded` is non-null only when `cachedOccurrenceOf` answered, which requires
`occurrence.section !== null`. For a NESTED embed `getSectionInfo` is ALWAYS null (measured and
documented at `embedFoldKeys.ts:90-92`). Therefore for every real nested embed
`own.superseded === null` and `nestedIn` always returns `superseded: null`. The branch that
"makes `adoptRecordingOf` still land" never executes, and the doc comment at lines 133-135
asserts a behaviour that does not occur.

Concrete failure: launch Obsidian, immediately open a note with a host embed (cache COLD) →
host key `A.md::L2::child::#0`, nested key `A.md::L2::child::#0::in::S…`. User folds the nested
embed. Leave and come back (cache now WARM) → host key `A.md::occ::child::#0`, nested key
`A.md::occ::child::#0::in::S…`, `superseded === null` → **no takeover, fold silently lost**
(reverts to the default). Before this diff the nested key was cache-independent, so that fold
survived. Narrow (app-start window only) but a real behaviour regression, and the code claims
the opposite.

Direction — the qualification is already there, it just needs the other branch:

```ts
nestedIn(host: EmbedFoldKey, own: EmbedFoldKey): EmbedFoldKey {
    const current = this.qualify(host.current, own.current);
    const supersededHost = host.superseded ?? host.current;
    const supersededOwn = own.superseded ?? own.current;
    const superseded = this.qualify(supersededHost, supersededOwn);
    return { current, superseded: superseded === current ? null : superseded };
}
```

If instead you judge this out of scope, then DELETE the misleading sentence and say plainly:
"a nested fold made during the cold window is dropped when the host warms up" + follow-up
ticket. What must not stay is a comment describing a takeover that cannot happen.

### F3 — NICE-TO-HAVE: a host-lookup MISS silently recreates the exact bug

`src/embedFoldKeyRegistry.ts:89-92`

On a miss, both twins in one note degrade to the SAME `host::<src>` prefix and, since their own
keys are identical, to the same full key — i.e. the bug this ticket fixes, silently, with no
`adoptRecordingOf` takeover available (see F2). The design argument plus the zero-miss
measurement make this acceptable rather than a HACK, and I agree with shipping it. Worth
recording explicitly in the module doc that a miss re-collides (today it only says it
"degrades"), so nobody assumes the fallback is safe.

If you ever want to remove the sharp edge: give each unseen host a per-element counter from the
registry (`host::<src>::#<n>`), which trades "survives re-render" for "never collides". Not
obviously better for the LP case — leave it, but state the trade-off.

### F4 — NIT: key slots outlive marks

`src/embedFoldKeyRegistry.ts:51`, `foldableEmbedsPostProcessor.ts:141-144`

`forget()` clears `wiredEmbeds` but not the key slot, so a REUSED embed span (an LP-hosted body,
per CLAUDE.md) that is unwired and rewired keeps its first-derived key rather than re-deriving.
This is what the doc means by "one element has ONE key for as long as it lives", so it is
honest and arguably the more stable behaviour. Flagging only so the divergence from
`WiredElements`' lifetime is a conscious choice.

## Code quality (CLAUDE.md)

- **SRP**: `EmbedFoldKeyRegistry` = "which span is known by which key"; `EmbedFoldKeys` = key
  SHAPE, DOM-free; post-processor = wiring. Clean split, and the registry justified rather than
  over-engineered — the memoise-plus-lazy pair is doing real work (it is what makes host and
  nested agree). 95 lines, well under the split threshold. Right home.
- **DRY**: `qualify` is the single place `::in::` is built; all locator/separator strings are
  named constants (`NESTING_SEPARATOR`, `UNSEEN_HOST_LOCATOR`). No magic strings.
- **DIP/typing**: `PendingEmbedFoldKey` / `DeriveEmbedFoldKey` are narrow and explicit; no
  `Pair`-ish types; `strict` clean.
- **Comments** explain WHY (ordering, laziness, memoisation) — with the two exceptions in F1/F2
  where WHY-comments assert things that are not true.
- **CLAUDE.md** update is succinct and in the right bullets; accurate except the LP limitation
  sentence (F1).

## Documentation updates needed

1. `src/embedFoldKeys.ts:150-152` and `CLAUDE.md` (registry bullet) — correct the Live Preview
   limitation per F1.
2. `src/embedFoldKeys.ts:133-135` — fix or correct the superseded claim per F2.
3. `src/embedFoldKeyRegistry.ts` module doc — say that a miss re-collides (F3).
4. Follow-up ticket: Live Preview nested-embed fold identity (CM6 widget span identity).

---

# RE-REVIEW — ITERATION 1 (fresh reviewer instance)

Diff reviewed: `0f27551..HEAD` (`7418749`, `21e1e75`, `575edaa`), final files read, not only the diff.

## Verdict — **READY**

Both original must-fix findings are genuinely resolved. F2's resolution went well beyond my
suggested 2-line fix and I confirmed WHY: I reproduced the RED for BOTH the original code and
my own suggested fix, in a scratch worktree, against real Obsidian. The implementer's claim
that my suggestion was insufficient is **true and measured** — it is not a rationalisation.
No BLOCKING or SHOULD-FIX findings remain. The remaining items are NITs, recorded for the
record only; none of them justifies another round.

## Disposition of the ORIGINAL findings

| # | Original finding | Status | Evidence |
|---|---|---|---|
| F1 | Live Preview "different notes no longer share" is FALSE | **RESOLVED** | `src/embedFoldKeys.ts:167-173`, `src/embedFoldKeyRegistry.ts:47-53`, `CLAUDE.md` registry bullet now all say LP nested embeds share ONE fold state across ALL hosts (same note AND different notes), flagged pre-existing, with ticket `nid_jdpdpu7w0nfda3y4decz7f6xy_e`. Matches exactly what I measured last round. NOT over-corrected: the claim is structurally certain (`host::<src>` is the child link, identical everywhere) and I had measured the cross-note half directly. |
| F2 | `nestedIn`'s superseded branch is dead → cold-window nested fold LOST | **RESOLVED, and my suggested fix was wrong** | See "Revert check" below. `supersededKeys: readonly string[]` + cartesian product in `src/embedFoldKeys.ts:149-157`; adoption loop `src/foldableEmbedsPostProcessor.ts:102-104`; new spec `e2e/nested-fold-cold-start.e2e.ts`. |
| F3 | A host-lookup MISS silently re-collides | **RESOLVED (doc)** | `src/embedFoldKeyRegistry.ts:47-53` now says plainly "The fallback is NOT safe, it is only the least bad answer", names the re-collision, and records the per-element-counter alternative and why it was not taken. |
| F4 | Key slots outlive marks | **RESOLVED (doc)** | `src/embedFoldKeyRegistry.ts:63-71` documents the deliberate lifetime and the WHY (re-deriving would let a host disagree with children it already gave a prefix to). |

Ticket `_tickets/live-preview-nested-embeds-share-one-fold-state-across-all-hosts.md` exists,
is accurate, and its acceptance criteria name both LP cases. Good follow-up hygiene.

## Revert check — the new spec is NOT vacuous (my own runs)

Scratch worktree `.worktree/rr-revert` at HEAD, `node_modules` symlinked, ONLY `nestedIn`
altered. Removed afterwards; `git status` clean.

| `nestedIn` variant | Result |
|---|---|
| ORIGINAL pre-review semantics (`ownSup === undefined ? [] : [qualify(hostSup ?? hostCur, ownSup)]`) | **1 failed** — `unexpected value "internal-embed markdown-embed inline-embed is-loaded fen-embed"` (no `fen-folded`), at `nested-fold-cold-start.e2e.ts:96` |
| MY suggested 2-line fix (each half falls back to its own current) | **1 failed** — `expect(locator).toHaveClass(expected) failed` |
| As shipped | **passed** (part of the 52 below) |

Two things this proves beyond the greenness: the spec fails at the **final THEN assertion**
(line 96), i.e. AFTER `expectFreshElement` has proven a real re-render — so it cannot be red
for a setup reason; and my own proposed fix really did miss the measured warm-own/cold-host
combination. The implementer's account of the measurement is honest.

Logs: `.tmp/rr-revertA.log`, `.tmp/rr-revertB.log`.

## Suite — my own runs, this iteration

```
npm run lint       exit 0   1 problem (0 errors, 1 warning)
                            obsidianmd/settings-tab/prefer-setting-definitions
                            src/settings/foldableEmbedsSettingTab.ts:12 — PRE-EXISTING
npm run build      exit 0
npm run test:e2e   exit 0   52 passed (9.2s)
```

`52 passed`, and **zero skipped / zero flaky** — I grepped the reporter output for
`skipped|flaky|failed|did not run`, the only match is the summary line. So the previously
green 51 are all still green and the delta is exactly the one new spec.
Log: `.tmp/rr-e2e-full.log`.

The two ORIGINAL nested specs are byte-unchanged: `git diff 0f27551..HEAD` touches neither
`e2e/foldable-embeds.e2e.ts` nor `e2e/foldAssertions.ts`, `e2e/reRenderGuard.ts` or
`src/foldStateStore.ts`. Nothing weakened, nothing removed, no assertion relaxed.

## What I VERIFIED as correct in the NEW work

- **The combinatorial expansion is BOUNDED and small, and does NOT re-merge siblings.** This
  was my highest-priority check. Per nesting level each key contributes at most 2 candidates
  (`keyFor` returns `supersededKeys` of length 0 or 1), so depth N yields 2^N candidates,
  2^N−1 superseded — 3 at the real depth 2, 7 at depth 3. Each is one `Map` lookup on a render.
  No duplicates are possible either: a positional key carries an `L`/`S` locator and an
  occurrence key carries `occ`, so `hostSup !== hostCur` and `ownSup !== ownCur` always.
- **No WRONG adoption across siblings** — traced concretely on the `nested-twins.md` fixture
  (`# Nested twins\n\n![[nested-child]]\n\n![[nested-child]]\n`, `e2e/foldable-embeds.e2e.ts:73-74`).
  The two nested embeds have BYTE-IDENTICAL own keys (that is the bug), so all discrimination
  must come from the host half — and it does in BOTH warmth states: warm hosts are
  `…::occ::nested-child::#0` / `#1`, cold hosts are `…::L2::…::#0` / `…::L4::…::#0` (separate
  paragraph sections ⇒ different `section.lineStart`; same-section siblings would differ by
  `indexWithinSection`, which the positional key also carries). Sibling A's candidate set is
  `{hostCur_A, hostSup_A} × {ownCur, ownSup}` and B's is `{hostCur_B, hostSup_B} × {…}`; with
  both host halves distinct the two sets are **disjoint**. So the cartesian product cannot
  re-merge siblings, and it cannot make A adopt B's recording. The ticket's core invariant
  survives the fix.
- **No cross-shape collision either.** For A's superseded key to be some other embed's
  `current`, a positional (`L…`/`S…`) locator would have to equal an `occ` locator — it cannot.
- **The chain of partial warm-ups actually composes.** Cold/cold → records at
  `(hostL, ownS)`; a warm-own/cold-host render has `current = (hostL, ownOcc)` and
  `supersededKeys = [(hostL, ownS)]`, so it adopts; the fully warm render's candidate list
  contains `(hostL, ownOcc)` and adopts again. Every intermediate warmth state is covered,
  which is precisely what the single-key form could not do.
- **`FoldStateStore` is UNCHANGED** — the fix is confined to key shape plus a loop, and
  `adoptRecordingOf`'s existing "target already recorded → return" guard makes every attempt
  after the first a no-op. Good: the riskiest file stayed untouched.
- **`withUnindexedNote` is honest fault injection, not a test hack**
  (`e2e/obsidianHarness.ts:240-274`). It replaces exactly ONE method (`getCache`) for exactly
  ONE path, restores in a `finally`, and throws loudly if the stash is already/never present so
  a leaked patch cannot silently poison a later spec. No product code branches on being under
  test. The doc states WHY the real cold window cannot be raced for, with the measurement.
  Given that `getCache` is the plugin's only index read, `withUnindexedNote` is an accurate name.
- **`.worktree/` in `eslint.config.mts` and `.gitignore` is right.** CLAUDE.md mandates that
  location for scratch worktrees; without the ignore, eslint lints a full second copy of the
  repo outside `tsconfig` and the dev environment breaks. Correct fix, correct place, next to
  the existing `.tmp` / `.dev-vault` entries, with a WHY comment.
- **The `getSectionInfo` doc correction is a strengthening, not a weakening.** The earlier text
  claimed it is ALWAYS null for an embed body; `src/embedFoldKeys.ts:96-101` now says either
  derivation can occur and — importantly — that the collision holds EITHER WAY, which is the
  load-bearing claim. Correcting a previously "MEASURED" statement when a better measurement
  arrives is exactly the honesty bar.

## New findings

### N1 — NIT: the 2^N growth of `supersededKeys` is in the write-up but not in the code

`src/embedFoldKeys.ts:137-157`. The `nestedIn` doc explains WHY every combination is emitted
but not that the count doubles per nesting level. It is harmless at real depths (3 candidates
at depth 2, 7 at depth 3, all `Map` lookups) — but a future maintainer adding a third
cache-dependent component to the key deserves the warning in the same place as the design.
Direction: one sentence on `nestedIn` — "one candidate per combination, so 2^depth − 1;
fine while depth is 2–3 and each is a single `Map` lookup".

### N2 — NIT: "At most one of the weaker keys can hold a recording" is very slightly stronger than what holds

`src/foldableEmbedsPostProcessor.ts:100-102`. Two panes of the same note rendering at
different cache warmth could each record under a different candidate; the first-listed one
then wins (`hostCur`-major order) and the loser is left as an orphaned `Map` entry for the
session. Behaviour is still correct — the guard makes it deterministic and the strong key
wins — and one stale boolean per session is nothing. Direction: soften to "in practice only
one … and if two ever did, the first wins and the rest are no-ops", or drop the sentence; the
code needs no change.

### N3 — NIT: `.gitignore` was rewritten wholesale (CRLF → LF)

The one-line addition (`.worktree`) shows up as a 27-line delete + 29-line add because the
file's line endings changed. Harmless and arguably an improvement, but it hides the real
change in review and will conflict noisily. Worth knowing it happened; not worth undoing now.

### N4 — NIT: `__fenOriginalGetCache` is declared on the `ObsidianApp` interface

`e2e/obsidianAppApi.ts:64-69` puts the e2e's own stash field on the type that models
Obsidian's API. The doc comment says so explicitly ("the e2e's own field, not Obsidian's"),
which keeps it honest, and there is no clean alternative without a cast. Fine as is.

## Documentation updates needed

None blocking. `CLAUDE.md` is accurate on both the LP limitation and the superseded-key LIST;
the module docs carry the WHY. N1/N2 are one-sentence doc touch-ups if the implementer wants
them; they can equally ride along with the next change to these files.

## Final verdict

**READY.** F1 and F2 are resolved, F2 correctly and with better evidence than I asked for; I
independently reproduced both REDs, the full suite is 52 passed / 0 skipped / lint 0 / build 0,
and no previously-passing behaviour, spec or assertion was weakened. Ship it.
