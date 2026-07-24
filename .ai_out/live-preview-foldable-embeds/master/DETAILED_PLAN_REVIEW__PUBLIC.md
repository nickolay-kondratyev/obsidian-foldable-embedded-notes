# DETAILED PLAN REVIEW — Live Preview foldable embeds (CM6)

Reviewed: `DETAILED_PLANNING__PUBLIC.md` (rev. as of this review) against
`_tickets/implement-live-preview-foldable-embeds-cm6.md`, `EXPLORATION_PUBLIC.md`,
`prototype/livePreviewFoldPrototype.ts`, `prototype/probe-live-preview.e2e.ts`, and the
current `src/`, `styles.css`, `e2e/`, `package.json`, `esbuild.config.mjs`.

## Executive summary

The plan is good: scope-faithful (no violation of the settled "Scope (KISS)" section), every
Acceptance Criterion is mapped to a concrete e2e test, the module split is sane, and the two
flagged deviations are both correct calls. What it gets wrong is **teardown** and a handful of
**state-lookup/readiness details where the plan deliberately drops prototype machinery that was
load-bearing**. Those need to be fixed before implementation starts, so: PLAN_ITERATION REQUIRED.

Both flagged additions: **ACCEPT** (§F9, §F10 below).
The "open design call" (`src/embedFoldDom.ts` yes, shared readiness observer no):
**ACCEPT the decision**, with one correctness condition (F3).

---

## AC coverage check

| AC (ticket) | Plan coverage | Verdict |
|---|---|---|
| Click-foldable in LP, same chevron | tests 1, 2 | covered |
| Whole-line `![[x]]-` folded + dash hidden + revealed on cursor | tests 3, 4 | covered |
| Mid-paragraph marker left alone | test 5 | covered (see F8 — fixture risk) |
| Fold survives edits elsewhere | tests 6, 7 | covered |
| Reading-mode suite green + new suite passes | §4.1 + Commit A ordering | covered |
| `npm run lint` / `npm run build` clean | §6, §8 | covered |
| No private syntax-tree node names | design uses raw-text regex only | covered by construction |
| README states both limitations | §5 | covered |

No AC is unmapped. Verified independently: `editorLivePreviewField` is public
(`node_modules/obsidian/obsidian.d.ts:2485`); `@codemirror/state@6.5.0` / `@codemirror/view@6.38.6`
are `obsidian`'s peerDependencies and are already present in `node_modules` and already
externalised in `esbuild.config.mjs` — §3.8 is accurate.

---

## Findings

### F1 — BLOCKING: no teardown; after a plugin reload the chevrons are dead

§3.5 `destroy()` "disconnect the observer. Nothing else to clean up." and §3.7 "Nothing to add to
`onunload`". That is factually wrong for Live Preview, and it differs from reading mode in the way
that matters:

- Reading mode's title listener "lives and dies with this freshly-created title element"
  (`src/foldableEmbedsPostProcessor.ts:79-81`) because reading mode re-renders the DOM from scratch.
- In Live Preview the embed widget DOM is **Obsidian's** and is **reused across edits** (exploration
  Q3). Our injected `.fen-collapse-icon` span, `fen-embed`/`fen-folded` classes and the title click
  listener therefore **survive plugin unload / extension reconfiguration**.

Two concrete consequences:
1. Stale listeners keep a reference to a destroyed `EditorView`; a click after unload dispatches
   into it.
2. On re-enable (plugin update without an Obsidian restart, `Reload app without saving`, dev
   iteration), `ensureChevron` finds the leftover chevron and — per §3.5, the listener is attached
   "on FIRST creation" only — **never re-attaches the click handler**. The embed then looks foldable
   and is not. Straight POLS violation, and one that will look like a flaky bug report.

**Resolution:** `destroy()` must undo what `sync()` did — for every `.fen-embed` in `contentDOM`,
remove `fen-embed`/`fen-folded`, remove the chevron span, and remove the listener (keep a
`WeakMap<HTMLElement, () => void>` of removers, or use an `AbortController` signal passed to
`addEventListener` and abort it in `destroy()` — the latter is 3 lines and removes all bookkeeping).
Decouple "has a chevron" from "is wired": wiring must be keyed off something we also tear down.
Add an e2e test or at minimum a documented manual check (disable + re-enable the plugin, click still
folds).

