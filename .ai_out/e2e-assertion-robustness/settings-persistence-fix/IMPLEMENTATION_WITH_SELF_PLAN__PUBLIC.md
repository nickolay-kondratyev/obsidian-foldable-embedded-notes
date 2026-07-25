# IMPLEMENTATION_WITH_SELF_PLAN — PUBLIC

Ticket `nid_ocmytlb996sexgks0wagew41s_e`, branch `settings-persistence-fix`.
Commits: `d57f4e3` (the work), `503e624` (an honesty correction to it — read defect 2).

## Headline

Three of the four defects were real and are fixed. **Defect 2's premise is FALSE for the
Playwright version this repo pins** — measured, not assumed. I kept a (smaller) version of that
change and rewrote its rationale rather than shipping a comment that claims a fix nobody needs.

| # | Defect | Verdict | Empirically proven? |
|---|--------|---------|---------------------|
| 1 | Round-trip test never re-renders | REAL, fixed | YES — old test green under a broken store, new test red |
| 2 | Negated matcher passes on a MISSING element | **NOT REAL in Playwright 1.61.1** | YES — the disproof is the measurement |
| 3 | `readPersistedPluginData` throws under `expect.poll` | REAL, fixed | Premise verified in Playwright's source; the throw itself is a timing race, see below |
| 4 | Harness robustness (stdout / listener / bare kill) | REAL, fixed | Not sabotage-provable; see below for what I did instead |

## Plan (as executed)

1. Baseline the suite (37/37 green) before touching anything.
2. Extract one shared fold assertion (`e2e/foldAssertions.ts`) and route all three fold specs
   through it — the defect-2 shape existed in all of them, so fixing it in one spec's private
   helper would have been half a fix.
3. Make the reading-mode "survives a re-render" tests genuinely re-render, via a new
   `ObsidianHarness.reopenThroughOtherFile`, plus a DOM-identity assertion.
4. Harness: `stdio`, stderr listener lifecycle, awaited kill on launch failure,
   never-throwing `readPersistedPluginData`.
5. Prove each fixed assertion fails under sabotage; revert; re-run lint + build + full suite.

## What changed, per defect

### 1. Vacuous round-trip test — FIXED

- `e2e/obsidianHarness.ts`: new `reopenThroughOtherFile(vaultPath, viaVaultPath)`. Its doc
  states WHY a view-mode round-trip is not a re-render (Obsidian keeps the reading-view DOM of
  the file that stays open), so the knowledge lives in one place for both call sites.
- `e2e/foldable-embeds.e2e.ts`: the test is now
  `"fold state survives leaving the note and coming back"` (renamed — the old name described the
  mechanics, and those changed). It detours through `sibling.md`, then asserts, IN THIS ORDER,
  that the embed the locator resolves to is a DIFFERENT DOM node (`elementOf` + `isSameElement`,
  `===` evaluated in the page) and that it is folded. The lying comment
  ("Re-rendered from scratch") is gone.
- `e2e/start-collapsed-setting.e2e.ts`: the sibling test at
  `"an explicit unfold beats the setting, across a re-render"` had the exact same in-place shape
  and the exact same false comment. It now uses `reopenThroughOtherFile` too. Not in the
  ticket; called out here because I changed a test the ticket did not name.

**Evidence.** Sabotage: `FoldStateStore.get()` → `return undefined`.

- New test FAILS:
  `✘ e2e/foldable-embeds.e2e.ts:137 › fold state survives leaving the note and coming back` —
  `Error: expect(locator).toHaveClass(expected) failed / Expected pattern: /\bfen-folded\b/ /
  Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed"` (1 failed,
  16 passed).
- Old test (checked out from `HEAD~1`) PASSES under the SAME sabotage:
  `✓ 5 e2e/foldable-embeds.e2e.ts:115 › fold state survives a reading -> editing -> reading
  round-trip (52ms)` — 21 passed. That is the ticket's vacuity claim, confirmed.

### 2. Negated matcher on a missing element — PREMISE DISPROVEN

