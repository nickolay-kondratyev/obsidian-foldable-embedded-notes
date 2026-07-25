# IMPLEMENTATION_REVIEW — reading-mode fold key (`nid_7qbtubxk89team9oadnl3hanr_e`)

Reviewed `git diff 9e5525c..HEAD` on branch `settings-persistence-fix`
(`e5970b3` failing-first spec, `83a79a6` fix, `e45c52b` notes).

## Verification I ran myself

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 1 pre-existing warning (`prefer-setting-definitions`) → `.tmp/rev-lint.log` |
| `npm run build` | clean → `.tmp/rev-build.log` |
| `npm run test:e2e -- reading-mode-fold-key.e2e.ts` | 2 passed → `.tmp/rev-e2e-foldkey.log` |
| `npm run test:e2e` (full) | **48 passed** → `.tmp/rev-e2e-full.log` |
| `git diff e5970b3..HEAD -- e2e/reading-mode-fold-key.e2e.ts` | **EMPTY** — the spec is byte-identical to the version that was red |
| `.tmp/e2e-foldkey-failing.log` / `-2.log` | real, red at `reading-mode-fold-key.e2e.ts:127` and `:151` — i.e. the POST-EDIT fold assertion, the bug |
| No `sanity_check.sh` in the repo | n/a |

The failing-first evidence is genuine and the test was **not** weakened after being seen red. That
is the single most important thing to establish here, and it holds.

## The fix itself — assessed as sound

- The occurrence key does fix both MEASURED scenarios, and the e2e is capable of failing if the
  src fix were reverted (proved by the pre-fix logs against an identical spec).
- Ordinal alignment is genuinely sound, not lucky: `EmbedFoldDom.SEL_INTERNAL_EMBED` is
  `.internal-embed` (`src/embedFoldDom.ts:29`), which includes MEDIA embeds — and `EmbedCache`
  includes them too. Both sequences are document-ordered and contain the same members.
  `src/embedFoldKeys.ts:129-146` returns `null` (→ fallback) rather than a wrong entry when the
  two cannot be aligned. Good failure mode.
- `ReadEmbeds` (`src/embedFoldKeys.ts:9`, wired at `src/main.ts:27-29`) is a genuinely narrow
  port; no `App` leaks into the key logic. Matches the `ReadSettings` / `SettingsPersistence`
  precedent in CLAUDE.md.
- DRY: djb2 was MOVED into `EmbedFoldKeys`, not duplicated; `foldableEmbedsPostProcessor.ts` is
  now smaller and its new `occurrenceOf` is a pure gatherer. SRP respected.
- The `getSectionInfo` → `null` branch is preserved as the pre-existing `S<hash>` key, and the
  `L…`/`S…` vs `occ` locator field really does make collisions impossible
  (`src/embedFoldKeys.ts:110-116, 155-160`). A cold cache cannot make all embeds of a file
  collide on one key: the fallback still carries `src` and `#<indexWithinSection>`.
- **`nid_z4jq8me8mhstojozeua8fufdr_e` is NOT fixed — verified, not trusted.** Delete the first of
  two `![[a]]`: the survivor becomes ordinal 0 in `scanForOccurrence` and reads the deleted
  embed's fold. Keep the ticket open. (But see S2 — its frequency changed.)
- No security surface: keys are in-memory `Map` keys, no injection path, no secrets, no new I/O.
- The e2e barriers are real, not the vacuous kind this suite has a history of.
  `waitForBothEmbedsWired` (`e2e/reading-mode-fold-key.e2e.ts:93-96`) is a sound settled barrier
  because `markFoldable`/`ensureChevron`/`applyFoldState` are ONE synchronous block
  (`src/foldableEmbedsPostProcessor.ts:100-102`) — so `.fen-embed` present ⇒ fold state already
  projected, which is exactly what the negative `expectFolded(…, false)` needs. Plus
  `expectFreshElement` for re-render identity and an explicit "the edit reached the render" gate
  (`:124`, `:148`). Locators are scoped to `.markdown-reading-view`, so the hidden LP editor DOM
  cannot shift `nth()`.