### F2 — MAJOR: `toggle()`'s "current fold" must include the marker default

§3.5 says toggle should "read the CURRENT effective fold from **CM state** (not from the DOM class)".
Effective fold is `explicitFoldAt(state, lineFrom) ?? markerLineStarts.has(lineFrom)`. If the
implementer reads only `explicitFoldField`, then the FIRST click on a marked, default-folded embed
computes `!undefined === true` and dispatches `folded: true` — the embed stays folded and the click
appears dead. The prototype avoided this by reading the DOM class (which encodes the effective
value); the plan changed the source of truth without carrying the fallback.

**Resolution:** extract ONE `effectiveFold(state, lineFrom): boolean` (explicit ?? marker) and use it
from both `sync()` and `toggle()` — DRY of the actual business rule, and it removes the ambiguity.
Add an e2e assertion: clicking a default-folded marked embed UNFOLDS it (currently no test covers the
first click on the marked embed).

### F3 — MAJOR: dropping the per-embed observer also drops the `.markdown-embed` class wait

§2.2/§3.5 justify removing the prototype's per-embed observers because the `contentDOM` subtree
`childList` observer sees the title insertion. That is true for the title, but §3.5 selects
`.internal-embed.markdown-embed` and the plan deliberately does **not** observe attributes. The
`markdown-embed` class is added to the container by Obsidian as an **attribute** mutation —
`src/foldableEmbedsPostProcessor.ts:177-182` observes `attributeFilter: ["class"]` for exactly this
reason. If Obsidian adds the class after the last childList mutation in that batch, the embed is
never picked up until an unrelated mutation happens. The plan asserts a simplification that the
prototype's structure was hedging against, and R6 only covers "late titles", not "late class".

**Resolution (cheap and observer-free):** select `.internal-embed` and gate on
`querySelector(".markdown-embed-title") !== null`. Title presence already implies a resolved note
embed (media embeds never get a title bar), so the class check is redundant and the childList
observer fully covers the readiness condition. Do NOT add `attributes: true` to the contentDOM
observer — that reintroduces the self-trigger loop the plan correctly avoids in R2.

### F4 — MAJOR: line-anchored fold state should be looked up by LINE RANGE, not exact position

R7 acknowledges the risk of an edit AT the line start and proposes `MapMode.TrackDel` as the escape
hatch. `TrackDel` is the wrong lever — it governs deletion, not the assoc of an insertion at the
anchor. The realistic failure is: insert text at the line start → the zero-length anchor maps to
*after* the inserted text → `doc.lineAt(posAtDOM(embed)).from` no longer equals the stored anchor →
fold state silently lost (exactly what test 7 will catch).

**Resolution:** make the semantics match the design intent ("state is per LINE"). Read with
`field.between(line.from, line.to, …)` and write with a filter over `[line.from, line.to]` rather than
exact-position equality. That is robust against any intra-line remapping, is the same amount of code,
and makes the "embeds sharing a line share fold state" rule structural rather than incidental.
Update R7's escape-hatch text accordingly.

### F5 — MAJOR: the e2e harness additions are under-specified; tests 4/6/7 need editor control

§4.2 adds only `setLivePreviewEnabled`. But test 4 needs cursor placement (and a second move away),
tests 6/7 need document edits — the probe did all of that with raw `page.evaluate` +
`window.app as any`. The plan's own stated rationale for §4.2 is "keeps the `window.app as any`
bridge in one place"; leaving these inline in the spec contradicts it.

**Resolution:** add to `ObsidianHarness` alongside `setLivePreviewEnabled`:
`setCursor(line, ch)` and `replaceRange(text, line, ch)` (or a single narrowly-typed
`withActiveEditor` helper). Also spell out how test 4 asserts without a sleep — the probe used
`setTimeout(400)`; the replacement must be `expect.poll(() => <evaluate .cm-line textContent>)`, and
the plan should say so explicitly since `toHaveText` on `.cm-line` also picks up the widget's
rendered text.