I could not reproduce either half of the ticket's story:

- **The regression it predicts does not happen.** Sabotage: both `event.preventDefault()` and
  `event.stopPropagation()` deleted from the title-click handler in `src/embedFoldDom.ts`
  (verified absent from the built `main.js`: `grep -c preventDefault` → `0`). The whole
  `start-collapsed-setting` spec stayed green, 11 passed. In Obsidian 1.12.7 a click on
  `.markdown-embed-title` does not navigate into the embed, so nothing detaches.
- **The matcher does not pass vacuously.** Throwaway spec against a real Obsidian, on a locator
  matching nothing: `await expect(missing).not.toHaveClass(/\bfen-folded\b/)` FAILED with
  `Error: expect(locator).not.toHaveClass(expected) failed / Timeout: 15000ms /
  Error: element(s) not found`. Playwright 1.61.1 requires the element to exist for
  `toHaveClass` in either polarity. (This is matcher-specific: `not.toBeVisible()` does pass on
  a missing element — that is the shape the ticket was thinking of.)
- A third attempt — making the click physically `remove()` the embed — was also inconclusive:
  Obsidian re-renders the section, the locator heals onto the next embed, and the failure that
  results is an ordinary class mismatch, not a detachment.

**What I kept and why.** `e2e/foldAssertions.ts` now owns `expectFolded` for all three fold
specs, and the `folded: false` branch still asserts `toBeAttached()` first. Not as a fix for a
hole that is not there, but because it names the disappearance instead of failing after a 15s
"element(s) not found" timeout on a class assertion, and because it does not depend on
per-matcher empty-locator behaviour staying as it is. The helper's comment says exactly this,
and commit `503e624` corrects the claim I had made in `d57f4e3`'s message before measuring.

Side effect worth naming: the extraction removed the duplicated `fen-folded` regex from three
specs (~25 assertion sites now read `expectFolded(x, true|false)`), and every previously bare
negated fold assertion in `live-preview-foldable-embeds.e2e.ts` and `foldable-embeds.e2e.ts` now
goes through the same guard. No assertion was weakened or removed.

### 3. `readPersistedPluginData` can hard-fail its own poll — FIXED

- Premise VERIFIED by reading the installed Playwright (`node_modules/playwright/lib/matchers/
  expect.js:12951-12961`): `const value = await actual();` sits OUTSIDE the `try` whose `catch`
  returns `continuePolling: true`. A rejection from the polled function aborts the poll.
- The function now never throws: it returns `null` when the file is absent, and `null` after the
  retries are exhausted. `readFileSync` moved INSIDE the `try` as well — `existsSync` can race a
  save that recreates the file, so `ENOENT` there is as transient as a parse error.
