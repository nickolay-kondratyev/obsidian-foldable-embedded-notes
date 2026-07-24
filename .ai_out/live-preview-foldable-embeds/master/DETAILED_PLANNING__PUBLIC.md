# DETAILED PLAN — Live Preview foldable embeds (CM6)

Revision: **rev 2** (post PLAN_ITERATION round 1). Disposition of every review finding is in
`PLAN_ITERATION__PUBLIC.md`; this file remains the single authoritative plan.

Ticket: `_tickets/implement-live-preview-foldable-embeds-cm6.md` (its
"Scope (KISS — agreed with the Human)" section is SETTLED and is not re-opened here).
Inputs already validated against real Obsidian 1.12.7:
`.ai_out/live-preview-foldable-embeds/master/EXPLORATION_PUBLIC.md` and
`.ai_out/live-preview-foldable-embeds/master/prototype/`.

No blocking questions. There are **two deliberate additions** beyond the literal ticket text,
both flagged in §3.6 and §7 — a `editorLivePreviewField` guard (correctness bug the prototype
has) and a follow-up ticket for a unit-test harness. Neither changes the agreed scope.

---

## 1. Problem understanding

Make `![[note]]` embeds click-foldable in Live Preview, with a whole-line `![[note]]-`
folding by default and its dash hidden (revealed when the cursor is on that line), reusing the
existing `styles.css` classes. Fold state lives in CM6 state (per view / per session), separate
from the reading-mode `FoldStateStore`. Reading mode must not regress.

Assumptions (all backed by the exploration, not re-derived):

- Obsidian renders embed widgets asynchronously → a `MutationObserver` on `view.contentDOM` is
  the only reliable trigger.
- `view.posAtDOM(embedEl)` is LINE-accurate only → fold state is anchored per LINE;
  embeds sharing a line share fold state (documented consequence).
- `EditorView.domEventHandlers` never sees the title click → direct listener on
  `.markdown-embed-title`.
- The Live Preview embed widget DOM belongs to **Obsidian** and is **reused across edits** — it is
  NOT re-created from scratch the way reading mode's DOM is. Everything we inject into it we must
  therefore also be able to remove (§3.5 teardown).
- `@codemirror/state` / `@codemirror/view` are already present (peer deps of `obsidian`) and are
  externalised in `esbuild.config.mjs`.

---

## 2. The open design call: share or not share with the reading-mode post-processor

**Decision: extract ONLY the DOM contract into a new `src/embedFoldDom.ts`. Do NOT extract the
"wait for the async embed title" observer — Live Preview does not need one at all.**

### 2.1 What is genuinely duplicated knowledge (→ extract)

Both modes encode the same knowledge: *what a foldable embed looks like in the DOM*.

- the four class names that must match `styles.css` (`fen-embed`, `fen-folded`,
  `fen-collapse-icon`, `is-collapsed`) and the chevron glyph id (`right-triangle`),
- "a chevron span is prepended into the title bar and rendered with `setIcon`",
- "folded ⇒ `fen-folded` on the embed AND `is-collapsed` on the chevron",
- "a title click must `preventDefault()` + `stopPropagation()` so Obsidian does not open the
  embedded note" — this is exactly the CLAUDE.md heuristic *"if you'd write the same WHY comment
  twice, extract it"*,
- and (new in rev 2) **the inverse**: what "undo everything we injected" means — this MUST stay in
  lockstep with the injection code, so it belongs in the same module even though only Live Preview
  calls it today.

Duplicating class-name strings across two modules while `styles.css` is the third copy is a real
DRY-of-knowledge defect, and the abstraction is HYPER-OBVIOUS: it is a pure, stateless DOM helper
with no lifecycle and no state ownership.

### 2.2 What is NOT shared knowledge (→ keep separate)