### F6 — MINOR/MAJOR (implementer's call, but justify it): full-document scan on every selection change

`findMarkedEmbedLines` is invoked (a) by `EditorView.decorations.compute([…, "selection"])` on every
cursor move and (b) again by every `sync()` (i.e. every childList mutation in `contentDOM`). Both
walk `doc.lines` end to end. On a large note that is a full-document scan per arrow key. R1 calls
`sync()` "cheap" without accounting for this.

**Resolution (≈10 lines, also DRY):** hold the scan in a `StateField<MarkedEmbedLine[]>` recomputed
only when `tr.docChanged`; the decoration compute and `sync()` both read it. Selection moves then
cost O(markers). If deferred, say so explicitly with a WHY-NOT rather than leaving R1's claim as is.

### F7 — MINOR: trim `EmbedFoldDom` to what is genuinely shared

The extraction decision is sound — the four class names + chevron glyph + the
`preventDefault`/`stopPropagation` WHY are real duplicated knowledge, `styles.css` is the third copy,
and the module is stateless with no lifecycle. Two of the seven members are single-caller
`classList.contains` wrappers though: `isFoldable` (reading mode only) and `isFolded` (reading mode
only, since §3.5 makes LP read CM state). One-caller wrappers are indirection, not DRY.

**Resolution:** keep `markFoldable` / `ensureChevron` / `applyFoldState` / `onTitleClick` / the
exported constants; drop the two predicates unless F1's teardown gives them a second caller.

Also worth stating explicitly in §3.2: `ensureChevron` is a behaviour-preserving superset of reading
mode's unconditional `createSpan` (reading mode's re-entry guard already prevents a second call), so
"zero behaviour change" holds. Good that Commit B is proved by the existing suite.

### F8 — MINOR: test 5's fixture is the one thing the prototype never exercised

Exploration constraint D covers `![[x]]-` as an inline widget on its OWN line. Nobody has verified
that `Inline ![[child]]- tail text.` renders an embed widget mid-paragraph in Live Preview at all.
If it does not, test 5 must assert the divergence differently (literal dash present, no widget) —
which is still a valid AC3 proof.

**Resolution:** note this in §4.3 so the implementer probes it first instead of treating a mismatch
as a bug in their code.

### F9 — ACCEPT: `editorLivePreviewField` guard (§3.6)

Correct call, not a scope change. Hiding a real `-` character in plain Source mode is a data-looks-
lost bug and a POLS violation; the field is public API (verified). The "ViewPlugin needs no guard —
Source mode renders no embed widgets" reasoning is right, and test 9 guards it. Keep test 9 last as
planned (it mutates app config; the harness copies the vault per launch, so nothing leaks between
runs).

### F10 — ACCEPT: deferring the unit-test harness (§4.4)

Correct 80/20. The repo has no unit runner; adding vitest + config + CI to cover one regex and one
StateField is not this ticket's value. Both are exercised end-to-end by tests 3/5/6/8. The follow-up
ticket is the right disposition. Note the follow-up should also mention F2's `effectiveFold` and F4's
line-range lookup as the pure logic most worth unit-testing.

### F11 — MINOR: DOM writes inside `update()`

`sync()` is called synchronously from `ViewPlugin.update()`, i.e. it writes DOM during CM's update
cycle. The prototype did this and worked, so it is not blocking — but if layout thrash or a CM
warning shows up, the fix is `view.requestMeasure({ write: … })`, not a `setTimeout`. Worth one line
in §7 so nobody reaches for a timer.

### F12 — MINOR: `.markdown-reading-view` scoping is sufficient

Confirmed: every locator in `e2e/foldable-embeds.e2e.ts` derives from `foldableEmbeds()`
(lines 61-63) or from `page` via that helper, so scoping the one helper fixes the whole suite. The
LP suite correctly scopes to `.cm-content`. Commit A landing first, verified green before the feature
exists, is exactly the right ordering.