- **The inner 5×50ms retry STAYS** (decision, per the ticket's ask): `settings-persistence.e2e.ts`
  reads this ONCE without a poll, to prove no stale write lands after `STALE_WRITE_GRACE_MS`,
  and that call needs its own tolerance — `expect.poll` cannot supply it. Removing the loop
  would have traded a rare hard failure for a rare flake in the strictest assertion in the suite.
- `null` stays the single "no answer yet" value; the doc comment now says so and says why every
  caller asserting a concrete object still fails honestly on a permanently unreadable file
  (as the poll's timeout, not a stray parse error). The `toEqual` contract is untouched.

**Why not sabotage-proven.** The throw only happens when a read lands inside a non-atomic save
AND loses five 50ms retries. I cannot force that from outside the plugin without editing the
production save path into something that isn't the code under test. The premise is proven from
Playwright's own source (quoted above) and the fix is a total function; the suite's persistence
specs stay green, including the strict `toEqual` one.

### 4. Harness robustness — FIXED (all three)

- **stdout**: `spawn(..., { stdio: ["ignore", "ignore", "pipe"] })`. stderr stays piped — the CDP
  endpoint is announced there.
- **stderr listener**: the boot listener is now a named handler removed on EVERY exit path
  (resolve, timeout, `exit`, `error`). It also calls `proc.stderr?.resume()` when it detaches:
  removing the last `data` handler must not leave the pipe unconsumed, or I would have
  re-created on stderr exactly the deadlock I removed from stdout.
- **launch failure**: `await ObsidianHarness.killAndWaitForExit(obsidianProcess)` replaces the
  bare `kill()`.

**Why not sabotage-proven, and what I did instead.**
- The stdout deadlock needs Obsidian to emit ~64KB on stdout. Nothing I control makes it do
  that; the baseline suite was green precisely because it never reaches that threshold in a
  ~7s run. What the green suite DOES prove is that the stdio tuple is correct: a wrong one
  breaks CDP attachment on the first launch, and four Obsidian instances boot and attach.
- A leaked listener's cost is memory in a long session, which no assertion can observe. Fixed
  by construction; the `resume()` guard above is the part that could have gone wrong, and the
  suite (four launches, one relaunch) is green.
- The bare-kill race manifests as a LATER spec's `ENOTEMPTY` masking an earlier failure —
  timing-dependent and, by nature, only visible when a launch already failed. I did exercise
  the catch path itself: `OBSIDIAN_E2E_EXTRA_ARGS="--version"` makes Obsidian exit before CDP,
  and the run failed fast and cleanly with `Error: Obsidian exited before CDP was available:
  code=[null]` — the awaited kill returns immediately on an already-exited process, no hang.
  That proves the path runs; it does not prove the race is gone, and I am not claiming it does.

## Verification

- `npm run lint` → 0 errors (1 pre-existing warning: `prefer-setting-definitions`).
- `npm run build` → OK.
- `npm run test:e2e` → **37 passed**, ~7s Playwright time, no hangs. Run twice (after the code
  change and after the comment correction).
- Every sabotage reverted via `git checkout`; the throwaway proof spec deleted.
  `git status --porcelain` → empty.

## Deliberately rejected

- **Dropping the inner retry in `readPersistedPluginData`** — see defect 3: the non-polled read
  in `settings-persistence.e2e.ts` needs it.
- **A `data-*` stamp for the DOM-identity check** — mutating the DOM under test to measure it;
  handle identity (`===` in the page) says the same thing without touching the subject.
- **Shipping the ticket's defect-2 rationale as a comment** — it is not true here, and a comment
  that teaches a wrong Playwright rule is worse than no comment.
- **Adding a `toBeAttached` to the CHEVRON negated assertions** (`is-collapsed`) — same
  matcher, same non-issue, and the neighbouring `svg` assertion already pins presence.
- **Touching `CLAUDE.md`** — no stable architectural knowledge changed. The Playwright/Obsidian
  facts I measured belong next to the code that depends on them, and that is where they are.

---

# Iteration 2 — review response (review verdict: READY, 0 MUST-FIX, 4 OPTIONAL)

3 of 4 optionals ACCEPTED, 1 REJECTED (with the rejected part re-filed as a follow-up).
Suite after the changes: **37 passed**, lint 0 errors, build OK, tree clean.

### OPTIONAL-1 — `preventDefault`/`stopPropagation` coverage hole — **PARTIALLY ACCEPTED**

- **ACCEPTED**: the comment at `src/embedFoldDom.ts:onTitleClick` no longer makes an
  unverified causal claim. It now names BOTH defaults being suppressed (Obsidian's "open the
  embedded note", and CM6 placing a cursor in Live Preview, where the title sits inside
  `.cm-content`) and then says out loud that neither is covered by a test and that the suite
  measured green with both calls deleted on Obsidian 1.12.7 — so they are a deliberate
  defence, not an observed fix, and must not be dropped on the strength of a green suite.
- **REJECTED**: adding the suggested active-file-unchanged assertion NOW. Reason: it is
  measured to pass in BOTH worlds (with and without the two calls), so it would be a
  knowingly non-falsifiable assertion — precisely the thing this whole ticket exists to
  remove. Worse, "no navigation happened" is the absence of an async event: an immediate
  read only ever proves "not yet", so the assertion would be weak AND racy. The Live Preview
  cursor half is the genuinely uncovered one and needs a real fixture, not a one-liner.
  Filed in `FOLLOW_UP_TICKETS.md` instead.

### OPTIONAL-2 — the array-form vacuity — **ACCEPTED** (highest-value item here)

`e2e/foldAssertions.ts`'s doc now says the vacuity differs per matcher **and per argument
shape of the same matcher**, with the concrete rule: `not.toHaveClass([/re/])` (ARRAY form)
DOES pass on a zero-element locator, the scalar form does not — and an explicit
"do not simplify this to the array form without the guard above".

**Re-measured by me, not inherited** (`.tmp/pw-array-check.mjs`, plain chromium, 1.5s
timeouts, locator matching zero elements):

| assertion | result |
|---|---|
| `not.toHaveClass(/re/)` (scalar — what this repo uses) | **FAILED** |
| `not.toHaveClass([/re/])` (array) | **PASSED** ← vacuous |
| `not.toBeVisible()` | PASSED |

### OPTIONAL-3 — identity guard on the sibling test — **ACCEPTED**

The identity check moved out of `foldable-embeds.e2e.ts` into a shared
`e2e/reRenderGuard.ts` (`captureElement` + `expectFreshElement`, page obtained via
`locator.page()`), and BOTH re-render tests now use it. This is DRY-positive: the spec lost
two local functions, and the WHY ("without this the test can regress to an in-place shape
where the store is never consulted") is now stated once.

**Proven non-vacuous.** Sabotage: in `start-collapsed-setting.e2e.ts` the
`reopenThroughOtherFile` call was replaced by the old in-place `setMarkdownViewMode("source")`
round-trip. Result: `✘ 4 … an explicit unfold beats the setting, across a re-render (39ms)` —
`Error: expected a re-render, but the locator resolved to the SAME DOM node` (1 failed,
3 passed). Reverted; full suite green again.

### OPTIONAL-4 — **PARTIALLY ACCEPTED**

- **ACCEPTED**: `readPersistedPluginData`'s doc now names the caller-side OBLIGATION the
  function cannot enforce — assert a concrete object (`toEqual`/`toMatchObject`); an
  assertion satisfied BY `null` (`toBeNull`, `not.toEqual`) would go green on "the plugin
  never wrote anything".
- **REJECTED**: `browser.close()` on `spawnAndConnect`'s failure path. The reviewer already
  calls it cosmetic (killing the process drops the transport), and it is not free: `browser`
  is a `const` inside the `try`, so this means hoisting a `let browser: Browser | undefined`
  into the function scope — real mutable state bought for no observable behaviour. The
  failure path was exercised end-to-end in iteration 1 and returns promptly. Follow-up filed.

### Files touched this iteration

- NEW `e2e/reRenderGuard.ts`; `e2e/foldable-embeds.e2e.ts` (uses it, local helpers deleted);
  `e2e/start-collapsed-setting.e2e.ts` (guard added); `e2e/foldAssertions.ts` (comment);
  `e2e/obsidianHarness.ts` (comment); `src/embedFoldDom.ts` (comment).
- No assertion was weakened or removed; test count unchanged at 37.

## Follow-ups worth a ticket (TOP_LEVEL_AGENT owns ticket creation)

1. **`isFoldedNow` is a non-retrying read** (`start-collapsed-setting.e2e.ts`): a raw
   `classList.contains` via `evaluate` feeds the dead-click guard's expectation three lines
   before a retrying `expect`. If the flip's re-render lands between them, the test asserts the
   wrong polarity. Low frequency, real fragility.
2. **Post-boot stderr is silently dropped.** Now that the boot listener is properly detached,
   nothing reports an Obsidian crash after launch — the suite just sees timeouts. A small
   "keep the last N KB of stderr, print it on failure" would turn a class of confusing timeouts
   into an explanation.
3. **e2e is not run in CI** (`.github/workflows/lint.yml` is build + lint only). Everything here
   is a local-only gate; worth an explicit decision.