- **The readiness wait.** Reading mode's `whenMarkdownEmbedReady` carries three concerns that are
  meaningless in Live Preview: (a) per-embed observers that must be tracked and disconnected on
  plugin unload, (b) the media-embed bail-out (`.image-embed` etc. never resolve), (c) waiting for
  the `.markdown-embed` class to be ADDED. In Live Preview, the `contentDOM` observer already fires
  when the title element is inserted (a `childList` mutation in the observed subtree), so the view
  plugin **selects `.internal-embed`, skips any embed whose title bar has not landed yet, and is
  called back**. Extracting a shared "readiness" abstraction would force Live Preview to adopt
  machinery it does not need — a forced abstraction, worse than the duplication it removes.

  **Rev 2 correction (was a real hole):** the plan previously selected
  `.internal-embed.markdown-embed`. `markdown-embed` is added by Obsidian as an *attribute*
  mutation, which our `childList`-only observer does not see — an embed could have been missed
  until an unrelated mutation happened. The fix is to drop the class from the selector entirely:
  **presence of `.markdown-embed-title` is the readiness condition**, and it is strictly stronger
  (media embeds never get a title bar, so the media bail-out is free). We deliberately do NOT add
  `attributes: true` to the observer — that would reintroduce the self-trigger loop R2 avoids.
- **Fold-state identity.** Reading mode: `sourcePath::line::src::#index` string keys in a `Map`.
  Live Preview: document positions in a CM `RangeSet` that map through edits. Settled per-mode by
  the ticket; no shared interface.
- **Marker parsing.** Reading mode parses the rendered DOM (structural, per occurrence). Live
  Preview parses raw document text (whole-line only). Different rules by design — sharing them
  would be a lie.

### 2.3 Rejected alternative

A `FoldableEmbedController` owning readiness + wiring + state behind an injected
`FoldStateSource` interface. Rejected: the two lifecycles (per-section post-processor vs. per-view
CM6 plugin) do not unify, the interface would have to abstract over "string key" vs "document
position", and every reader would have to hold both modes in their head to understand either.
Complexity ≫ value.

---

## 3. Architecture

### 3.1 Module layout under `src/`

```
src/
  main.ts                          (lifecycle only; +1 registerEditorExtension line)
  embedFoldDom.ts                  NEW  — shared DOM contract (static class, ~70 lines)
  foldStateStore.ts                unchanged
  foldableEmbedsPostProcessor.ts   refactored to delegate DOM work to EmbedFoldDom
  livePreview/
    markedEmbedLines.ts            NEW  — whole-line `![[x]]-` scan (StateField) + dash decoration
    foldStateField.ts              NEW  — explicit fold state + the `effectiveFold` rule
    livePreviewFoldExtension.ts    NEW  — ViewPlugin (DOM sync/teardown) + extension factory
```

Three Live Preview files rather than one ~250-line module: they have three different reasons to
change (marker syntax / state shape / Obsidian DOM). Each stays well under 100 lines.
Dependency direction is one-way: `livePreviewFoldExtension.ts` → `foldStateField.ts` →
`markedEmbedLines.ts`. No cycles.

### 3.2 `src/embedFoldDom.ts` — the shared DOM contract

Stateless static class `EmbedFoldDom` (CLAUDE.md: static class for stateless utilities). Exports
the selector/class constants it owns (so callers can do their own `classList.contains` checks
without re-declaring strings) plus:

| Member | Responsibility |
|---|---|
| `static readonly SEL_EMBED_TITLE` / `CLS_FOLDABLE` / `CLS_FOLDED` | exported constants; the third copy of these strings is `styles.css` |
| `markFoldable(embed)` | adds `fen-embed` |
| `ensureChevron(title): HTMLElement` | returns the existing `.fen-collapse-icon` or prepends one and runs `setIcon(el, "right-triangle")` — **idempotent by design** |
| `applyFoldState(embed, chevron, folded)` | toggles `fen-folded` / `is-collapsed` |
| `onTitleClick(title, onClick, options?: AddEventListenerOptions)` | `addEventListener("click", …)` with the `preventDefault`/`stopPropagation` WHY comment, ONE copy. `options` carries Live Preview's `AbortSignal`; reading mode passes nothing |
| `unmark(embed)` | the exact inverse of `markFoldable` + `ensureChevron`: removes `fen-embed`/`fen-folded` and the chevron span. Lives here (not in the Live Preview module) because it must stay in lockstep with the two methods above — see §2.1 |

**Deliberately NOT extracted** (per review F7): `isFoldable()` / `isFolded()` one-line
`classList.contains` wrappers. Reading mode is their only caller; a single-caller wrapper is
indirection, not DRY. Reading mode uses the exported constants directly.

