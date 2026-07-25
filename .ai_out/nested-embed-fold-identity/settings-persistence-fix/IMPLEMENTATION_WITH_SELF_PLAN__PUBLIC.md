# IMPLEMENTATION (self-plan) — nested-embed fold identity

Ticket: `nid_zqaxj18jbxwnazzz8aeggz91u_e`. Branch `settings-persistence-fix`.
Commits: `ce2e132` (failing specs) → `afc21eb` (fix) → `cc4d59a` (measured ordering + docs).

## Plan (as executed)

1. e2e FIRST, watch it fail (two specs + fixtures in `e2e/foldable-embeds.e2e.ts`).
2. Key-shape knowledge into `src/embedFoldKeys.ts` (`nestedIn`, `unseenHostKey`).
3. New `src/embedFoldKeyRegistry.ts` — the host lookup.
4. Wire it in `src/foldableEmbedsPostProcessor.ts`.
5. MEASURE the ordering with a throwaway probe; revert the instrumentation.
6. lint + build + full e2e + CLAUDE.md.

## What changed and WHY

**`src/embedFoldKeys.ts`** (key SHAPE stays in one place — it is DOM-free by design):
- `nestedIn(host, own)` → `` `<hostKey>::in::<ownKey>` ``. A nested embed states its occurrence
  in the CHILD note, so `sourcePath`, `src`, section text and index are identical for every
  occurrence of the same host — the host key is the only thing that tells them apart.
  `superseded` is qualified by the host's `superseded ?? current`, because a colder earlier
  render would have keyed BOTH levels weakly — so `adoptRecordingOf` still lands.
- `unseenHostKey(src)` → `` `host::<src>` `` for a host the post-processor never saw.
- Module doc: the "Nested embeds still share ONE key per host … UNMEASURED" limitation is
  replaced by the measured mechanism and the new rule.

**`src/embedFoldKeyRegistry.ts`** (new, 84 lines) — `WeakMap<embed span, KeySlot>`, the
sibling of `WiredElements`:
- `register(embed, derive)` runs SYNCHRONOUSLY in `process()` and returns a
  `PendingEmbedFoldKey`; derivation is LAZY (so `getSectionInfo` is still called right before
  it is needed) and MEMOISED (one element has one key while it lives, so a host and its nested
  embeds can never disagree about the prefix).
- `hostKeyOf` walks `embed.parentElement?.closest('.internal-embed')` and recurses, so an embed
  three levels deep is qualified by the whole chain.

**`src/foldableEmbedsPostProcessor.ts`** — `process()` registers each span and hands the pending
key to `makeFoldable`, which now resolves it instead of deriving one itself (`sectionEl` /
`indexWithinSection` moved into the closure, so `makeFoldable` lost two parameters).

**`CLAUDE.md`** — the reading-mode key bullet now states host qualification; a new bullet
documents the registry, the ordering guarantee and the Live Preview limitation.

## The ORDERING decision + evidence

**Decision: designed so ordering cannot matter, then measured it anyway.**

The lookup deliberately does NOT depend on the host having been WIRED (title loaded →
`makeFoldable`), which would be a race between two independent MutationObservers. It depends
only on the host span having been SEEN by `process()`. That is structural: Obsidian
post-processes an embed BODY only after it resolved the embed, which can only happen after the
section holding the host span was itself post-processed. Registration is synchronous there.

**MEASUREMENT** (throwaway probe `.tmp/probe/probe15.e2e.ts`, log `.tmp/probe/run15b.log`,
against real Obsidian 1.12.7; instrumentation reverted afterwards — `git diff` clean):

```
READING MODE:
  FEN_PROBE_HOST unseen in=[live-preview] src=[probe15-child] nested=[probe15-grandchild]
  FEN_PROBE_HOST unseen in=[live-preview] src=[probe15-child] nested=[probe15-grandchild]
  FEN_PROBE_HOST registered in=[reading-view] src=[probe15-child] nested=[probe15-grandchild] key=[probe15-twins.md::L2::probe15-child::#0]
  FEN_PROBE_HOST registered in=[reading-view] src=[probe15-child] nested=[probe15-grandchild] key=[probe15-twins.md::L4::probe15-child::#0]
```

Reading view: **zero misses**. An earlier run of the same probe (`run15.log`, warm cache) shows
the host keys as `…::occ::probe15-child::#0` / `#1` — so the two occurrences stay distinct on
BOTH the occurrence path and the cold-cache fallback path (`::L2` vs `::L4`).

The two `unseen` lines are `in=[live-preview]`: the hidden Live Preview editor of the same
leaf, whose TOP-LEVEL embed spans CM6 builds and the post-processor never sees. That is the one
degraded case, and it degrades to `host::<src>` — see limitations.

Independently, both new e2e specs are themselves ordering probes: if a reading-mode host were
ever unregistered, both twins would fall back to the identical `host::nested-child` prefix and
the specs would go red exactly as they did before the fix.

**WHY NOT `adoptRecordingOf` here**: nothing degrades on the reading-mode path, so there is
nothing to take over. The existing cold-cache takeover still runs for the nested embed's own
key, with the host prefix chosen so it survives a cold host (above). No cascade to descendants
is needed: a descendant's key is composed from its host's key at derivation time, and both are
re-derived on the next render.

## Red-then-green evidence

RED, before the fix (`.tmp/e2e-red.log`, `.tmp/e2e-red2.log`):

```
✘  12 › a NESTED embed folds independently of its twin in a sibling host, across a re-render (15.2s)
    Error: expect(locator).not.toHaveClass(expected) failed
    Locator: locator('.markdown-reading-view .internal-embed[src="nested-child"]').locator('.markdown-embed.fen-embed').nth(1)
    Expected pattern: not /\bfen-folded\b/
    Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded"
```

```
✘  1 › folding a NESTED embed in one host note leaves it unfolded in ANOTHER host note (15.1s)
    Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded"
```

(The serial file stops after the first failure, so the cross-note spec was re-run alone under
`-g` to observe its own red.) Both are the ticket's measured repro: the twin comes back folded
only AFTER the re-render, and host B is folded on its first ever render.

GREEN, after the fix — full suite (`.tmp/e2e-final.log`):

```
lint exit=0        (1 pre-existing warning: obsidianmd/settings-tab/prefer-setting-definitions)
build exit=0
e2e  exit=0        51 passed (8.3s)
```

Every pre-existing spec still passes unchanged; no existing assertion was weakened.

## Deliberate scope-outs / known limitations (documented in code)

- **Live Preview top-level hosts** stay `unseen` → `host::<src>`. Two Live Preview embeds of
  the SAME note therefore still share the fold state of the embeds nested inside them. This is
  no worse than before (they shared one key already) and it DOES fix the cross-note case there.
  Fixing it properly needs an identity for a CM6 widget span, which is Live Preview's business.
- **Consequence, accepted deliberately**: a nested embed in a reading view and the same one in
  a Live Preview pane now key differently, so their folds no longer bleed into each other. That
  bleed was the very collision this ticket removes, and top-level embeds have never shared fold
  state across the two modes either.
- **No unit-test framework introduced** (exploration confirmed there is none) — coverage is the
  real-Obsidian Playwright suite, per the ticket's AC.
- Reading-mode fold state remains SESSION-only; this ticket is identity, not persistence.