## 🚨 BLOCKING

### B1. A previously-working use case now breaks in the cold-cache window, and the decision was made without human sign-off
`src/embedFoldKeys.ts:100-108` + `:148-160`, `src/main.ts:27-29`, `e2e/obsidianHarness.ts:222-225`.

**Failure scenario (concrete).** Obsidian launches on a large vault. The last-open note renders in
reading mode BEFORE `metadataCache` has indexed it (`getCache(path) === null` — MEASURED by the
implementer, 1 run in 4 even in the tiny dev vault). The user folds an embed; the fold is stored
under the `L<line>` fallback key. The user navigates away and back. The now-warm render computes
the `occ` key, misses, and the embed comes back **unfolded**.

**Why this is blocking rather than a filed follow-up.** Before this change that fold SURVIVED —
the line key was cache-independent, so both renders agreed. This is a NEW loss of previously
working behaviour, and the evidence for it is that a **pre-existing behaviour test**,
`e2e/foldable-embeds.e2e.ts` "fold state survives leaving the note and coming back", went RED and
was returned to green by changing the HARNESS (`ObsidianHarness.openFile` now waits out the
window) rather than the product. That is the one shape CLAUDE.md is most explicit about: an
existing use case must not regress without explicit alignment from the human engineer. The
implementer was fully transparent about it and filed `nid_zf4num1ja4c9tpwpgj672ijgn_e` (priority
3) — the transparency is exemplary; the unilateral trade is what needs a human decision.

I am NOT saying the harness wait is illegitimate (see the S3 assessment — it is real readiness,
not a sleep). I am saying that once it is in place, **nothing in the suite covers the regression
any more**, and the size of the window scales with vault size, so "narrow" is asserted from a
5-file dev vault.

**Ask of the human:** either accept the limitation explicitly (and raise the ticket's priority /
record the decision in it), or take the ticket's option 2 now — defer wiring until
`getCache(sourcePath) !== null`, one-shot on `metadataCache.on("resolved")`, bounded so it falls
back to the current behaviour if the cache never answers. The post-processor already wires
asynchronously (it waits for the embed title), so this adds a wait, not a new lifecycle.
Note the tempting cheap alternative — "on an `occ` miss, also look up the `L` key" — is WRONG:
it re-introduces the misattribution the new test 2 pins (the survivor's `occ` key misses, the
`L` key hits, and the fold lands on the wrong embed).

## ⚠️ SHOULD-FIX

### S2. "strictly less lossy than the line key it replaces" is factually false
`src/embedFoldKeys.ts:70-75` (COLD cache bullet), repeated in
`_tickets/reading-mode-a-fold-made-before-obsidian-finishes-indexing-…md:20` and in
`IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md`.

B1 is the counter-example: in the cold window the new key loses a fold the old key kept. Under
CLAUDE.md's EARN_TRUST rule this sentence has to go or be qualified ("less lossy EXCEPT in the
cold-cache window, where it is strictly MORE lossy"). Correct this even if B1 is accepted as-is.

