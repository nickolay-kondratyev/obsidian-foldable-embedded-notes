# EXPLORATION — Live Preview: fold marker inert with a trailing space

Shared context for IMPLEMENTATION / REVIEW. Gathered read-only; verify line numbers before editing
(they were accurate at commit `41bed39`).

## 1. Live Preview marker parse — `src/livePreview/markedEmbedLines.ts`

```ts
// line 19
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-$/;
```

The `$` immediately after `-` requires the dash to be the literal last character of the line — this
IS the bug: `![[x]]- ` fails the regex entirely, so the line is neither folded by default nor has its
dash hidden.

- `findMarkedEmbedLines` (~35-46): iterates `doc.iterLines()` with a running `lineFrom` offset; on
  match records `{ lineFrom, dashFrom: lineFrom + text.length - 1 }`. **`dashFrom` is computed as
  "last char of the line"** — only correct because the current regex guarantees that. This arithmetic
  MUST change with the regex.
- `markerDashDecoration` (~74-87): `EditorView.decorations.compute` over
  `[markedEmbedLinesField, editorLivePreviewField, "selection"]`. Gated on `editorLivePreviewField`
  (plain Source mode stays verbatim). Builds `cursorLines` from selection heads, skips marked lines
  whose line is in `cursorLines` (cursor-on-line reveal), then
  `Decoration.replace({}).range(marked.dashFrom, marked.dashFrom + 1)` — exactly one character.
- `isMarkedLine` (~61-64): membership check by `lineFrom` in the cached StateField.

## 2. Reading mode marker parse — `src/foldableEmbedsPostProcessor.ts` (~81-110)

```ts
const FOLD_MARKER = "-";
...
private stripFoldMarker(embed: HTMLElement): boolean {
    const sibling = embed.nextSibling;
    if (sibling === null || sibling.nodeType !== Node.TEXT_NODE) return false;
    const text = sibling.textContent ?? "";
    if (!text.startsWith(FOLD_MARKER)) return false;
    const afterMarker = text.slice(FOLD_MARKER.length);
    const followedByWhitespaceOrEol = afterMarker === "" || /^\s/.test(afterMarker);
    if (!followedByWhitespaceOrEol) return false;
    sibling.textContent = afterMarker;
    return true;
}
```

**Reference behaviour to align with**: dash must be the first char after `]]`, and must be followed by
whitespace or end-of-node (`![[x]]-like` is NOT a marker; `![[x]]- ` IS). Only the single dash is
removed — **any trailing whitespace is preserved verbatim**.

→ Implies the Live Preview fix should hide exactly ONE character (the dash) at its real position and
leave trailing whitespace in place. Decide this deliberately and lock it with an assertion.

## 3. Test infrastructure — NO unit-test runner exists

- `package.json` scripts: `dev`, `build` (`tsc -noEmit` + esbuild), `version`, `lint`,
  `setup:obsidian`, `setup:dev-vault`, `test:e2e` (`bash scripts/run-e2e.sh`).
- No `test` script, no vitest/jest dependency, no `*.test.ts` anywhere in the repo.
- The only automated coverage is the Playwright/real-Obsidian e2e suite.

**Direction (per the ticket's acceptance criteria, which ask for e2e coverage): extend the e2e suite.
Do NOT introduce a new unit-test runner as part of this bug fix** — that would be a separate,
larger decision; file a ticket if it feels warranted.

## 4. E2E suite

- Config: `e2e/playwright.config.ts` — `testMatch: "**/*.e2e.ts"`, `workers: 1`,
  `fullyParallel: false`, timeout 120s, expect timeout 15s.
- `e2e/obsidianHarness.ts` — `ObsidianHarness.launch({ extraFixtures })` copies `.dev-vault` to
  `.tmp/e2e/vault` and layers `Record<vaultRelativePath, content>` fixtures on top. Methods:
  `openFile`, `setMarkdownViewMode`, `setLivePreviewEnabled`, `setCursor(line, ch)` (0-based),
  `replaceRange`, `setPluginEnabled`, `runCommand`, `relaunch`, static `readPersistedPluginData`.
- `e2e/foldAssertions.ts` — `expectFolded(embed, folded)`, checks `fen-folded`; documents
  Playwright vacuous-pass pitfalls.
- Live Preview spec to extend: `e2e/live-preview-foldable-embeds.e2e.ts`.
  - Fixture `lp-embeds.md`: `LINE_UNMARKED=2`, `LINE_MARKED=4`, `LINE_ELSEWHERE=0`;
    embed indices `EMBED_UNMARKED=0`, `EMBED_MARKED=1`, `EMBED_INLINE_MARKED=2`.
    Content: heading, `![[child]]` (line 2), `![[child]]-` (line 4), an inline
    `Inline ![[child]]- tail text.` (deliberately inert), and a code-span mention.
  - Helper `lineEndsWithDash(nth)` (~138-141) uses `lineTextOfEmbed` + `text.trimEnd().endsWith("-")`.
    **This helper cannot distinguish "dash hidden, space visible" from "dash+space both hidden"** —
    the new case needs an exact-text assertion, not `trimEnd()`.
  - Existing tests: "whole-line `![[child]]-` folds by default with the dash hidden" (~165-170);
    "the marker dash is revealed while the cursor is on its line" (~184-190);
    `linesEndingWithDash()` (~350-357) used by the Source-mode literal-dash test (~271-285).
- Run: `npm run test:e2e` (full suite) or `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts`.
  The script auto-downloads Obsidian when `OBSIDIAN_PATH` is unset, runs `setup:dev-vault`,
  type-checks specs via `npx tsc -p e2e/tsconfig.json`, then runs Playwright. Headless-safe.

## 5. Other consumers of the marker

- `src/livePreview/foldStateField.ts` (~99-101) — `effectiveFold` calls `isMarkedLine(state, lineFrom)`.
  So `markedEmbedLinesField` is the SINGLE source of truth on the Live Preview side: fixing the regex
  fixes both fold-by-default state and dash hiding, consistently.
- `src/settings/foldableEmbedsSettings.ts` (~50) — `foldedByDefault(settings, hasFoldMarker)` consumes
  the boolean; no marker parsing of its own.
- Grep across `src/` found no other marker parsing.

## Open decisions handed to IMPLEMENTATION

1. Regex whitespace class: `[ \t]*$` vs `\s*$` (in a per-line scan `\s` also matches nothing beyond
   the line, but be explicit). Reading mode's `/^\s/` test is the reference.
2. Whether the `Decoration.replace` covers only the dash or dash+trailing whitespace. Reading mode
   preserves trailing whitespace → hiding exactly the dash is the aligned choice. Must be asserted.
3. `dashFrom` must be derived from the dash's real index, not `text.length - 1`.
