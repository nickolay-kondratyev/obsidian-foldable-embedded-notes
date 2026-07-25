# Implementation review: unresolved-embed observer leak (nid_78cl6bo3t8umqbndughsbjez9_e)

Reviewed: cumulative diff `4d30df8..fbb018a` (`a952ca9`, `2b80c06`, `54ff677`, `fbb018a`).

## Verdict: SHIP WITH FIXES

The leak IS fixed, and fixed by the right mechanism (`PendingEmbedObserver` as a
`MarkdownRenderChild`, design point 2). But the SECOND, optional half of the change
(design point 1 — classifying `file-embed` as "settled, stop waiting") silently REMOVES a
behaviour the plugin has today, and I measured it doing so. It is not needed for the fix:
I re-ran the whole suite with `file-embed` dropped from the class list and got the same
**55 passed**, including the new leak spec.

1 BLOCKING, 2 SHOULD-FIX, 2 NIT.

## Gates I ran myself

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 1 PRE-EXISTING warning (`prefer-setting-definitions`, `foldableEmbedsSettingTab.ts`, untouched here) |
| `npm run build` | exit 0 |
| `npm run test:e2e` (full) | **55 passed, 0 failed** (9.9s) — `.tmp/review/e2e-full.log` |
| New spec against `git checkout 4d30df8 -- src/` | **RED, for the right reason**: `Expected: <= 2 / Received: 6` — `.tmp/review/e2e-red.log` |

No flakiness observed across four suite/spec runs.

---

## 🚨 BLOCKING

### B1. Treating `file-embed mod-empty` as "settled" loses a real behaviour: an embed whose target is created LATER is no longer made foldable

The comment on `NON_NOTE_EMBED_CLASSES` (`src/foldableEmbedsPostProcessor.ts:20-21`) asserts:

> None of these is ever foldable, and none of them will gain `markdown-embed` later.

**MEASURED false on Obsidian 1.12.7.** Probe (`.tmp/review/probe-resolve.e2e.ts`): a note
containing `![[probe-later]]` open in reading mode, then `app.vault.create("probe-later.md")`
while the view stays open. Obsidian upgrades the **same DOM node** in place:

```
                      classes                                              foldable  marks
FIXED  before-create  internal-embed is-loaded file-embed mod-empty            0        0
FIXED  after-create   internal-embed is-loaded markdown-embed inline-embed     0        0   <-- title present, NOT foldable
OLD    before-create  internal-embed is-loaded file-embed mod-empty            0        0
OLD    after-create   internal-embed is-loaded markdown-embed inline-embed
                                                             fen-embed        1        1   <-- foldable, as today
same-dom-node=[true] in BOTH runs
```

So today a user who creates the missing note (or whose vault index / Sync resolves it a
moment later) gets a foldable embed without touching anything; after this change the embed
renders fine but is dead — no chevron, no fold — until the note is reopened. That is a
silent loss of previous functionality, which CLAUDE.md requires explicit human alignment for,
and it is not mentioned in the write-up or in "Known limitations".

The write-up's measurement (a) — "classes are assigned in ONE shot" — is correct as far as it
goes (the FIRST settling mutation is one shot) but does not support the conclusion drawn from
it: `mod-empty` is not a terminal state, it is "not resolvable *yet*".

**It is also unnecessary.** I patched only `"file-embed",` out of `NON_NOTE_EMBED_CLASSES`
and re-ran everything:

```
npm run test:e2e  -> 55 passed (10.1s)        # incl. the new leak spec
probe after-create -> foldable=1, marks=1     # behaviour preserved
```

The render-child lifetime alone holds the leak closed — which matches the implementer's own
probe C (`observers=[2] [2] [2]`).

**Suggested fix (smallest correct one):** drop `"file-embed"` from `NON_NOTE_EMBED_CLASSES`,
keep the rename and the sync-path check (they are fine and cheap for media). If the sync bail
for a genuine non-note FILE is wanted (`![[notes.txt]]` = `file-embed mod-generic`, which
really is terminal), gate it explicitly on `mod-generic` — never on `mod-empty` — and say WHY
in the comment: `mod-empty` means "target missing right now", and Obsidian upgrades that span
in place.