`foldableEmbedsPostProcessor.ts` keeps: the post-processor entry point, the strict DOM marker
parse, the per-occurrence key building, the readiness observers, and the `FoldStateStore` wiring.
It loses the class constants, chevron creation and `applyFoldState`. **Zero behaviour change** —
`ensureChevron` is a behaviour-preserving superset of reading mode's unconditional
`title.createSpan(...)` (reading mode's re-entry guard at `makeFoldable` already prevents a second
call), and the existing reading-mode e2e suite is the proof.

### 3.3 `src/livePreview/markedEmbedLines.ts` — marker parsing + dash hiding

- `const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-$/` with the settled WHY comment
  (raw-text scan false-positives inside code spans; syntax-tree node names are not public API; a
  whole-line match cannot occur inside a code span). Accepted micro-duplication: the marker
  character `-` also appears as `FOLD_MARKER` in the reading-mode module — a literal regex reads
  better than one built by interpolation; note it with a one-line WHY-NOT.
- `interface MarkedEmbedLine { readonly lineFrom: number; readonly dashFrom: number }`.
- `function findMarkedEmbedLines(doc: Text): MarkedEmbedLine[]` — the prototype's `doc.line(n)`
  loop (validated); no micro-optimisation. **Module-private** now (see next bullet).
- `export const markedEmbedLinesField = StateField.define<readonly MarkedEmbedLine[]>({ create:
  (state) => findMarkedEmbedLines(state.doc), update: (lines, tr) => tr.docChanged ?
  findMarkedEmbedLines(tr.state.doc) : lines })`.
  **WHY (review F6):** the scan is otherwise re-run on *every cursor move* (the decoration's
  `"selection"` dependency) AND on every `sync()` — a full-document walk per arrow key. Caching it
  behind `docChanged` costs ~6 lines, makes selection moves O(markers), and gives the decoration
  and the view plugin ONE source for "which lines are marked" instead of two independent scans.
- `export const markerDashDecoration = EditorView.decorations.compute([markedEmbedLinesField,
  editorLivePreviewField, "selection"], state => …)`:
  - returns `Decoration.none` when `!state.field(editorLivePreviewField)` (see §3.6),
  - otherwise one `Decoration.replace({})` per marked line over `[dashFrom, dashFrom + 1]`,
    skipping lines that contain a selection head (the standard Live Preview reveal convention).

### 3.4 `src/livePreview/foldStateField.ts` — fold state and the fold rule

- `class ExplicitFold extends RangeValue { constructor(readonly folded: boolean) }` — an explicit
  user choice recorded at a line-start position.
- `interface LineFoldToggle { readonly lineFrom: number; readonly folded: boolean }` — named type,
  no anonymous pair.
- `export const setLineFold = StateEffect.define<LineFoldToggle>()`.
- `export const explicitFoldField = StateField.define<RangeSet<ExplicitFold>>({ create, update })`.
  `update` = `set.map(tr.changes)` (this mapping is the entire reason for a StateField), then for
  each `setLineFold` effect replace the entry **for that whole line** using `RangeSet.update`:

  ```ts
  const line = tr.state.doc.lineAt(lineFrom);
  mapped = mapped.update({
      // Line-RANGE filter, not `from !== lineFrom`: an anchor can drift within its
      // line when text is inserted at the line start (see `explicitFoldAt`).
      filter: (from) => from < line.from || from > line.to,
      add: [new ExplicitFold(folded).range(line.from, line.from)],
  });
  ```

- `export function explicitFoldAt(state: EditorState, lineFrom: number): boolean | undefined` —
  reads via `field.between(line.from, line.to, …)` on the line containing `lineFrom`, NOT by exact
  position equality (`undefined` = "user has not toggled it" — deliberately the SAME convention as
  `FoldStateStore.get`).

  **WHY line-range (review F4):** the design intent is "fold state is per LINE" (forced by
  `posAtDOM` being line-accurate only). A zero-length anchor can map to *after* text inserted at
  the line start, and then an exact-position lookup silently loses the fold. A line-range
  read/write is the same amount of code and makes the "embeds sharing a line share fold state" rule
  **structural** instead of incidental. This supersedes rev 1's `MapMode.TrackDel` escape hatch,
  which addressed deletion and would not have fixed the insertion case at all.

