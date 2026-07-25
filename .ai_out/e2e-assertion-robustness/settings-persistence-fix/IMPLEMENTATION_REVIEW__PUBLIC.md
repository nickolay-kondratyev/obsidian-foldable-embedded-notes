# IMPLEMENTATION_REVIEW — PUBLIC

Reviewer: IMPLEMENTATION_REVIEWER. Branch `settings-persistence-fix`, commits `d57f4e3`,
`503e624` (+ `b1a66fc` notes). Ticket `nid_ocmytlb996sexgks0wagew41s_e`.

## Overall: **READY** — 0 MUST-FIX, 4 OPTIONAL

Everything the PUBLIC file claims, I re-measured myself. Every claim held. No test was
removed, no assertion weakened, no hack found. The implementer's headline (defect 2's premise
is false) is **CORRECT**, and the ticket's cited source evidence was read backwards.

| # | Defect | Verdict |
|---|--------|---------|
| 1 | Round-trip test never re-renders | **ACCEPT** — reproduced both halves of the sabotage |
| 2 | Negated matcher on a missing element | **ACCEPT** — premise disproven; implementer is right |
| 3 | `readPersistedPluginData` throws under `expect.poll` | **ACCEPT** — premise real, fix total |
| 4 | Harness robustness | **ACCEPT** — all three correct; one unrelated gap noted |

## F. Independent verification (all re-run by me, not taken on trust)

- `npm run lint` → exit 0, 0 errors, 1 pre-existing warning (`prefer-setting-definitions`).
- `npm run build` → exit 0.
- `npm run test:e2e` → **37 passed** (6.7s), exit 0.
- `git status --porcelain` → empty, before and after all my sabotage runs.
- Test-count audit `bb17636` vs `HEAD`: 9/3/12/2/11 = **37 both**, identical per file. No
  behaviour-capturing test removed or renamed away.

---

## A. Defect 2 — adjudication: the implementer is RIGHT, the ticket was WRONG

**Source evidence (Playwright 1.61.1, `node_modules/playwright-core/lib/coreBundle.js`).**
The injected `_expectCore` does, as the ticket says, return

```js
return { matches: options.isNot, missingReceived: true };
```

for an element that is not there. But the ticket read the polarity backwards. The consumer,
`Frame._expectInternal` (same file, ~line 23457), treats

```js
if (matches === options.isNot)   // → assertion FAILED, keep polling
  lastIntermediateResult.errorMessage = missingReceived ? "element(s) not found" : undefined;
```

Setting `matches = options.isNot` is Playwright's *fail-in-either-polarity* sentinel, not a
pass. Only five expressions are given a real answer on a missing element —
`to.be.hidden`, `to.be.visible`, `to.be.detached`, `to.be.attached`, `to.be.in.viewport`
(plus `to.have.title` / `to.have.url`, which are not element-scoped). `to.have.class` is not
among them.

**Empirical confirmation (mine, `.tmp/pw-check.mjs`, headless chromium, 1.5s timeouts):**

| assertion on a locator matching ZERO elements | result |
|---|---|
| `not.toHaveClass(/re/)` (scalar — the shape this repo uses) | **FAILED** ("element(s) not found") |
| `not.toBeVisible()` | PASSED |
| `not.toHaveClass([/re/])` (ARRAY form) | **PASSED** ← vacuous |

So: the hole the ticket describes is **not open** for the code in this repo. The retained
`expectFolded` shape is the right call, and its comment is accurate.

**One precision the comment is missing (OPTIONAL-1).** The vacuity is not only *per matcher* —
it is also *per argument shape of the same matcher*. `not.toHaveClass([...])` compiles to
`to.have.class.array`, takes the `expectArray` path, and DOES pass on an empty locator. The
helper's doc says "differs per matcher"; saying "…and per argument shape — the ARRAY form of
`toHaveClass` does pass vacuously" would make the `toBeAttached()` guard's value obvious and
stop a future reader from "simplifying" to the array form.

**The load-bearing corollary the ticket assumed and nobody has closed (OPTIONAL-2 — the most
substantive finding in this review).** I reproduced the implementer's second measurement
myself: deleting BOTH `event.preventDefault()` and `event.stopPropagation()` from
`EmbedFoldDom.onTitleClick` (`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/src/embedFoldDom.ts:80-90`)
leaves the **entire 37-test suite green**. That means:

