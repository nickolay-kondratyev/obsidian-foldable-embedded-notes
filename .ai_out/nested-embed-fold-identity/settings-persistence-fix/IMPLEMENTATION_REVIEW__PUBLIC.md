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
