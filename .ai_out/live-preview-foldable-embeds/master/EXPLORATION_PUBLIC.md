# Exploration: foldable embeds in Live Preview (CM6)

Ticket: `_tickets/explore-foldable-embeds-in-live-preview-editing-mode.md`
Verified against REAL Obsidian 1.12.7 (e2e harness, headless Electron). Prototype +
probe spec kept under `prototype/` in this directory.

## Verdict

**Technically feasible, no hacks required — but only with NARROWED marker semantics.**
Everything the ticket asks for works; the one thing that does NOT survive scrutiny is
"marker semantics identical to reading mode" (see Gap 1).

## What was proven (all green in real Obsidian)

| # | Question | Result |
|---|----------|--------|
| 1 | Does Live Preview even expose the embed as foldable DOM? | Yes — the CM6 widget contains the SAME `.markdown-embed-title` + `.markdown-embed-content` structure as reading mode. |
| 2 | Does the existing `styles.css` collapse it? | Yes, unchanged — body height 163px → 0px on `.fen-folded`. No CSS work needed. |
| 3 | Does a class stamped on Obsidian's widget survive edits? | Yes — widget DOM is reused across edits elsewhere and across inserting lines above. |
| 4 | Does the embed stay rendered with the cursor on its line? | Yes (both plain and marked), so folding never "flickers" back to source. |
| 5 | Can the `-` marker be hidden? | Yes — a plain CM6 `Decoration.replace` over the dash; revealed again when the cursor is on that line (standard LP convention). |
| 6 | Does fold state survive editing? | Yes — held in a CM6 `StateField` whose positions map through document changes automatically. |
| 7 | Does clicking the title fold/unfold? | Yes — via a listener on the title element (see Constraint C). |
| 8 | Reading mode regressions? | None: reading-mode behaviour is unchanged when its assertions are scoped to `.markdown-reading-view`. |

Prototype size: ~200 lines, one module, zero new runtime dependencies
(`@codemirror/state` / `@codemirror/view` are already installed and externalised —
Obsidian provides them at runtime).

## Constraints discovered (these shape the design)

- **A. Obsidian renders embeds asynchronously, outside CM's update cycle.** A
  `ViewPlugin.update()` alone NEVER sees the loaded embed; a `MutationObserver` on
  `view.contentDOM` is required to (re)apply fold classes. Same pattern the reading-mode
  post-processor already uses, so it is consistent, not novel.
- **B. `view.posAtDOM(embedEl)` is only LINE-accurate.** A block embed reports its exact
  line start; an inline (marked) embed reports a few characters into the line. Fold state
  must therefore be anchored at the LINE START → embeds sharing one line share fold state
  (reading mode keys per occurrence).
- **C. Obsidian swallows title events before CM sees them.** `EditorView.domEventHandlers`
  never fires for a title click; a direct listener on the title element is required
  (again: exactly what reading mode does).
- **D. `![[x]]-` renders as an INLINE widget, `![[x]]` as a BLOCK widget.** Visually
  equivalent once the dash is hidden (see `prototype/lp-proto-default.png`), but the two
  are different CM decoration shapes.

## Gaps / costs to accept before implementing

1. **Marker semantics would diverge from reading mode (the real decision).**
   Reading mode strips the dash after ANY `]]` (it works on rendered DOM, so a `![[x]]-`
   inside a code span is naturally excluded). In CM6 we only have document TEXT, and a
   raw-text scan false-positives — verified: the prose line ``A default-folded embed uses
   the `![[ ]]-` syntax:`` matched. Avoiding that needs Obsidian's markdown syntax-tree
   node names, which are NOT public API (fragile across releases). The robust, no-hack
   alternative used in the prototype is a WHOLE-LINE rule: only a line that is exactly
   `![[target]]-` counts. That covers the dominant usage but means
   `text ![[x]]- more text` folds by default in reading mode and NOT in Live Preview.
2. **Fold state is not shared between the two modes.** Reading mode keys by
   `sourcePath::line::src::#index` in `foldStateStore`; Live Preview keys by a CM position.
   Sharing needs a translation layer (position → line → reading-mode key) and is only
   partially sound given constraint B. Cheapest honest option: independent per-mode session
   state, documented.
3. **Existing e2e selectors need scoping.** `.markdown-embed.fen-embed` now also matches the
   hidden editor DOM; the committed reading-mode suite must scope to `.markdown-reading-view`.
4. **Ongoing maintenance surface.** This rides on Obsidian's internal editor DOM
   (`.internal-embed` inside `.cm-content`) rather than a published extension point, so an
   Obsidian release could change the widget structure. Blast radius is limited to Live
   Preview: reading mode keeps working regardless.

## Recommendation

Go — with scope narrowed to whole-line `![[x]]-` markers and per-mode fold state, both
documented in the README as explicit limitations. If identical cross-mode marker semantics
is a hard requirement, the answer is NO-GO: matching it needs private syntax-tree
internals, which fails the ticket's "no hacks / robust" bar.

## Proposed follow-up tickets (only if GO)

1. Implement Live Preview foldable embeds (CM6 StateField + marker decoration + widget-class
   ViewPlugin), reusing `styles.css` and the reading-mode ready-observer pattern.
2. Scope the reading-mode e2e selectors to `.markdown-reading-view`; add a Live Preview e2e suite.
3. README: document Live Preview support and the whole-line marker + per-mode fold-state limits.