- The doc comment there — *"without them every fold click would also navigate away"* — is an
  unverified causal claim. Per CLAUDE.md ("EXPLICIT without lies or misconceptions"), it is
  either wrong for Obsidian 1.12.7 or it describes something no test observes.
- Do **not** just delete the two lines: `stopPropagation` plausibly still matters in Live
  Preview (CM6 owns clicks in `.cm-content` and would place a cursor), which is equally
  uncovered.
- Cheap guard worth a ticket: after a reading-mode title click, assert the ACTIVE FILE is
  unchanged (`window.app.workspace.getActiveFile().path`), and in Live Preview assert the
  cursor did not jump into the embed's line. Either the comment becomes provable or it gets
  corrected.

## B. Defect 1 — ACCEPT, non-vacuous, reproduced

`/home/nickolaykondratyev/.../e2e/foldable-embeds.e2e.ts:137` +
`ObsidianHarness.reopenThroughOtherFile`.

I ran the sabotage myself (`FoldStateStore.get()` → `return undefined`):

- **NEW test FAILS**: `✘ 5 … fold state survives leaving the note and coming back (15.1s)`,
  `Error: expect(locator).toHaveClass(expected) failed` → 1 failed, 16 passed (4 skipped by
  serial mode).
- **OLD test (checked out from `bb17636`) PASSES under the identical sabotage**:
  `✓ 5 … fold state survives a reading -> editing -> reading round-trip (59ms)` → 21 passed.

That is exactly the evidence the PUBLIC file quotes. The vacuity was real and is closed.

Soundness of the identity assertion: `elementOf` throws rather than returning `null` (so
"two nothings compare equal" cannot happen), the handle keeps the old node alive so it cannot
be GC'd into a false negative, and `isSameElement` does a real `===` in the page. It is
asserted BEFORE the fold assertion, so a regression to the in-place shape fails on the
identity line with a clear message rather than accidentally passing. The misleading
"Re-rendered from scratch" comment is gone from this spec; the same phrase at
`start-collapsed-setting.e2e.ts:166` remains but is now TRUE, since that test also goes
through `reopenThroughOtherFile`.

**OPTIONAL-3.** The sibling test `"an explicit unfold beats the setting, across a re-render"`
(`start-collapsed-setting.e2e.ts:155`) got the real re-render but NOT the DOM-identity guard,
so only one of the two tests is protected against silently regressing back to an in-place
round-trip. Either lift the identity check into a small shared helper next to
`reopenThroughOtherFile` and use it in both, or state in that test why it is not needed.

## C. Defect 3 — ACCEPT, premise verified in source AND empirically

`invokePollMatcher` (`node_modules/playwright/lib/matchers/expect.js:12951-12959`) has
`const value = await actual();` OUTSIDE the `try` whose `catch` returns
`{ continuePolling: true }`. I confirmed the consequence with a standalone script: a polled
function that throws twice then succeeds **propagates on the first throw** (`calls=1`), it
does not retry. The premise is real; a throwing `readPersistedPluginData` would hard-fail
every poll built on it.

`null` conflation — checked, and it does **not** create a vacuous pass:
- `expectPersistedStartCollapsed` → `.toMatchObject({startCollapsed})`; `null` fails
  `toMatchObject`, so the poll keeps going and eventually times out honestly.
- `expectPersistedData` → strict `.toEqual({startCollapsed, someFutureSetting})`; `null` fails.
- The one NON-polled read (`settings-persistence.e2e.ts:129`) is also a strict `toEqual`, so an
  unreadable file fails the spec rather than passing it. **The strict `toEqual` contract is
  intact** — I diffed it against `bb17636`: unchanged.

There is no caller that would go green on `null` (no `toBeNull`, no `not.toEqual`). Keeping the
inner 5×50ms retry is the right call: the non-polled read at line 129 has no other tolerance,
and 250ms max sits well inside the poll intervals. Worst case the fix converts a rare hard
throw into a rare honest failure — a strict improvement.

**OPTIONAL-4.** The "`null` is safe" argument depends on a caller-side convention the harness
cannot enforce. One line in the doc — "a caller that asserts `toBeNull()`/`not.toEqual` on this
would be vacuous; assert a concrete object" — makes the contract self-defending. Low value,
zero risk.

## D. Defect 4 — ACCEPT (all three), plus one pre-existing gap

