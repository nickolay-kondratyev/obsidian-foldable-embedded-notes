# IMPLEMENTATION_REVIEWER — private memory

Session 1. Reviewed `031c396..61434ca` on `master`. Wrote `IMPLEMENTATION_REVIEW__PUBLIC.md`.
Verdict: **IMPLEMENTATION_ITERATION: REQUIRED** (3 MAJOR + 8 MINOR, 0 BLOCKING).

## What I actually ran (all read-only)

- `npm run lint` → exit 0, no output. `.tmp/rev_lint.txt`
- `npm run build` → exit 0. `.tmp/rev_build.txt`
- `npm run test:e2e` → **22 passed**, exit 0, real Obsidian 1.12.7 headless. `.tmp/rev_e2e_1.txt`
  - NOTE: the "22 passed (3.1s)" line looks fake-fast; I checked the full log — Obsidian really
    launches (`setup-obsidian-bin: using cached binary (Obsidian 1.12.7)`), the 3.1s is per-test
    body time only, `beforeAll` launch is excluded. Not a fake. Don't re-panic about this.
- `git show 031c396:e2e/foldable-embeds.e2e.ts | grep '^test('` vs current → 8 vs 8, identical
  titles. No behaviour-capturing test removed/skipped. Confirmed no `test.skip/only/fixme`.
- grep for `syntaxTree|@codemirror/language|nodeName` in `src/` → none (AC7 clean).
- `node_modules/obsidian/package.json` peerDependencies == `@codemirror/state 6.5.0`,
  `@codemirror/view 6.38.6` == exactly what package.json pins. devDependencies is the right
  bucket (externalised in esbuild).
- `.dev-vault/child.md` has NO nested `![[ ]]` → that is why F1 is untested.

I did NOT do mutation testing (instructed not to modify source/tests). All "would it fail on
regression" answers are from reading the assertions, not from breaking the code. If a future
session is allowed a throwaway worktree, mutation-testing F1/F2/F3 would be the highest-value
follow-up.

## The three findings I will defend

**F1 (MAJOR) — nested embeds.** `livePreviewFoldExtension.ts:97-99` `querySelectorAll` is
depth-unscoped; `anchorLineStart` on a nested embed → `posAtDOM` resolves to the OUTER widget's
line. Certain from the code, no speculation needed for the core claim: clicking a nested embed's
title dispatches `setLineFold` for the parent's line → the parent collapses. Secondary (slightly
less certain, phrased as "likely" in the public doc): the reading-mode post-processor also runs
over embed bodies rendered inside the LP editor, and LP's `wiredTitles` WeakSet does not know
about a mark left by the post-processor, so the same title can get two listeners. I deliberately
anchored the finding on the anchor bug (certain) not the double-wiring (inferred).
Fix I proposed: `if (embed.parentElement?.closest(SEL_INTERNAL_EMBED) !== null) continue;` —
nested ones stay foldable via the post-processor, which handles them correctly.

**F2 (MAJOR) — `posAtDOM` throws, never returns < 0.** VERIFIED in
`node_modules/@codemirror/view/dist/index.js:8182` → `posFromDOM` at `:3113` which does
`throw new RangeError(...)`. So `if (pos < 0) return null` is dead code AND the JSDoc
"@returns null when the element is not part of this view" is false. Blast radius argument: CM6
wraps `ViewPlugin.update` in try/catch and **deactivates the plugin instance** on throw → folding
silently dies for that view for the session. This is the finding most likely to be pushed back on
("can it actually throw?") — the answer is that the MutationObserver exists precisely because
Obsidian mutates embed DOM outside CM's knowledge, so a node inside contentDOM with no view desc
is the expected steady state during async render. Cheap fix either way; the false JSDoc alone
violates CLAUDE.md "no lies or misconceptions".

**F3 (MAJOR, test) — teardown never asserted.** `e2e/...:197-210` does
`reloadPlugin()` then `preview`→`source`, which rebuilds the editor DOM before any assertion. A
totally leaky `destroy()` passes. Teardown was the reviewer brief's explicit concern and it is
the one thing with no falsifiable assertion. Fix: assert `.cm-content .fen-embed` count 0 while
the plugin is disabled (needs splitting `reloadPlugin` into enable/disable).

## Vacuity analysis I did on every LP test (keep this, it was the expensive part)

- test 18 `EMBED_MARKED` assertion (`:165-171`): **VACUOUS**. Re-folding a marked line makes
  explicit == marker default, so losing the mapped anchor changes nothing (`explicit ?? marker`
  → `undefined ?? true` → true). Comment claims it puts a marker-default line "in play" — it
  doesn't prove anything. → F4. Fix: UNfold it instead and assert `not.toHaveClass`.
- test 18 `EMBED_UNMARKED` assertion (`:170`): **sound** — no marker fallback, so a broken
  mapping shows.
- test 19 (`:174`): **the strongest test in the suite.** Typing `x` makes the line
  `x![[child]]-` → no longer a whole-line marker → `isMarkedLine` false → only a correctly
  line-RANGE-mapped explicit anchor keeps it folded. Genuinely non-vacuous.
- test 22 (`:212`): non-vacuous, and the cursor is deliberately parked off the line first to
  avoid tautology. Good.
- `lineTextOfEmbed` returning `""` on a `closest(".cm-line")` miss makes every `toBe(false)`
  dash assertion conditionally vacuous → F5. Rescued in practice by `:141` asserting `toBe(true)`
  with the same helper, but implicitly.