---

## Strengths

- Scope discipline: nothing in the plan reopens the settled ticket scope; the whole-line rule, the
  per-mode state and the private-node-name prohibition are all respected.
- The "rejected alternative" in §2.3 (`FoldableEmbedController` + `FoldStateSource`) is rejected for
  the right reason — the two lifecycles do not unify and the interface would abstract over
  incompatible identities. That is a genuinely forced abstraction avoided.
- R2's feedback-loop analysis (attribute mutations unobserved; chevron insertion self-terminating)
  is correct and is exactly the non-obvious thing a maintainer needs told.
- Commit sequencing (behaviour-neutral e2e scoping → pure refactor proved by the existing suite →
  feature with the spec written first) is disciplined and reviewable.
- "No fixed sleeps — the prototype's `setTimeout(400)` must not survive" is the right standard.

## Flakiness assessment of the new suite

Low risk *if* F5's polling is specified. The two real flake sources are (a) async embed rendering —
handled by `beforeAll` waiting for the last embed to be attached plus web-first assertions, and
(b) the `.cm-line` text assertions in tests 3/4/5, which are `evaluate`-based and therefore need
`expect.poll`, not a bare `expect`. `workers: 1` + `fullyParallel: false` in
`e2e/playwright.config.ts` means the second spec file cannot race the first over the shared vault
copy — good, but worth a one-line note in §4.3 that this invariant is now load-bearing for two
suites.

---

## Inline minor edits made to `DETAILED_PLANNING__PUBLIC.md`

1. §3.8 — annotated the pinned CodeMirror versions as verified against
   `node_modules/obsidian/package.json` (obsidian 1.12.3).

No other inline edits; everything else above is feedback for PLAN_ITERATION.

---

## Severity counts

- BLOCKING: 1 (F1)
- MAJOR: 4 (F2, F3, F4, F5)
- MINOR: 7 (F6, F7, F8, F9-accept, F10-accept, F11, F12)

## Verdict

PLAN_ITERATION: REQUIRED

---

## Convergence check — round 1

Checked `DETAILED_PLANNING__PUBLIC.md` **rev 2** text itself (not the disposition table), plus the
settled ticket scope in `_tickets/implement-live-preview-foldable-embeds-cm6.md`.

### Per-finding status

| ID | Sev | Status | Evidence in rev 2 (plan text, not the disposition) |
|---|---|---|---|
| F1 | BLOCKING | **RESOLVED** | §3.5 fields `listeners = new AbortController()` + `wiredTitles = new WeakSet`; `destroy()` = `disconnect()` + `listeners.abort()` + `EmbedFoldDom.unmark(embed)` per `.fen-embed`; wiring explicitly keyed off `wiredTitles`, NOT "a chevron exists" — the conflation that caused the dead-chevron failure is structurally impossible now. §3.7 no longer claims "nothing to clean up". §1 assumptions state the reused-DOM fact. R11 + e2e test 10 guard it. |
| F2 | MAJOR | **RESOLVED** | §3.4 defines `effectiveFold(state, lineFrom) = explicitFoldAt(...) ?? isMarkedLine(...)` with the `!undefined === true` WHY; §3.5 `toggle()` calls it. Test 4 asserts the FIRST click on the default-folded marked embed unfolds. |
| F3 | MAJOR | **RESOLVED** | §2.2 rev-2 correction + §3.5 select `.internal-embed` and gate on `SEL_EMBED_TITLE` presence; `attributes: true` explicitly still excluded (R2 preserved); R6 rewritten to say title presence is the ONLY readiness condition. |
| F4 | MAJOR | **RESOLVED** | §3.4 write = line-range `filter: (from) => from < line.from || from > line.to`; read = `field.between(line.from, line.to, …)`. R7 rewritten and explicitly retracts `MapMode.TrackDel`. New test 8 covers insertion at line start. |
| F5 | MAJOR | **RESOLVED** | §4.2 adds `setCursor`, `replaceRange`, `reloadPlugin` next to `setLivePreviewEnabled`, all behind the harness. §4.3 assertion rules mandate `expect.poll` over an evaluated `.cm-line` textContent and forbid `toHaveText` on `.cm-line`; the `workers: 1` invariant is noted. |
| F6 | MINOR/MAJOR | **RESOLVED** | §3.3 `markedEmbedLinesField`; `findMarkedEmbedLines` module-private; R1's "cheap" claim corrected to state the scan is cached. |
| F7 | MINOR | **RESOLVED** | §3.2 drops `isFoldable`/`isFolded` with the single-caller rationale; `ensureChevron`-is-a-superset argument written into §3.2. |
| F8 | MINOR | **RESOLVED** | §4.3 "Probe first, then write test 6" with both valid assertion shapes spelled out. |
| F9 | accept | **RESOLVED (no change needed)** | §3.6 stands; guard test is now test 11, still last. |
| F10 | accept | **RESOLVED** | §4.4 names `findMarkedEmbedLines`, `effectiveFold`, and the line-range `explicitFoldField` update for the follow-up ticket. |
| F11 | MINOR | **RESOLVED** | R12: `view.requestMeasure({ write })`, never `setTimeout`. |
| F12 | MINOR | **RESOLVED** | §4.1 states every locator derives from the one helper; §4.3 notes the shared-vault serialisation invariant. |