- **`stdio: ["ignore","ignore","pipe"]`** — correct, and **no diagnostics are lost**: nothing
  ever read stdout before either, so its content was already invisible; the change only stops
  it filling an OS pipe buffer. stderr must stay piped (CDP endpoint), and it is.
- **stderr listener** — `stopListening()` is called on all four exit paths (match, timeout,
  `exit`, `error`) and, crucially, calls `proc.stderr?.resume()`. That is the documented
  consume-and-discard; without it, removing the last `data` handler would have re-created on
  stderr exactly the deadlock removed from stdout. The unbounded `stderrSoFar` accumulation is
  now bounded to boot time. Correct.
- **awaited kill on launch failure** — `await ObsidianHarness.killAndWaitForExit(...)`; I
  grepped every `.kill(` in `e2e/`: only `killAndWaitForExit`'s own `proc.kill()` and the
  bounded `SIGKILL` backstop remain. **No other bare `kill()` path exists.** The early-return
  on an already-exited process is right, so the `--version` fast-exit path cannot hang.

**OPTIONAL (small, same file, pre-existing but in the code being hardened).** In
`spawnAndConnect`'s `catch`, the CDP `browser` is not closed when `connectOverCDP` succeeded
but a later step (`waitForObsidianWindow` / `waitForWorkspaceReady` / `enableCommunityPlugins`)
threw. Killing the process drops the transport in practice, so this is cosmetic, but a
`await browser?.close().catch(() => {})` alongside the kill would make the failure path
symmetric with `close()`. Also noted, not worth acting on: `waitForDevtoolsEndpoint`'s
`proc.on("exit")` / `proc.on("error")` listeners are never removed — 2 per process, constant,
and the `error` one is actively useful (it prevents a late unhandled `'error'` event).

## E. Honesty audit — PASSES

Every claim in `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` that I could re-measure, I did, and
each one held (defect-1 sabotage both directions, defect-2 disproof both halves, defect-3
Playwright source + poll behaviour, 37-passed, clean tree). The file is notably honest where it
would have been easy not to be:

- It labels defects 3 and 4 "not sabotage-proven" and says *why* instead of implying coverage.
- `503e624` exists solely to retract a claim made in `d57f4e3`'s message before it was measured
  — the right instinct, and the shipped comment now teaches the measured rule, not the ticket's.
- It calls out changing `start-collapsed-setting.e2e.ts`, a spec the ticket did not name.
- The overlapping-clicks test's "BE HONEST about what this test is: a GUARD, not a
  reproduction" comment is pre-existing but in the same spirit and still accurate.

No test can now pass vacuously that could not before; the change is monotonically
strengthening (~25 bare negated `not.toHaveClass` sites in three specs replaced 1:1 by
`expectFolded`, with `toBeAttached()` added on the negative branch). I verified the
`live-preview-foldable-embeds.e2e.ts` diff is a pure 1:1 substitution with nothing dropped.

## MUST-FIX

None.

## OPTIONAL (in value order)

1. **Ticket the `preventDefault`/`stopPropagation` coverage hole** (`src/embedFoldDom.ts:80`):
   the suite is green without them, so either the WHY comment is wrong for Obsidian 1.12.7 or
   the behaviour is untested. Suggested guard: active-file-unchanged after a reading-mode title
   click; cursor-did-not-move after a Live Preview one. Do not delete the lines on the strength
   of the green suite alone.
2. **Sharpen `foldAssertions.ts`'s comment**: vacuity differs per matcher *and per argument
   shape* — `not.toHaveClass([...])` (array form) DOES pass on a missing element; the scalar
   form does not. Measured here.
3. **Give `start-collapsed-setting.e2e.ts:155` the same DOM-identity guard** as
   `foldable-embeds.e2e.ts:137`, or say why it is exempt.
4. **One line in `readPersistedPluginData`'s doc** naming the caller-side obligation that keeps
   `null` unambiguous; and optionally `browser.close()` on `spawnAndConnect`'s failure path.

The implementer's own three follow-ups (non-retrying `isFoldedNow`, post-boot stderr dropped
silently, e2e not in CI) are all real and worth tickets. I would rank the `isFoldedNow` one
above my OPTIONAL-3.

## Documentation Updates Needed

None. I agree with the decision not to touch `CLAUDE.md`: the Playwright-1.61.1 and
Obsidian-1.12.7 facts measured here are volatile version-specific details, and CLAUDE.md is for
stable knowledge. They belong next to the code that depends on them, which is where they are.
