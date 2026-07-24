# PLAN ITERATION — round 1 disposition

Input: `DETAILED_PLAN_REVIEW__PUBLIC.md` (1 BLOCKING, 4 MAJOR, 7 MINOR).
Output: `DETAILED_PLANNING__PUBLIC.md` **rev 2** — updated in place, still the single plan doc.

Each finding was re-derived against the actual sources before disposition
(`src/foldableEmbedsPostProcessor.ts`, `prototype/livePreviewFoldPrototype.ts`,
`e2e/obsidianHarness.ts`, `src/main.ts`), not accepted on the reviewer's word.

## Disposition table

| ID | Severity | Disposition | What changed / why |
|---|---|---|---|
| F1 | BLOCKING | **ACCEPTED** (variant chosen) | Verified: reading mode's "listener dies with the title element" comment (`foldableEmbedsPostProcessor.ts:79-81`) genuinely does NOT transfer — LP embed DOM is Obsidian's and is reused. Rev 1's `destroy()` really would leave stale listeners and, worse, an unwired chevron after re-enable. §3.5 now has `AbortController` + `EmbedFoldDom.unmark()`; wiring is keyed off a per-view `WeakSet<HTMLElement>` so "has a chevron" and "is wired" can never be conflated. New risk R11. **Sub-option rejected:** the `WeakMap<HTMLElement, () => void>` of removers — `AbortController` is one field and one `abort()` with zero bookkeeping. **Test:** ACCEPTED as e2e test 10 (not merely a manual check) — `app.plugins.disablePlugin/enablePlugin` is already the harness's own mechanism (lines 350-361), so `reloadPlugin()` is ~5 lines; it is ordered second-to-last because it mutates global plugin state, with an explicit instruction to report + downgrade rather than silently delete if it flakes. |
| F2 | MAJOR | **ACCEPTED** | Real bug in the making: `!undefined === true` on the first click of a default-folded marked embed. Rev 1 moved the source of truth to CM state without carrying the marker fallback the prototype got for free from the DOM class. §3.4 now defines ONE `effectiveFold(state, lineFrom)` used by both `sync()` and `toggle()` — DRY of the actual business rule. New e2e test 4 asserts the first click UNFOLDS. |
| F3 | MAJOR | **ACCEPTED** | Confirmed against `foldableEmbedsPostProcessor.ts:177-182`: reading mode observes `attributeFilter: ["class"]` precisely because `markdown-embed` arrives as an attribute mutation, which a `childList`-only observer cannot see. Rev 1 selecting `.internal-embed.markdown-embed` was an unhedged hole. Fix adopted verbatim and it is a *simplification*, not added complexity: select `.internal-embed`, gate on `.markdown-embed-title` presence — strictly stronger (media embeds never get a title bar, so the media bail-out comes free). `attributes: true` explicitly still NOT added (would break R2). §2.2, §3.5, R6 updated. |
| F4 | MAJOR | **ACCEPTED** | The reviewer is right that `MapMode.TrackDel` was the wrong lever (deletion, not insertion assoc). §3.4 now reads with `field.between(line.from, line.to, …)` and writes with a line-range filter. Same code size, and it makes "state is per LINE" structural rather than incidental — which is also the honest expression of the `posAtDOM` line-accuracy constraint. R7 rewritten; R5 references it. |
| F5 | MAJOR | **ACCEPTED** (scope pinned) | Rev 1 contradicted its own stated rationale for §4.2. Added `setCursor`, `replaceRange`, `reloadPlugin` alongside `setLivePreviewEnabled`. **Sub-option rejected:** a generic `withActiveEditor` helper — a typed escape hatch invites arbitrary `app as any` back into specs; three named methods are explicit and finite. Also added the explicit assertion rules (`expect.poll` over an `evaluate`d `.cm-line` textContent; never `toHaveText` on `.cm-line`, which picks up widget text). |
| F6 | MINOR/MAJOR | **ACCEPTED** | Weighed against KISS: a 4th piece of state is a real cost, but `markedEmbedLinesField` is ~6 lines, removes a full-document walk per arrow key AND per `sync()`, and collapses two independent scans into one source. Net simpler, not more complex. `findMarkedEmbedLines` becomes module-private behind the field. R1's "cheap" claim corrected instead of left standing. |
| F7 | MINOR | **ACCEPTED, with a deliberate counter-move** | `isFoldable`/`isFolded` dropped — single-caller `classList.contains` wrappers are indirection; reading mode uses the exported constants directly. **But** `unmark()` is ADDED to `EmbedFoldDom` despite having exactly one caller (LP teardown), because it is the inverse of `markFoldable` + `ensureChevron` and must change whenever they do — that is duplicated *knowledge*, which is the extraction criterion, not caller count. §2.1 states this. The `ensureChevron`-is-a-superset argument was also written into §3.2 as requested. |
| F8 | MINOR | **ACCEPTED** | §4.3 now instructs a probe of the mid-paragraph fixture BEFORE implementing, with both valid assertion shapes spelled out (widget renders → not-folded-by-default + literal dash; no widget → literal dash + no widget). Cost: zero. Prevents an implementer burning time treating an Obsidian rendering fact as their own bug. |
| F9 | MINOR (accept) | **ACKNOWLEDGED** | Reviewer accepted the `editorLivePreviewField` guard. No change; §3.6 stands, guarded by test 11 which stays last. |
| F10 | MINOR (accept) | **ACCEPTED** | Deferral of the unit harness stands. §4.4 now names the three pieces of pure logic the follow-up ticket should call out: `findMarkedEmbedLines`, `effectiveFold`, and the line-range `explicitFoldField` update. |
| F11 | MINOR | **ACCEPTED** | Added as risk R12: if layout thrash or a CM warning appears, the fix is `view.requestMeasure({ write })`, never a `setTimeout`. One line, and it pre-empts exactly the wrong reflex. |
| F12 | MINOR (confirm) | **ACKNOWLEDGED** | Confirmation only. §4.1 now states explicitly that every locator derives from the one helper, and §4.3 notes that `workers: 1` / `fullyParallel: false` is now load-bearing for two suites sharing one vault copy. |

## Counts

- Findings dispositioned: 12 (1 BLOCKING, 4 MAJOR, 7 MINOR).
- **ACCEPTED: 12** (F9 and F12 were the reviewer's own accept/confirm items).
- **REJECTED outright: 0.** Three *sub-options within accepted findings* were rejected with
  rationale (F1 `WeakMap` bookkeeping, F5 generic `withActiveEditor`, F1's "manual check instead of
  a test" fallback), and F7 was accepted with a deliberate counter-move (`unmark` added).

## Complexity delta (guarding against plan bloat)

Net new production code from this round: `unmark` + `AbortController` + `WeakSet` (~10 lines),
`effectiveFold` (~4), `markedEmbedLinesField` (~6). Net REMOVED: the `.markdown-embed` class
condition, two `EmbedFoldDom` predicates, and one of the two document scans. Module count
unchanged. No new abstraction layer, no new interface, no new dependency.

## Readiness

PLANNER: READY

No `#QUESTION_FOR_HUMAN`. The settled ticket scope was not touched: no change here alters the
whole-line-only rule, the per-mode fold state, or the private-node-name prohibition.
