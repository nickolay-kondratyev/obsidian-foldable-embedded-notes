# Implementation Review — Reading-mode foldable embeds (`![[x]]-`)

**VERDICT: APPROVED_WITH_MINORS**  (0 BLOCKER, 0 MAJOR, 6 MINOR/NIT)

Reviewed at HEAD (`aa47b61`) against ticket
`reading-mode-foldable-embeds-with-x-fold-by-default-syntax.md`. Build, lint, and the full
e2e suite reproduce green (see bottom). The implementation faithfully matches the ticket's
product decisions and module design. Findings below are all optional-to-fix robustness/test
improvements; none block completion.

## 🚨 BLOCKER
None.

## ⚠️ MAJOR
None.

## 💡 MINOR / NIT

### MINOR-1 — Fold-state key collides for same-note embeds sharing one section
`src/foldableEmbedsPostProcessor.ts:122-132`. Key = `sourcePath::L<lineStart>::src`. Two
embeds of the SAME note within a single section — same line (`![[child]] ![[child]]`) or
consecutive lines in one paragraph (no blank line) — produce identical `lineStart` + `src`
→ same key → shared fold state. The ticket's edge-case list explicitly wants "independent
fold state" for multiple same-note embeds. The code even hedges in its own comment
("distinguishable-ish"). This follows the ticket's prescribed key formula, and the realistic
authoring pattern (each embed on its own line, blank-separated) works fine, so severity is
MINOR — but the fix is nearly free.
Suggested fix: append `indexWithinSection` to the key unconditionally
(`${sourcePath}::${locator}::${src}::#${indexWithinSection}`). It is stable across re-renders
(the section always renders its embeds in the same order) and makes every occurrence
independent without weakening the line-based stability.

### MINOR-2 — Null-fallback key lacks a section discriminator
`src/foldableEmbedsPostProcessor.ts:129-131`. When `getSectionInfo` returns null the locator
is just `i<index>` with no section identifier, so an embed at index 0 in section A and index 0
in section B with the same `src` collide. `getSectionInfo` is reliable in reading mode so this
is rare. Folding MINOR-1's fix in (always include the occurrence index alongside the line)
plus keeping a section-level discriminator would also close this.

### MINOR-3 — MutationObserver not disconnected for never-resolving embeds / on unload
`src/foldableEmbedsPostProcessor.ts:143-160`. The observer disconnects on title-ready or when
the embed is detected as media, but a permanently-unresolved embed (e.g. broken `![[missing]]`)
keeps an active observer until its DOM node is garbage-collected, and observers are not tracked
for explicit disconnect on plugin unload. It is bounded (detached sections GC their observers),
but CLAUDE.md prefers explicit cleanup of anything that can leak across reload.
Suggested fix: track live observers in a Set and disconnect them in `onunload`, and/or add a
bounded guard so an observer that never resolves stops after the embed leaves the DOM.

### MINOR-4 — e2e proves the fold CLASS, not that content is actually hidden
`e2e/foldable-embeds.e2e.ts:57,62,82`. Assertions check for the `fen-folded` class but never
verify the embed body is visually collapsed. The whole point of the "two `.markdown-embed-content`
divs" gotcha is that the CSS must hide the RIGHT element(s); the class assertion would still
pass even if the CSS selector were wrong. The CSS is prototype-validated, so this is MINOR.
Suggested fix: add one assertion like `await expect(embed.locator('.markdown-embed-content'))
.toBeHidden()` (or a bounding-box/height check) on a folded embed.

### MINOR-5 — Missing e2e coverage for two ticket edge cases
`e2e/foldable-embeds.e2e.ts`. No test for (a) multiple embeds of the SAME note keeping
independent fold state, and (b) heading/block-ref marker variants `![[note#heading]]-` /
`![[note^block]]-`. Both are called out in the ticket's "Edge cases to cover". Adding (a) would
also surface MINOR-1.

### NIT-6 — eslint ignores the ENTIRE `e2e/` dir (new spec now unlinted)
`eslint.config.mts:24`. The widening is a legitimate fix — the obsidianmd PLUGIN ruleset was
falsely flagging the Node Playwright harness (verified: the pre-impl config produced 41 errors
on `e2e/`+`src/` from `no-unsafe-*`, `no-explicit-any`, `node:` imports, `Buffer`). Ignoring
e2e from the plugin ruleset is a reasonable 80/20 call. Downside: the new `e2e` code (incl. the
feature spec) now gets zero linting. Tighter (optional) scoping: apply a separate non-obsidian
TypeScript config to `e2e/` (or disable only the obsidianmd + `no-unsafe-*` rules there) so test
code keeps type-aware linting. Not required.

## What's good
- Clean SRP split: `main.ts` is lifecycle-only (15 lines), feature logic in the post-processor,
  session state isolated in `FoldStateStore`. Sample-plugin scaffolding fully removed;
  `settings.ts` deleted. Matches ticket + CLAUDE.md.
- Strict marker parse is STRUCTURAL (no regex lookbehind) → iOS/mobile-safe; correctly handles
  EOL vs space-followed and preserves trailing text; only the dash is stripped.
- Store-wins-over-syntax is correct (`store.get(key) ?? foldedByDefault`); re-render re-strips
  the dash from fresh DOM idempotently; session persistence proven by the mode-round-trip test.
- Double-process guard, media-embed skip list, and async-load handling via a scoped observer are
  all sound. Named constants throughout, strong WHY comments, no magic values.
- Collapse is entirely class-driven — no inline styles, no runtime `<style>` injection, chevron
  via `setIcon`. No `innerHTML`/`eval`/`fetch`/`node:`/Electron APIs in `src` (grep-verified);
  `isDesktopOnly=false` is honest.
- README documents the reading-mode-only + media-skip limitations; follow-up tickets exist for
  Live Preview and fold-all/expand-all commands.

## Build / lint / e2e — personally observed
- `npm run build` → exit 0 (tsc -noEmit + esbuild production). Clean.
- `npm run lint` → exit 0, 0 problems.
- `npm run test:e2e` → exit 0, **9 passed** (6 foldable-embeds + 3 hello-world), headless
  Obsidian 1.12.7.
- Lint-red baseline claim VERIFIED: pre-impl eslint config on `e2e/`+`src/` → 41 errors from the
  obsidianmd plugin ruleset hitting Node test tooling; the ignore widening is a real fix, not a
  cosmetic silence.
