# IMPLEMENTATION REVIEW — Live Preview foldable embeds (CM6)

Reviewer: IMPLEMENTATION_REVIEWER (fresh eyes, no prior private memory).
Scope reviewed: `git diff 031c396..HEAD` (fbaf5d7, ba86831, e01b39c, a3ebedf, 1511026, 61434ca).

**Verdict: IMPLEMENTATION_ITERATION: REQUIRED**

Overall this is high-quality work. The architecture is right (CM6 `StateField` for mapped
positions, decoration for the dash, MutationObserver as the real driver), the WHY comments are
genuinely useful, no private Obsidian syntax-tree APIs are used, all 8 reading-mode
behaviour-capturing tests survive **byte-identical**, and the two reported DEVIATIONS are correct
and honestly described. Iteration is required for three findings: one real user-visible bug
(nested embeds), one incorrect error-handling contract (`posAtDOM`), and one teardown assertion
that cannot fail.

---

## 1. Independent verification (run by me, not taken from the report)

| Check | Result |
|---|---|
| `npm run lint` | exit 0, no output (`.tmp/rev_lint.txt`) |
| `npm run build` (`tsc -noEmit` + esbuild production) | exit 0 (`.tmp/rev_build.txt`) |
| `npm run test:e2e` | **22 passed**, exit 0 — real Obsidian **1.12.7**, headless (`.tmp/rev_e2e_1.txt`) |
| Reading-mode tests before vs after | 8 → 8, **identical titles, no removals, no skips** |
| `test.skip` / `test.only` / `.fixme` anywhere | none |
| Private syntax-tree usage (`syntaxTree`, `@codemirror/language`, node names) | none — **AC7 clean** |
| `@codemirror/state@6.5.0` / `@codemirror/view@6.38.6` vs `obsidian` peerDependencies | **exact match** |
| `styles.css` | unchanged, as the ticket required |

The claimed 22/22 is independently confirmed. Nothing looks faked.

---

## 2. Findings

### F1 — MAJOR — Nested embeds in Live Preview anchor to the OUTER embed's line

`src/livePreview/livePreviewFoldExtension.ts:97-99`

```ts
private embedElements(): HTMLElement[] {
    return Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>(SEL_INTERNAL_EMBED));
}
```

`querySelectorAll` is unscoped by depth, so it returns embeds **nested inside another embed's
rendered body** as well as top-level ones. For a nested embed, `anchorLineStart()`
(`livePreviewFoldExtension.ts:109-115`) calls `posAtDOM` on a node that lives inside the outer
widget's DOM — CM resolves it to the **outer embed's line**. Consequences, all certain from the
code:

- `applyFoldState` paints every nested embed with the OUTER embed's fold state.
- `toggle()` on a nested embed's title dispatches `setLineFold` for the **outer** line — clicking
  a child embed's title collapses its parent. A clear POLS violation.