- Mapping semantics worth remembering: the zero-length anchor maps **after** text inserted at its
  position. That is why test 18's insert at `{line: LINE_UNMARKED, ch: 0}` still works (anchor
  lands on the embed's new line) and why the line-RANGE lookup in `explicitFoldAt` is needed for
  test 19. The code comments are correct about this.

## Deviations verdict (don't re-derive)

D1 and D2 are both CORRECT and honestly described, and BOTH made the suite stricter rather than
looser. D1's `setViewState({state:{source:!enabled}})` is confirmed to work by test 22 observing
0→1 dash-terminated lines. D2's range-replace prevents test 19 from permanently disarming the
marker for tests 20-22; the report volunteers that an intermediate run passed for the wrong
reason, which is exactly the transparency CLAUDE.md asks for. Credit this in any follow-up.
D3/D4 fine.

## Things I checked and found CLEAN (don't re-litigate)

- Reading mode unchanged: `ensureChevron` idempotency is unreachable-different because
  `processEmbed` still early-returns on `fen-embed`. 8/8 tests byte-identical.
- `styles.css` untouched (ticket required this).
- Security: nothing. No network/fs/eval/secrets; regex anchored with a negated class, no
  backtracking risk; only `classList` + `createSpan` + `setIcon`.
- `Decoration.set(hidden)` sortedness: marked lines are collected in doc order, one point each →
  already sorted. Fine.
- MutationObserver loop termination: `childList` only, class toggles are attribute mutations, so
  the chevron insert costs exactly one extra no-op pass. The code comment is accurate.
- `destroy()` ordering (disconnect → abort → unmark) is correct.
- CLAUDE.md architecture section matches the code accurately.

## Minor findings list (F5-F11) — see PUBLIC for detail

F5 `lineTextOfEmbed` `""` fallback; F6 spec header falsely claims the LP and reading-mode suites
share a vault/window (`launch` makes a fresh copy + own Obsidian per `beforeAll`,
`obsidianHarness.ts:106,306`); F7 `SEL_INTERNAL_EMBED` duplicated, belongs in `EmbedFoldDom`;
F8 whole-doc rescan per keystroke, suggest `doc.iterLines()`; F9 `setLineFold` doesn't map
`lineFrom` through `tr.changes` (latent, safe today); F10 media-filter rule diverges between
modes; F11 README lead paragraph vs the per-mode bullet.

## If asked to re-review after iteration

Check in this order: (1) nested-embed skip + a nested-embed e2e case, (2) `try/catch` around
`posAtDOM` and the JSDoc corrected, (3) the disabled-state count-0 assertion, (4) test 18's
marked assertion inverted. Then re-run lint/build/e2e and confirm the reading-mode 8 are still
byte-identical.

---

# Session 2 — convergence check, round 1 (`65e7291..5a2ffc4`)

Verdict: **IMPLEMENTATION_REVIEWER: READY**. All 11 findings resolved, 0 rejected, no new
defect. Appended `## Convergence check — round 1` (sections 9-13) to the PUBLIC review.

## What I ran myself (read-only)

- `npm run lint` exit 0 (`.tmp/conv1_lint.txt`), `npm run build` exit 0 (`.tmp/conv1_build.txt`),
  `npm run test:e2e` → **23 passed / 0 failed / 0 skipped**, exit 0 (`.tmp/conv1_e2e.txt`).
  The implementer's claimed 23/0/0 is CONFIRMED independently. Same "3.2s" fast-total artefact
  as session 1 — again NOT fake, `beforeAll` launch is excluded from that number. Do not re-panic.
- Numeric proof of the F8 rewrite: `node` + `Text.of([...])` with leading/interior/trailing empty
  lines; `iterLines()` + running offset produced `(from, text)` pairs IDENTICAL to indexed
  `doc.line(n)`. This was the one fix that could have silently broken marker detection, and it is
  now proven, not eyeballed. Don't redo it.
- Read `.tmp/e2e_failfirst.txt` and `.tmp/it_e2e_sabotage.txt` directly — both are genuine
  Playwright output (retry counts, real class strings, real line numbers), not prose. F1 and F3
  falsification claims are honest.

## Why I did NOT mutation-test myself

Brief forbade modifying source/tests and confined writes to the working dir; a `.worktree/` copy
would have breached that. The implementer's two red logs are strong enough (real locator dumps),
and F1's new test asserts three independent things, so "fix by disabling the feature" cannot pass.

## Per-finding closure notes (so a future session need not re-derive)

- F1: `topLevelEmbeds()` used by BOTH `sync()` and `destroy()` — I checked destroy() specifically,
  since a filter applied only to sync() would have leaked marks. It isn't.
- F1's resolution CLAIM ("nested still foldable in LP via the post-processor") is genuinely
  asserted in test 23 (`expect(nested).toHaveClass(FOLDED_RE)` inside `.cm-content`), not narrated.
  My session-1 worry that skipping nested embeds = capability loss was WRONG; the probe corrected it.
- F3: the rewritten test has a `not.toHaveCount(0)` baseline before disabling → cannot pass on an
  empty/typo'd selector. That closes the last vacuity hole I flagged.
- F4: test 18 inverted exactly as I proposed; test 19 gained the re-fold precondition, so the
  serial chain still holds. My vacuity analysis in session 1 stands and is now spent.

## One thing I deliberately did NOT gate on

The post-processor still has no unload-time unmark, so a chevron on a NESTED embed rendered
inside the editor can outlive a plugin disable. Pre-existing reading-mode behaviour, unchanged by
this work, out of scope for a convergence round. Recorded in PUBLIC §12 as a follow-up ticket
candidate. If it comes back, it is a ticket, not a rejection of this change.