Whatever is chosen, `NON_NOTE_EMBED_CLASSES`' doc comment and the new CLAUDE.md paragraph
("a target that does not exist" … "never shows up transiently on something that later
resolves") must be corrected — as written they are a measured-false claim in the two places
future maintainers will trust most.

---

## ⚠️ SHOULD-FIX

### S1. No test pins the behaviour B1 removes — the suite is green either way

The new spec passes identically with and without `file-embed` in the list (verified). The
acceptance criterion "resolved note embeds … behave exactly as today" is only covered for
embeds that were resolvable at render time. Add a spec for the late-resolve case: render
`![[will-exist]]`, `app.vault.create` it, assert the embed becomes `.fen-embed` in place.
That is the test that would have caught B1, and it belongs in this ticket's spec file.

### S2. Nothing bounds a SECOND observer on the same still-pending embed span

`whenMarkdownEmbedReady` has a `wiredEmbeds` guard for already-wired embeds, but no
"already waiting" guard. If `process` ever runs twice over the same live, not-yet-settled
span (Obsidian's reused Live-Preview embed-body DOM is the realistic candidate — the code
comment at `:266-269` says that path exists), two `PendingEmbedObserver`s attach to one span
and both live until the span is removed. Today the `isNonNoteEmbed` sync bail masks this for
unresolved embeds; if B1 is fixed by dropping `file-embed`, the mask goes with it.

The robust bound is classification-independent and mirrors an existing pattern: a
`WiredElements`-style `WeakSet` of embeds currently being waited on, cleared in
`forgetObserver`. That makes "at most one observer per live embed span" a structural
invariant rather than a consequence of getting Obsidian's class taxonomy right — which is
exactly the kind of assumption this ticket exists because of.

---

## 💡 NIT

### N1. `liveObserverCount()` is a non-retrying read feeding an assertion

`expect(await liveObserverCount()).toBeLessThanOrEqual(afterFirstRender)` — the repo already
has a ticket about this shape. In practice it is safe here (after settle the count is 0, so
the baseline is the strictest possible value, and I confirmed RED on old code), but
`await expect.poll(liveObserverCount).toBeLessThanOrEqual(afterFirstRender)` costs nothing
and removes the timing question. Consider also asserting the ABSOLUTE expectation (0 pending
observers once every embed has settled) — it says more than "did not grow".

### N2. Duplication between the two render children is now visible

`PendingEmbedObserver` and `FoldableEmbedMark` are the same shape (render child + owner
callback + a resource released in `onunload`), and `teardown()` is two identical loops. This
is fine as-is — the responsibilities really differ, and the implementer correctly flagged it
for ticket nid_1ngosntduq5baizn9b7056h34_e rather than inventing a premature base class.
Noted only so the follow-up ticket keeps the pointer.

---

## Things checked and found GOOD (no action)

- **Leak mechanism.** `ctx.addChild` + explicit `load()` mirrors the proven `FoldableEmbedMark`
  path; `onunload` disconnects and calls back into `forgetObserver`, so `liveObservers` cannot
  grow stale entries. Double-unload (self-stop, then DOM removal, then `teardown`) is safe —
  Obsidian's `Component.unload` is guarded by `_loaded`.
- **Stop-then-notify order** in `onPendingEmbedMutated` — correct and correctly explained:
  `onReady`'s own DOM writes would otherwise re-enter as mutations of the same embed.
- **Keeping `liveObservers` + the teardown loop was REJECTED correctly.** The implementer's
  probe D reasoning matches this repo's existing MEASURED asymmetry for marks (Live-Preview
  widget DOM is not removed on disable, so no render child unloads there). Deleting the set
  would have reintroduced a leak invisible to reading-mode tests.
- **Rejecting `mod-empty` as the sole signal, and rejecting a production test seam** — both
  right calls for the stated reasons.
- **Test honesty.** The internals read throws instead of returning a sentinel; the spec waits
  for embeds to SETTLE before counting (so it cannot be green for the "not yet mutated"
  reason); `expectFreshElement` guards against an in-place non-re-render making the whole
  test vacuous. Verified RED on unchanged src.
- **No pre-existing tests, anchors or use cases removed.** Media-embed and resolved-embed
  controls were ADDED.
- **Security:** nothing touched — no I/O, no user input parsing, no new APIs.

## Documentation updates needed

- `NON_NOTE_EMBED_CLASSES` doc comment and the new CLAUDE.md bullet: remove/repair the
  "never gains `markdown-embed` later" claim (B1).
- If B1 is fixed by dropping `file-embed`, CLAUDE.md's "The wait ENDS when…" paragraph needs
  to say the wait ends on media classes OR when the render goes away — the render-child bound
  is the real invariant, and stating it that way is both true and more durable.