- The reading-mode post-processor also renders inside those embed bodies and guards only on
  `fen-embed`; depending on which side wins the race, the same title can end up with **two**
  click listeners (LP's `wiredTitles` check does not consider a mark left by the post-processor),
  producing a state-vs-DOM-class fight.

Reading mode does NOT have this problem — it keys per embed occurrence.

Why no test caught it: the only embedded fixture, `.dev-vault/child.md`, contains no `![[ ]]`.
Nested embeds are common in real vaults.

**Suggested resolution** (small and it fixes the anchor and the double-wiring at once): skip
non-top-level embeds in `sync()` —

```ts
// A nested embed's posAtDOM resolves to its PARENT embed's line, so it would fold
// the parent. Embeds inside an embed body are the post-processor's business.
if (embed.parentElement?.closest(SEL_INTERNAL_EMBED) !== null) continue;
```

plus one e2e case (make `child.md` embed `sibling.md`, assert clicking the nested title does not
fold the outer embed). If the team prefers to defer, it needs an explicit ticket **and** a README
line, not silence.

---

### F2 — MAJOR — `posAtDOM` throws; the `pos < 0` guard is dead code and the JSDoc is untrue

`src/livePreview/livePreviewFoldExtension.ts:101-115`

```ts
 * @returns `null` when the element is not (or no longer) part of this view.
 */
private anchorLineStart(embed: HTMLElement): number | null {
    const pos = this.view.posAtDOM(embed);
    if (pos < 0) { return null; }
```

Verified against the installed CodeMirror (`node_modules/@codemirror/view/dist/index.js:8182` →
`posFromDOM` at `:3113`):

```js
posFromDOM(node, offset) {
    let view = this.nearest(node);
    if (!view) throw new RangeError("Trying to find position for a DOM position outside of the document");
```

`posAtDOM` **never returns a negative value** — it throws. So:

1. `if (pos < 0)` can never be true: dead code.
2. The `@returns null when the element is not (or no longer) part of this view` contract is
   **false** — exactly that case throws. CLAUDE.md: "EXPLICIT without lies or misconceptions:
   Behavior MUST thoroughly match Naming."
3. The real failure mode is unhandled, and the blast radius is bad. `sync()` is called from
   `update()`; CM6 wraps `ViewPlugin.update` in try/catch, logs the exception and **deactivates
   the plugin instance for that view**. One throw and folding silently stops working for the rest
   of the session, with only a console line. Thrown from the MutationObserver path it aborts the
   remainder of that sync pass (embeds after the offender go unpainted). Thrown from `toggle()`
   it makes the click silently do nothing.

This is reachable precisely in the situation the MutationObserver exists for: Obsidian mutates
embed DOM asynchronously and outside CM's knowledge, so a node can be inside `contentDOM` while
CM's `docView` has no desc for its subtree.

**Suggested resolution** — make the documented contract true and keep the guard meaningful:

```ts
private anchorLineStart(embed: HTMLElement): number | null {
    let pos: number;
    try {
        // Throws (does not return a sentinel) when CM has no view desc for this node —
        // reachable while Obsidian is mid-render of an embed widget.
        pos = this.view.posAtDOM(embed);
    } catch {
        return null;
    }
    return this.view.state.doc.lineAt(pos).from;
}
```

Drop the `pos < 0` branch.

---

### F3 — MAJOR (test coverage) — Teardown is never actually asserted; test 21 would pass with a fully leaky `destroy()`

`e2e/live-preview-foldable-embeds.e2e.ts:197-210`

```ts
await harness.reloadPlugin();
await harness.setMarkdownViewMode("preview");
await harness.setMarkdownViewMode("source");
```

The mode round-trip **rebuilds the editor DOM from scratch** before anything is asserted. Every
subsequent assertion (`not.toHaveClass(FOLDED_RE)`, click folds) is therefore satisfied by the
rebuild alone. If `destroy()` did not disconnect the observer, did not abort the listeners and
did not `unmark`, this test would still be green.

Teardown is the single riskiest part of this design (Obsidian reuses widget DOM across plugin
unload — `src/embedFoldDom.ts:74-83`, `livePreviewFoldExtension.ts:51-60`), and it is the one
part with no falsifiable assertion.

**Suggested resolution** — assert the observable inverse *between* disable and enable. Split
`reloadPlugin()` into `disablePlugin()` / `enablePlugin()` (or add an
`ObsidianHarness.setPluginEnabled`) and add:

```ts
await harness.setPluginEnabled(false);
// destroy() must leave Obsidian's reused embed DOM exactly as Obsidian rendered it.
await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).toHaveCount(0);
await expect(page.locator(".cm-content .fen-collapse-icon")).toHaveCount(0);
await harness.setPluginEnabled(true);
```

That single assertion is what makes `EmbedFoldDom.unmark` and the `AbortController` real rather
than aspirational.

---

### F4 — MINOR (test honesty) — The marked-embed half of the position-mapping test cannot fail

`e2e/live-preview-foldable-embeds.e2e.ts:163-171`

```ts
// The marked embed was explicitly UNfolded by an earlier test; re-fold it so both
// an explicit-fold and a marker-default line are in play.
await embeds().nth(EMBED_MARKED).locator(".markdown-embed-title").click();
...
await expect(embeds().nth(EMBED_MARKED)).toHaveClass(FOLDED_RE);
```

Re-folding a *marked* line sets the explicit state to the same value as its marker default
(`folded === true`). `effectiveFold = explicit ?? isMarkedLine` therefore returns `true` even if
the explicit anchor is completely lost by the edit. The assertion at line 171 passes with position
mapping entirely removed, and the comment claims it proves something it does not.

The test as a whole is still sound — the `EMBED_UNMARKED` assertion (line 170) has no marker
fallback and is genuinely falsifiable, and test 19 (line 174) is an excellent, strictly
non-vacuous test of the line-RANGE lookup (typing `x` destroys the whole-line marker, so only the
explicit anchor can keep it folded). But line 165-171 should be honest.

**Suggested resolution**: explicitly **UN**fold the marked embed instead, then assert it is still
`not.toHaveClass(FOLDED_RE)` after the edit. That proves both "explicit state survives mapping"
and "explicit beats marker" in one assertion that can actually fail.

---

### F5 — MINOR — `lineTextOfEmbed` silently returns `""`, weakening every "dash hidden" assertion

`e2e/live-preview-foldable-embeds.e2e.ts:87-96`

```ts
.evaluate((el) => el.closest(".cm-line")?.textContent ?? "");
```

`lineEndsWithDash(...) === false` is satisfied both by "the dash is hidden" (intended) and by
"there is no `.cm-line` ancestor" (a DOM-shape change the spec's own header warns about for block
widgets). The `toBe(false)` assertions at lines 124 and 144 are therefore only conditionally
meaningful. They are rescued in practice by line 141 asserting `toBe(true)` on the same helper,
which proves the helper resolves — but that coupling is implicit.

**Suggested resolution**: throw from the helper when `closest(".cm-line")` misses, so a DOM-shape
change fails loudly instead of turning into a green "dash is hidden".

---

### F6 — MINOR (doc honesty) — The spec header states an isolation guarantee that is false

`e2e/live-preview-foldable-embeds.e2e.ts:21-23`

> "Serial, ONE Obsidian instance; ... this suite and the reading-mode suite share a single vault
> copy and a single app window."

`ObsidianHarness.launch` calls `prepareVaultCopy` and spawns its own Obsidian **per `beforeAll`**
(`e2e/obsidianHarness.ts:106-107, 306-323`), so the two suites share neither the vault copy nor
the window. The claim is right within the file and wrong across files. It matters because it
would lead a maintainer to believe test 22 (which leaves Live Preview disabled and never restores
it) can poison a later suite.

**Suggested resolution**: correct the sentence to "one Obsidian instance and one fresh vault copy
**per spec file**; tests within this file are serial and build on each other."

---

### F7 — MINOR (DRY) — `SEL_INTERNAL_EMBED` duplicated across the two modes

`src/foldableEmbedsPostProcessor.ts` and `src/livePreview/livePreviewFoldExtension.ts:8` both
define `".internal-embed"`. That is exactly the shared-DOM-contract knowledge `EmbedFoldDom` was
created to hold — it already owns `SEL_EMBED_TITLE`. Move it there for consistency.

---

### F8 — MINOR (performance) — Whole-document rescan on every keystroke

`src/livePreview/markedEmbedLines.ts:29-38, 48-51`

`findMarkedEmbedLines` walks every line via `doc.line(n)` (O(n log n)) on every `docChanged`. The
field's doc-comment justifies caching against cursor moves, which is true, but a long note still
pays a full scan per keypress. Not a problem at the sizes the e2e covers; it is the kind of thing
that shows up as typing lag in a 5k-line daily note.

**Suggested resolution** (cheap, no complexity added): iterate with `doc.iterLines()` instead of
indexed `doc.line(n)`, which removes the per-line tree descent. Only go range-incremental if it
ever actually measures badly.

---

### F9 — MINOR (latent) — `setLineFold` resolves its position against the post-change doc without mapping

`src/livePreview/foldStateField.ts:35`

```ts
const line = tr.state.doc.lineAt(effect.value.lineFrom);
```

`lineFrom` is computed in `toggle()` against the *pre*-transaction document. Today `toggle()`
dispatches an effect-only transaction so the two coincide, but the field is a reusable public
building block and the next caller that bundles a change with the effect gets a silently wrong
line. `tr.changes.mapPos(effect.value.lineFrom)` costs nothing and removes the trap.

---

### F10 — MINOR (consistency) — The "is this a note embed?" rule diverges between modes

Reading mode requires the `markdown-embed` class and excludes `MEDIA_EMBED_CLASSES`
explicitly; Live Preview infers it from "a `.markdown-embed-title` exists"
(`livePreviewFoldExtension.ts:65-70`). The LP heuristic is documented and works, but a non-note
embed type that grows a title bar in a future Obsidian version would be silently wired. Reusing
the `markdown-embed` class check would make the two modes agree on one rule.

---

### F11 — MINOR (docs) — README's lead paragraph now reads as contradicting its own limitation

`README.md`: "Fold state is remembered for the current session (it survives re-renders and **mode
switches** ...)" sits directly above the new bullet "**Fold state is per mode and per session.**
Folding in Live Preview does not carry over to reading mode or vice versa." Both are true (reading
mode's store survives a reading→editing→reading round-trip) but a reader hits the contradiction
before the explanation. Suggest scoping the lead sentence to reading mode.