**NOT-RESOLVED: none.**

### Rejected sub-options — technically sound?

- **`AbortController` over a `WeakMap<HTMLElement, () => void>` of removers — SOUND.** One field and
  one `abort()` vs. a map that must be kept in sync with every add/remove path. `AddEventListenerOptions.signal`
  is long-standing Chromium API, safe on Obsidian's Electron, and it degrades to nothing for reading
  mode (which passes no `options`). The `wiredTitles` WeakSet still carries the "is wired" fact that
  the WeakMap would have carried, so nothing was lost.
- **Three named harness methods over a generic `withActiveEditor` — SOUND**, and it is the better
  call than my own suggestion: a typed escape hatch would let `app as any` leak back into specs one
  callback at a time. Three finite, named, doc-commented methods are the explicit option.
- **Adding `unmark()` despite one caller — SOUND, and consistent with dropping the two predicates.**
  The criterion is duplicated *knowledge*, not caller count: `unmark` must change whenever
  `markFoldable`/`ensureChevron` change, so co-locating them is what keeps the DOM contract in one
  place. `isFoldable`/`isFolded` had no such coupling — they were pure `classList.contains` restatements.
  No contradiction between the two decisions.

### New problems introduced by the revision?

None blocking. Complexity delta is genuinely net-neutral-to-negative: ~20 lines added
(`unmark` + `AbortController`/`WeakSet` + `effectiveFold` + `markedEmbedLinesField`), against a
removed selector condition, two removed predicates and one removed document scan. Module count,
abstraction layers, interfaces and dependencies are all unchanged. Test 10 (`reloadPlugin`) is the
only new flake surface and it comes with an explicit report-and-downgrade instruction rather than a
sleep — the right disposition.

Two trivia, explicitly NOT findings and NOT to be actioned before implementation: §3.4 references
`isMarkedLine(state, lineFrom)` which §3.3 does not name as an export (obvious one-liner over
`markedEmbedLinesField`), and §3.2's constants table does not list the chevron/`is-collapsed`
class names that `unmark` and `applyFoldState` need. Both are naming details for the implementer.

### Scope and AC re-check

Ticket "Scope (KISS — agreed with the Human)" is intact: whole-line-only marker, per-mode fold
state, click-to-fold for all note embeds. All 8 Acceptance Criteria remain mapped to concrete
tests/checks after the renumbering — AC1→tests 1/2/4, AC2→3/5, AC3→6 (either probe outcome is a
valid proof), AC4→7/8, AC5→reading suite + Commit A ordering, AC6→§6/§8, AC7→by construction (raw
text only) + §8, AC8→§5. No AC lost a test in the renumber; tests 4, 8 and 10 are net additions.

### Readiness

PLAN_REVIEWER: READY