- `export function effectiveFold(state: EditorState, lineFrom: number): boolean` →
  `explicitFoldAt(state, lineFrom) ?? isMarkedLine(state, lineFrom)`.
  **WHY it exists (review F2):** this is THE business rule ("explicit choice wins over the marker
  default") and it has two callers — `sync()` (what to render) and `toggle()` (what to invert).
  Reading only `explicitFoldField` in `toggle()` makes the first click on a default-folded marked
  embed compute `!undefined === true`, i.e. dispatch "fold" on an already-folded embed → the click
  looks dead. One function, no ambiguity possible.

### 3.5 `src/livePreview/livePreviewFoldExtension.ts` — DOM application

`class LivePreviewFoldView implements PluginValue`:

- **fields**: `contentObserver: MutationObserver`; `listeners = new AbortController()`;
  `wiredTitles = new WeakSet<HTMLElement>()`.
- **constructor**: `new MutationObserver(() => this.sync())` on `view.contentDOM` with
  `{ childList: true, subtree: true }` (deliberately NOT `attributes` — see R2), then `sync()` once.
- **`update(u)`**: `sync()` when `u.docChanged || u.viewportChanged ||
  u.state.field(explicitFoldField) !== u.startState.field(explicitFoldField)`. Selection changes
  need no sync (the dash decoration handles them).
- **`sync()`** (idempotent, the single write path):
  1. for each `.internal-embed` inside `contentDOM`:
     - `title = embed.querySelector(EmbedFoldDom.SEL_EMBED_TITLE)`; **skip when null** — this is the
       readiness gate (§2.2) and the media-embed filter in one; the observer calls us back when
       Obsidian inserts the title,
     - `lineFrom = anchorLineStart(view, embed)`; skip when `posAtDOM` returns `< 0`
       (defensive, explicit, no silent catch),
     - `folded = effectiveFold(view.state, lineFrom)`,
     - `EmbedFoldDom.markFoldable(embed)`; `chevron = EmbedFoldDom.ensureChevron(title)`,
     - **if `!wiredTitles.has(title)`**: `EmbedFoldDom.onTitleClick(title, () => this.toggle(embed),
       { signal: this.listeners.signal })` and `wiredTitles.add(title)`,
     - `EmbedFoldDom.applyFoldState(embed, chevron, folded)`.

  **WHY wiring is keyed off `wiredTitles`, not off "a chevron already exists" (review F1):** those
  two facts must not be conflated — see teardown below.
- **`toggle(embed)`**: recompute `lineFrom` (positions move), read the current value via
  `effectiveFold(view.state, lineFrom)` — **CM state, not the DOM class**: state is the single
  source of truth, the DOM is a projection — and
  `view.dispatch({ effects: setLineFold.of({ lineFrom, folded: !current }) })`.
- **`destroy()`**: `contentObserver.disconnect()`, `listeners.abort()` (removes every title
  listener in one call), and `EmbedFoldDom.unmark(embed)` for every `.fen-embed` in `contentDOM`.

  **WHY a real teardown (review F1 — this was BLOCKING):** unlike reading mode, whose title
  listeners "live and die with a freshly-created title element", the Live Preview embed DOM is
  Obsidian's and survives our unload. Without teardown: (a) aborted-view listeners keep dispatching
  into a destroyed `EditorView`, and (b) on re-enable (plugin update, `Reload app without saving`,
  dev iteration) a leftover chevron makes the embed *look* foldable while nothing rewires it —
  a POLS violation that reads like a flaky bug report. `AbortController` + `unmark` is ~5 lines and
  needs no per-listener bookkeeping.
- `function anchorLineStart(view, embed): number` — `doc.lineAt(view.posAtDOM(embed)).from`, with
  the WHY comment about `posAtDOM` line accuracy and the shared-line consequence.
- `export function livePreviewFoldExtension(): Extension` →
  `[markedEmbedLinesField, explicitFoldField, markerDashDecoration,
  ViewPlugin.fromClass(LivePreviewFoldView)]`.

**No feedback loop**: class toggles are *attribute* mutations and the observer only watches
`childList`. Chevron insertion IS a childList mutation, so it triggers exactly one extra `sync()`
pass, which finds the chevron already present and the title already wired and mutates nothing →
self-terminating. Document this; it is the non-obvious bit a maintainer will worry about.

### 3.6 `editorLivePreviewField` guard (deliberate addition — please note)

The prototype hides the marker dash in **plain Source mode** too, where raw text must render
literally. `editorLivePreviewField` is **public** Obsidian API (`obsidian.d.ts:2485`), so gating
the decoration on it is 3 lines and no hack. Not a scope change — it makes the shipped behaviour
match the ticket's own premise ("Live Preview"). The ViewPlugin needs no guard: Source mode renders
no embed widgets, so `sync()` finds nothing.

### 3.7 `src/main.ts`

```ts
this.registerEditorExtension(livePreviewFoldExtension());
```
Nothing to add to `onunload`: `registerEditorExtension` unregisters itself, CM6 then destroys the
view plugin, and `destroy()` (§3.5) is what actually cleans the injected DOM.

### 3.8 `package.json`

Add `@codemirror/state` and `@codemirror/view` pinned to the versions `obsidian` peer-depends on
(`6.5.0` / `6.38.6` — verified in `node_modules/obsidian/package.json`, obsidian 1.12.3) to
**`devDependencies`** — they are externalised at bundle time and provided by Obsidian at runtime,
so they must never be runtime `dependencies`. If `npm run lint` still reports
`import/no-extraneous-dependencies`, move them to `dependencies` with a WHY comment; do not silence
the rule with a disable directive.

---

## 4. Test plan

### 4.1 Reading-mode regression fix (required by the ticket)

`e2e/foldable-embeds.e2e.ts`: `foldableEmbeds()` becomes
`page.locator(\`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}\`)` — with the WHY comment
that the unscoped selector now also matches the hidden Live Preview editor DOM. Every other locator
in that suite derives from this one helper, so this is the only change. The suite must stay green
**before** the feature lands (proving the change is behaviour-neutral) and after.

### 4.2 Harness

Add to `e2e/obsidianHarness.ts` (keeps the `window.app as any` bridge in ONE place — leaving raw
`page.evaluate` in the spec would defeat the harness's own rationale):

```
async setLivePreviewEnabled(enabled: boolean): Promise<void>   // app.vault.setConfig("livePreview", enabled)
async setCursor(line: number, ch: number): Promise<void>       // activeEditor.editor.setCursor
async replaceRange(text: string, line: number, ch: number): Promise<void>
async reloadPlugin(): Promise<void>                            // plugins.disablePlugin(id) → enablePlugin(id)
```
Doc-comment `setLivePreviewEnabled`: the setting is read when a markdown view enters editing mode,
so callers must re-enter `setMarkdownViewMode("source")` afterwards. `reloadPlugin` reuses the
existing `enableCommunityPlugins` plumbing (`app.plugins.*`, harness lines 350-361).

### 4.3 New suite `e2e/live-preview-foldable-embeds.e2e.ts`

Serial, one Obsidian instance. `beforeAll`: launch with an `extraFixtures` note (keeps `.dev-vault`
untouched and the fixture next to its assertions):

```
lp-embeds.md:
  # Live preview parent
  (blank)
  ![[child]]                                   → embed #0  unmarked
  (blank)
  ![[child]]-                                  → embed #1  whole-line marker
  (blank)
  Inline ![[child]]- tail text.                → embed #2  mid-paragraph marker
  (blank)
  A code-span mention of `![[child]]-` stays literal.   → no embed widget
```

Then `setLivePreviewEnabled(true)` → `openFile("lp-embeds.md")` → `setMarkdownViewMode("source")`
→ `await expect(embeds().last()).toBeAttached()`. Locators are scoped to `.cm-content`.

Assertion rules (non-negotiable):
- Web-first assertions / `expect.poll` only — **no fixed sleeps** (the prototype's
  `setTimeout(400)` must not survive).
- `.cm-line` text assertions go through `expect.poll(() => page.evaluate(…textContent…))`, never a
  bare `expect` on an evaluate result, and never `toHaveText` on `.cm-line` — that also picks up the
  embed widget's rendered text.
- `e2e/playwright.config.ts`'s `workers: 1` + `fullyParallel: false` is now **load-bearing for two
  suites** sharing one vault copy; note it in the spec header.

| # | Test | Ticket AC |
|---|---|---|
| 1 | unmarked embed: not `fen-folded`, body visible, `.fen-collapse-icon svg` attached | AC1 |
| 2 | clicking the title folds (class + body hidden + chevron `is-collapsed`), clicking again unfolds | AC1 |
| 3 | whole-line `![[child]]-`: `fen-folded`, body hidden, and its `.cm-line` text does NOT end with `-` | AC2 |
| 4 | **first** click on the default-folded marked embed UNFOLDS it (guards the `effectiveFold` rule, §3.4) | AC1/AC2 |
| 5 | cursor on the marked line (`setCursor`) → line text ends with `-`; cursor moved away → it disappears again | AC2 |
| 6 | mid-paragraph `Inline ![[child]]- tail`: see the probe note below | AC3 |
| 7 | fold the unmarked embed, then `replaceRange("inserted\n\n", 0, 0)` → both the manually folded and the marked embed are still folded | AC4 |
| 8 | typing at the START of the marked embed's line does not lose its fold state (line-range anchoring, §3.4 / risk R7) | AC4 |
| 9 | the code-span line produces no `.internal-embed` widget and keeps its literal `![[child]]-` text | scope premise |
| 10 | `reloadPlugin()` → clicking a title still folds (teardown + rewiring, §3.5 / F1). Second-to-last: mutates global plugin state | §3.5 |
| 11 | `setLivePreviewEnabled(false)` + re-enter source mode → the marked line shows the literal `-`. Last: disrupts app config | §3.6 |

**Probe first, then write test 6 (review F8):** nobody has verified that
`Inline ![[child]]- tail text.` renders an embed *widget* mid-paragraph in Live Preview at all —
the exploration only covered a marked embed on its own line. Check it before implementing, and do
not treat a mismatch as a bug in your code:
- if a widget DOES render → assert it is `fen-embed`, clickable, NOT folded by default, and that
  the line still contains the literal `-`;
- if it does NOT → assert the literal `-` is present and no widget exists. Either shape is a valid
  AC3 proof ("the mid-paragraph marker is left alone in Live Preview").

If test 10 proves flaky against a real Obsidian reload, **report it** and downgrade it to a
documented manual check in the DoD — do not delete it silently and do not paper over it with a
sleep.

Reading-mode non-regression = the existing suite passing with the feature active (AC5).
`npm run lint` + `npm run build` clean = AC6/AC7 (no private syntax-tree names are used anywhere).

### 4.4 Unit tests — considered and rejected for now

The repo has no unit-test runner. Adding one (vitest/jest + config + CI wiring) to cover one regex
and one `StateField` is not 80/20 for this ticket, and both are covered end-to-end.
**Create a follow-up ticket**: "Add a unit-test harness for pure logic" — naming
`findMarkedEmbedLines`, `effectiveFold` (§3.4) and the line-range `explicitFoldField` update as the
three pieces of pure logic most worth unit-testing.

---

## 5. Docs work

- **README.md** — replace the current "reading mode only" limitation block:
  - Live Preview is supported: embeds are click-foldable there too.
  - Limitation 1: in Live Preview the `-` fold-by-default marker only applies when the embed is the
    ENTIRE line (`![[note]]-`); a mid-paragraph marker renders literally there (reading mode still
    handles it). One-sentence WHY (only raw text is available in the editor).
  - Limitation 2: fold state is per-mode and per-session — folding in Live Preview does not carry
    over to reading mode, and vice versa; both reset on restart. In Live Preview it is per LINE, so
    two embeds on one line fold together.
  - Keep the existing media-embed limitation.
- **CLAUDE.md** — extend "Feature architecture" with the new module list from §3.1, one line each,
  including "`embedFoldDom.ts` — the shared DOM contract (classes/chevron/title click/teardown) used
  by BOTH modes" and the line-anchoring consequence. Rename the section heading so it is no longer
  reading-mode-only. Keep it SUCCINCT and stable-knowledge-only.
- `change_log` entry; close the ticket when done.

---

## 6. Ordered implementation steps (commit points)

1. **Commit A — e2e scoping.** `.markdown-reading-view` scoping in `e2e/foldable-embeds.e2e.ts`.
   Run `npm run test:e2e` → still green. *Verification: the change is behaviour-neutral before the
   feature exists.*
2. **Commit B — extract `src/embedFoldDom.ts`** and refactor `foldableEmbedsPostProcessor.ts` onto
   it. `npm run lint && npm run build`, then the reading-mode e2e suite → green. Pure refactor.
   (`unmark` lands here unused-by-reading-mode; it is consumed by Commit C.)
3. **Commit C — Live Preview feature.** Work order INSIDE this step: probe the test-6 fixture
   question (§4.3), write the new e2e suite FIRST and run it to watch it fail for the right
   reasons, then implement `src/livePreview/*`, the `main.ts` registration, the harness helpers and
   the `package.json` entries, then re-run until green. Commit spec + implementation together
   (never commit a red suite). `npm run lint` and `npm run build` clean.
4. **Commit D — docs.** README + CLAUDE.md (§5).
5. **Commit E — housekeeping.** `change_log` entry, close
   `_tickets/implement-live-preview-foldable-embeds-cm6.md`, create the unit-harness follow-up
   ticket (§4.4). Delete nothing under `.ai_out/`.

---

## 7. Risks and de-risking

| # | Risk | De-risking |
|---|---|---|
| R1 | MutationObserver storms on `contentDOM` (fires on every editor render change) | `childList` only — plain typing inside a text line is a characterData/attribute mutation, not observed. `sync()` is one `querySelectorAll` plus O(embeds) work; the marked-line scan is cached in `markedEmbedLinesField` (§3.3) so `sync()` no longer walks the document. Revisit only if e2e shows lag. |
| R2 | Our own DOM writes re-trigger the observer | Class toggles are attribute mutations (not observed). Chevron insertion triggers exactly one extra idempotent pass → self-terminating. Documented in code. |
| R3 | Dash hidden in raw Source mode | `editorLivePreviewField` guard (§3.6) + e2e test 11. |
| R4 | Reading-mode suite breaks once editor embeds are marked | Commit A lands the scoping first, independently verified. |
| R5 | `posAtDOM` is only line-accurate → same-line embeds share fold state | Accepted and settled by the ticket; now structural via the line-range lookup (§3.4); documented in code, README and CLAUDE.md; test 6 exercises an inline embed. |
| R6 | Removing the prototype's per-embed readiness observers loses a late-arriving embed | The `contentDOM` subtree `childList` observer sees the title insertion, and title presence is now the ONLY readiness condition (§2.2) — no attribute mutation is involved. Test 1 (chevron attached) is the guard; if it ever flakes, fall back to a reading-mode-style per-embed observer, never to a sleep. |
| R7 | Fold anchors drifting when text is inserted at the line start | Line-RANGE read/write (§3.4) instead of exact-position equality; e2e test 8 covers it explicitly. (Rev 1's `MapMode.TrackDel` idea was wrong — it governs deletion, not insertion assoc.) |
| R8 | Explicit fold state lingers on a line whose embed was edited away | Harmless (nothing to apply it to) and self-corrects; not worth code. |
| R9 | Rides Obsidian's internal editor DOM; a release could change the widget structure | Blast radius is Live Preview only — reading mode is untouched; the e2e suite is the early-warning system. Already accepted in the exploration. |
| R10 | e2e flakiness from async embed rendering | Web-first assertions / `expect.poll` only, never `setTimeout`; `beforeAll` waits for the last embed to be attached. |
| R11 | Injected DOM outliving the plugin (stale listeners, unwired chevrons on re-enable) | `destroy()` aborts listeners and `unmark`s every embed (§3.5); test 10 is the guard. |
| R12 | `sync()` writes DOM synchronously inside `ViewPlugin.update()` | The prototype did this and worked, so not blocking. If layout thrash or a CM warning appears, the fix is `view.requestMeasure({ write: … })` — **not** a `setTimeout`. |

---

## 8. Definition of done

- All eleven Live Preview e2e tests green; the reading-mode suite green in the same run.
- `npm run lint` and `npm run build` clean.
- No Obsidian private markdown syntax-tree node names anywhere.
- README states BOTH limitations; CLAUDE.md architecture section matches the shipped module layout.
- Ticket closed, change_log updated, unit-harness follow-up ticket created.