---

## 3. The two reported DEVIATIONS — assessed

**D1 (`setLivePreviewEnabled` toggles the leaf view state's `source` flag, not only
`vault.setConfig`) — CORRECT and honestly described.** The helper
(`e2e/obsidianHarness.ts:232-252`) sets *both* levers and documents why each exists. The claim is
independently supported by the test it enables: test 22 observes 0 → 1 dash-terminated `.cm-line`s
across the toggle, which can only happen if `editorLivePreviewField` actually flipped. Under the
plan's original lever the test would have asserted nothing. This deviation strengthened the suite;
it is the right call, reported in the right place.

**D2 (`replaceRange(text, from, to?)` instead of the plan's insert-only signature) — CORRECT and
honestly described.** The reasoning is the important part and it is stated plainly: without a real
range replace, test 19's `x` would leave `x![[child]]-` in the document, permanently disarming the
whole-line marker and making test 22 tautological. The report explicitly says this "passed for the
wrong reason in an intermediate run — caught and fixed, not shipped". I verified the restore
(`e2e/...:184`) and that the marker is genuinely re-armed afterwards (test 22's baseline asserts 0
dashes in Live Preview). The signature also matches Obsidian's own `editor.replaceRange`. Good
call, honestly reported.

D3 (private method) and D4 (test 22's assertion shape) are both fine; D4's cursor-parking
precaution against a tautological assertion is exactly the right instinct.

---

## 4. Acceptance Criteria coverage

| # | AC | Satisfied? | Test that proves it | Would it fail on regression? |
|---|---|---|---|---|
| 1 | Embeds click-foldable in LP, same chevron/appearance | YES | LP tests 12, 13 (`e2e/live-preview-foldable-embeds.e2e.ts:98, 105`) | **Yes.** The `embeds()` locator itself requires `.internal-embed.fen-embed`, so removing the feature fails the `beforeAll` gate. Test 13 asserts the class **and** `.markdown-embed-content` `toBeHidden()`, i.e. the CSS collapses the right element. Chevron asserted as `.fen-collapse-icon svg`. Strong. |
| 2 | Whole-line `![[note]]-` folds by default, dash hidden; dash returns with the cursor on the line | YES | LP tests 14, 16 (`:120, :139`) | **Yes**, with the F5 caveat. Test 16 asserts `true` then `false` across a cursor move — a decoration regression flips it. |
| 3 | Mid-paragraph `text ![[note]]- text` left alone (dash literal) | YES | LP test 17 (`:147`) | **Yes.** Asserts `not.toHaveClass(FOLDED_RE)` **and** `toContain("- tail text.")` on real line text. A regression that widened the regex to mid-line fails both halves. |
| 4 | Fold state survives edits elsewhere (position mapping) | YES | LP tests 18, 19 (`:160, :174`) | **Yes — via test 19 and via test 18's UNMARKED assertion.** Test 19 is the strong one: typing `x` destroys the marker, so only a correctly mapped explicit anchor can keep the embed folded. **Test 18's marked-embed assertion is vacuous — see F4.** |
| 5 | Reading-mode suite passes with the feature active; new LP suite passes | YES | Full run | **Yes.** 22/22 confirmed by me; the 8 reading-mode tests are byte-identical to `031c396` (only the locator was scoped, in a separate commit proven green before the feature existed). |
| 6 | `npm run lint` and `npm run build` clean | YES | — | Confirmed by me, exit 0 both. |
| 7 | No Obsidian private markdown syntax-tree node names | YES | — | Confirmed by grep: no `syntaxTree`, no `@codemirror/language`, no node-name strings. The whole-line regex over raw text is the documented alternative. |
| 8 | README states both limitations | YES | — | `README.md` states whole-line-only marker (with the code-span WHY) and per-mode/per-session state (with the shared-line consequence), plus two bonus limits. |
| — | Teardown leaves no leaked listeners/observers/DOM | Code looks right, **not proven** | LP test 21 (`:197`) | **No — see F3.** The test rebuilds the editor before asserting. |

---

## 5. Security

Nothing to flag. No network, no filesystem access outside Obsidian's own APIs, no `eval` /
remote code, no secrets, no user-content interpolation into HTML (only `classList` and
`createSpan` + Obsidian's `setIcon`). `WHOLE_LINE_MARKED_EMBED` is anchored with a negated
character class — no catastrophic backtracking. `styles.css` untouched; no inline styles or
runtime `<style>` injection.

## 6. Loss of prior functionality

None. All 8 reading-mode behaviour-capturing tests are preserved with identical titles and
bodies; the only change to that spec is scoping the locator to `.markdown-reading-view`, landed
and proven green in its own commit **before** the feature. The `EmbedFoldDom` extraction is
behaviour-preserving: `ensureChevron` is idempotent where the old code created unconditionally,
but `processEmbed` still early-returns on `fen-embed`, so the reachable behaviour is identical.
No anchor points removed. No commands renamed.

## 7. Documentation updates needed

- `README.md` — F11 (lead paragraph vs. the per-mode bullet); add the nested-embed behaviour if
  F1 is deferred rather than fixed.
- `CLAUDE.md` — architecture section matches the code accurately; **no change required**. If F1
  is fixed, add "Live Preview only wires TOP-LEVEL embeds; nested ones are the post-processor's"
  to the Live Preview constraints bullet.
- `e2e/live-preview-foldable-embeds.e2e.ts` header — F6.

---

## 8. Required before this is done

1. **F1** — fix the nested-embed anchor (or ticket it explicitly **and** document it).
2. **F2** — make `anchorLineStart`'s contract true (`try`/`catch`, drop the dead `pos < 0`).
3. **F3** — one assertion that teardown actually removed the injected DOM.
4. **F4** — de-vacuum the marked-embed assertion in test 18.

F5–F11 are worth doing but need not gate.

**IMPLEMENTATION_ITERATION: REQUIRED**

---

# Convergence check — round 1

Scope: `git diff 65e7291..HEAD` (`bcd36b8` fixes, `5a2ffc4` artifacts). Read-only; no source or
test was touched by this check.

## 9. Independent verification (run by REVIEWER, not read from the implementer's logs)

| Check | Result | Log |
|---|---|---|
| `npm run lint` | exit 0, no findings | `.tmp/conv1_lint.txt` |
| `npm run build` (`tsc -noEmit` + esbuild production) | exit 0 | `.tmp/conv1_build.txt` |
| `npm run test:e2e` | **23 passed, 0 failed, 0 skipped**, exit 0 | `.tmp/conv1_e2e.txt` |

The claimed **23 / 0 / 0 is CONFIRMED** (8 reading-mode + 3 hello-world + 12 Live Preview,
real Obsidian 1.12.7 headless, `workers: 1`). No `test.skip/only/fixme` anywhere; the 8
reading-mode tests are unchanged and all pass.

## 10. Per-finding verdicts

| ID | Verdict | Evidence |
|---|---|---|
| **F1** | **RESOLVED** | `livePreviewFoldExtension.ts:103-111` — `topLevelEmbeds()` filters `embed.parentElement?.closest(SEL_INTERNAL_EMBED)`, and it is used by BOTH `sync()` (`:62`) and `destroy()` (`:55`), which was the exact fix proposed. The nested-vs-parent anchor bug is gone by construction. |
| **F2** | **RESOLVED** | `:133-146` — dead `pos < 0` branch removed, `posAtDOM` wrapped in `try/catch → null`, JSDoc now says "when CM cannot map the element", and the WHY comment names the real blast radius (CM6 deactivating the ViewPlugin). Contract now matches CM6's actual `posFromDOM` throw. |
| **F3** | **RESOLVED** | `obsidianHarness.ts:setPluginEnabled(enabled)` + the rewritten test asserts `.cm-content .fen-embed` and `.fen-collapse-icon` at count 0 **while the plugin is off**, preceded by a `not.toHaveCount(0)` baseline so the assertion cannot pass on an empty selector. |
| **F4** | **RESOLVED** | Test 18 now asserts the marked embed stays **UN**folded across the edit — the falsifiable direction (marker default is "folded", so a lost anchor re-folds it). Test 19 re-folds it explicitly as its own precondition, so the serial chain stays honest. |
| F5–F11 | **RESOLVED** | `lineTextOfEmbed` now throws on a `.cm-line` miss; spec header corrected to per-spec-file instance/vault; `SEL_INTERNAL_EMBED` + `CLS_MARKDOWN_EMBED` moved into `EmbedFoldDom` (both modes read one contract); `iterLines` walk; `mapPos` on `lineFrom`; LP media/readiness gate is now reading mode's exact rule; README lead + nested bullet. |

## 11. Falsification evidence — spot-checked

- **F1 (strongest claim, checked):** `.tmp/e2e_failfirst.txt` contains a real Playwright failure
  against the pre-fix extension — `locator('.cm-content .internal-embed[src="lp-nested-child"]')`
  resolved 34× to `class="… fen-embed fen-folded"` when the NESTED title was clicked, i.e. the
  OUTER embed folded. `1 failed, 11 passed`. That is genuine Playwright retry output, not a
  narrative. The test also asserts (a) the nested embed itself folds and (b) the outer embed is
  still foldable by its own title, so "fix by not wiring anything" cannot pass it.
- **F1's resolution claim is TESTED, not asserted:** test 23 asserts
  `expect(nested).toHaveClass(FOLDED_RE)` inside `.cm-content` in Live Preview — nested embeds
  really do stay foldable via the post-processor path. Confirmed passing in my own run.
- **F3:** `.tmp/it_e2e_sabotage.txt` shows the count-0 assertion failing with the `unmark` loop
  removed from `destroy()` (`1 failed, 9 passed`). The assertion is falsifiable.
- **F2:** no test, and the implementer says so plainly rather than faking one. Accepted — the
  path needs mid-render CM internals to force, and the source-level verification is solid.

## 12. New-defect scan on the fixes (nothing blocking found)

- **F8 `iterLines` offset arithmetic — independently verified numerically.** Ran `Text.of([...])`
  with leading/interior/trailing EMPTY lines and compared `iterLines()` + running offset against
  indexed `doc.line(n)`: `(from, text)` pairs identical for every line. No off-by-one on empty
  lines or at the document end.
- **F9 `mapPos`** — CM's default `assoc = -1` keeps the anchor before text inserted at the line
  start, which is the same line the old code resolved. Identity for today's effect-only dispatch.
- **F10** — narrowing the LP gate to `markdown-embed` + title cannot admit anything the old
  title-only gate rejected; the full suite (incl. the media/code-span cases) passes.
- **Reading mode unchanged** — `foldableEmbedsPostProcessor.ts` diff is a pure constant move to
  `EmbedFoldDom`; all 8 reading-mode tests are unmodified and green.
- **Security** — nothing added: no network, fs, eval, secrets; the new code is `closest()` +
  `classList` only.
- **Note (not a finding, pre-existing):** the post-processor has no unload-time unmark, so a
  chevron on a NESTED embed rendered inside the editor can outlive a plugin disable. This is the
  same behaviour reading mode has always had and is unchanged by this work; worth a follow-up
  ticket, not a gate.

## 13. Documentation

`README.md` (both limitation bullets, incl. the new nested-embed one) and `CLAUDE.md`'s Live
Preview constraints bullet now match the code exactly — `posAtDOM` throwing, TOP-LEVEL-only
wiring, and the post-processor owning nested embeds. No further doc change required.

**IMPLEMENTATION_REVIEWER: READY**