### S3. `z4jq`'s misattribution did not merely survive — it became MORE frequent
`src/embedFoldKeys.ts:66-69` and `CLAUDE.md` ("the line key had the same flaw" / "its ordinal is
inherited").

Same class of bug, different hit rate. With the LINE key, a deleted earlier same-link embed handed
its fold over only when the survivor landed on *exactly* the deleted embed's old line. With the
OCCURRENCE key it hands over **unconditionally**, for a deletion anywhere in the note. Scenario:
`![[a]]` (folded) at the top, `![[a]]` (unfolded) 40 lines below; delete the first one; the second
comes back folded, every time. The docs should say the frequency changed — otherwise a maintainer
reading "the line key had the same flaw" will under-rate the open ticket.

### S4. The harness readiness wait is narrower than its doc comment claims
`e2e/obsidianHarness.ts:201-225`.

Assessment first: this is **legitimate readiness, not a sleep in disguise** — it waits on an
observable app condition with no timing constant, exactly like the existing `layoutReady` wait.
But three gaps:
1. It waits for a NON-NULL cache, not a cache that reflects the last edit. The new spec's whole
   shape is edit → reopen → assert; a stale-but-non-null cache satisfies the wait, so the
   remaining product race (stale cache selecting the wrong entry, documented at
   `src/embedFoldKeys.ts:76-80`) can still flake these tests. It would flake RED, so nothing is
   masked — but a tighter gate (e.g. wait until `getCache(path).headings` contains the inserted
   heading) would make the spec's determinism argument complete.
2. It waits only for the file being opened. A nested embed is keyed by its **CHILD** note's
   `ctx.sourcePath`, whose cache the harness never waits for — so nested-embed specs keep the
   cold-cache race the comment says has been removed.
3. No timeout or message: `page.waitForFunction` on a path that never gets a cache entry (a
   non-markdown file) hangs to the default timeout and reports an opaque `waitForFunction`
   failure, throwing away the explicit `e2e: file not found` style this method already models.

### S5. The nested-embed claim is stated as fact but is unmeasured
`src/embedFoldKeys.ts:81-83` and the matching CLAUDE.md bullet: "the occurrence is computed in the
CHILD note's coordinates, identically for every host."

`ctx.getSectionInfo` returns `null` outside a top-level markdown view, so a nested embed most
likely never reaches the occurrence path at all — it takes the `S<hash>` fallback. The CONCLUSION
(one shared key per host) is unchanged either way, but the stated MECHANISM is a guess presented
in the same voice as the measured findings, in a file where "MEASURED" is a load-bearing word.
Either measure it or soften the wording.

### S6. CLAUDE.md duplicates the `EmbedFoldKeys` limits list
`CLAUDE.md:40-52`.

The 13-line bullet restates the stability guarantees, the `z4jq` inheritance, the fallback shape
and the cold-cache measurement — all of which the module doc comment already owns. Two copies of
the same knowledge, guaranteed to drift (they already disagree in emphasis, see S3). Per CLAUDE.md's
own "SUCCINCT / stable knowledge" rule, keep identity + key shape + "limits are on the module" and
drop the rest.

## 💡 NITs

- `e2e/obsidianAppApi.ts:61-64`: `getCache(path): unknown | null` collapses to `unknown` — the
  `| null` documents nothing to the compiler. `object | null` would.
- `src/embedFoldKeys.ts:97` defines `OCCURRENCE_LOCATOR = "occ"` as a named constant while the
  sibling locators `L`/`S` stay inline literals at `:157`. Pick one.
- `CLAUDE.md:73-74`: the post-processor bullet now carries a much-longer-than-neighbours line.
- No e2e pins the design choice of a PER-LINK ordinal over a global embed index — i.e. "inserting
  an unrelated `![[b]]` ABOVE a folded `![[a]]` keeps the fold". It is a claimed guarantee
  (`src/embedFoldKeys.ts:57-59`) with no test; a cheap third case in the new spec would cover it.

## Documentation updates needed

- `src/embedFoldKeys.ts`: fix the "strictly less lossy" claim (S2), the `z4jq` frequency framing
  (S3), the nested-embed mechanism (S5).
- `CLAUDE.md`: trim to a pointer (S6) and inherit the S3 correction.
- `_tickets/…-indexing-the-vault-is-lost-on-the-next-render.md`: drop "strictly less lossy", and
  record the human's decision from B1 (accept vs fix now).
- `nid_7qbtubxk89team9oadnl3hanr_e` is still `in_progress` — close it once B1 is resolved.

## Verdict

The core change is well-designed, well-tested and honestly documented; the failing-first evidence
is real and the spec was not softened. **1 BLOCKING** finding, which is a governance/regression
call rather than a defect in the new key: the cold-cache window trades away behaviour that used to
work, and that trade needs the human engineer's explicit approval (and, either way, the
"strictly less lossy" wording must go). **5 SHOULD-FIX**, mostly documentation honesty and one
incomplete harness guarantee.
