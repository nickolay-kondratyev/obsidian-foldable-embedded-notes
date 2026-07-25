# IMPLEMENTATION — Live Preview: fold marker inert with a trailing space

Ticket `nid_drtkfuu5gijr9qjec5tj2o2yh_e`. Branch `settings-persistence-fix`, base `41bed39`.
NOT committed (orchestrator commits), no change_log entry, ticket left open — per direction.

## Plan (executed as written)

1. Widen `WHOLE_LINE_MARKED_EMBED` to tolerate blanks after the dash.
2. Stop deriving `dashFrom` from "last character of the line".
3. Add a failing e2e fixture line + two tests; prove them red against unfixed code.
4. Apply fix; run lint, build, FULL e2e.
5. Touch CLAUDE.md only where it became inaccurate.

## Changes

### `src/livePreview/markedEmbedLines.ts`

- Regex: `/^!\[\[[^\]\n]+\]\]-$/` → `/^!\[\[[^\]\n]+\]\]-[ \t]*$/`, with a WHAT comment on the
  pattern and a WHY on the tolerance (reading mode accepts `![[x]]- `; a trailing space is
  invisible, so the old rule killed the feature silently in one mode only).
- `[ \t]*` rather than `\s*`: the scan is per-LINE, so the only whitespace that can occur is
  spaces/tabs. Being explicit about that beats a class that also spells `\n`/`\r`.
- `dashFrom`: `lineFrom + text.length - 1` → `lineFrom + text.lastIndexOf("-")`. Correct
  because the regex now guarantees nothing but blanks follows the dash, so the marker dash is
  necessarily the line's LAST `-` (a dash inside the target sits before `]]`).
  - WHY-NOT a capture group (`/^(...-)[ \t]*$/`, `match[1].length - 1`): the repo has
    `noUncheckedIndexedAccess`, so `match[1]` is `string | undefined` and would need an
    impossible-branch guard. `lastIndexOf` is total, typed `number`, and provable in one line.
- Doc comments: `MarkedEmbedLine.dashFrom` no longer claims "last character of the line";
  `markerDashDecoration` now states it hides exactly the dash.

### DELIBERATE DECISION — what the hidden range covers

**Exactly the one dash character. Trailing whitespace stays rendered.**
Reading mode (`stripFoldMarker`) removes only `FOLD_MARKER` from the text node and writes the
remainder back verbatim, so any trailing whitespace survives there. Hiding the blanks in Live
Preview would make the two modes disagree again, just in the other direction, and would hide
characters the user can still put a cursor between. The `Decoration.replace` therefore remains
`(dashFrom, dashFrom + 1)` — unchanged in width, only correct now in POSITION.
This is asserted by exact string equality, not by `trimEnd()`.

### `e2e/live-preview-foldable-embeds.e2e.ts`

- Fixture `lp-embeds.md` gains `![[child]]- ` (one trailing space) APPENDED at line 10, so every
  existing `LINE_*` / `EMBED_*` constant keeps its value. New constants:
  `LINE_TRAILING_SPACE_MARKED = 10`, `EMBED_TRAILING_SPACE_MARKED = 3`, `EMBED_COUNT = 4`,
  `MARKED_LINE_COUNT = 2`. The space is a named constant (`TRAILING_SPACE`) so it cannot be
  lost to a formatter or misread in review.
- New helper `markdownAfterEmbed(nth)`: concatenates the `.cm-line` child nodes AFTER the one
  containing the embed widget — i.e. the raw markdown tail, character for character, without
  the embed's own rendered text. This exists because `lineEndsWithDash` (`trimEnd()`) CANNOT
  distinguish "dash hidden, space visible" from "dash + space both hidden"; the existing helper
  is untouched and still used by the pre-existing tests.
- Two new tests (placed after the existing reveal test, before the tests that shift line
  numbers — hence `LINE_TRAILING_SPACE_MARKED` stays valid):
  - `` `![[child]]- ` with a trailing space still folds by default ``
  - `only the dash is hidden on a marked line — its trailing space survives` — asserts
    `markdownAfterEmbed === " "` with the cursor elsewhere, then `=== "- "` with the cursor on
    the line (reveal path), then restores the cursor to `LINE_ELSEWHERE`.
- Existing assertions updated, NOT weakened: `toHaveCount(3)` → `toHaveCount(EMBED_COUNT)` (4);
  the Source-mode literal-dash test's `toBe(1)` → `toBe(MARKED_LINE_COUNT)` (2). Its Live
  Preview baseline of `0` is unchanged and is now a stronger claim (both dashes hidden).
  `beforeAll` now waits on the LAST embed rather than the inline one.
- Header doc-comment describing the fixture updated.

### `CLAUDE.md`

One sentence added to the `markedEmbedLines.ts` bullet: blanks after the dash are tolerated;
the decoration hides exactly the dash.

## Test evidence (actually run, verbatim outcomes)

**RED — fix stashed (`git stash push -- src/livePreview/markedEmbedLines.ts`), new tests only:**

- `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts -g "trailing space"` → `EXIT=1`,
  `1 failed, 1 did not run` (serial mode skips after a failure). Failure:
  `expect(locator).toHaveClass(/\bfen-folded\b/)` on `.internal-embed.fen-embed` nth(3);
  received `"internal-embed markdown-embed inline-embed is-loaded fen-embed"` — i.e. the
  trailing-space embed did NOT fold by default. Log: `.tmp/e2e-before-fix.log`.
- `... -g "only the dash is hidden"` (run separately so it was not skipped) → `EXIT=1`,
  `1 failed`. Failure: `Expected: " " / Received: "- "` — the dash was not hidden at all.
  Log: `.tmp/e2e-before-fix-2.log`. This also confirms the helper returns clean text (no
  zero-width/CM buffer noise), so the exact-equality assertion is sound.

**GREEN — after `git stash pop`:**

- `npm run lint` → exit 0. One PRE-EXISTING warning, untouched by this change:
  `foldableEmbedsSettingTab.ts:12 obsidianmd/settings-tab/prefer-setting-definitions`.
  0 errors. Log: `.tmp/lint.log`.
- `npm run build` (`tsc -noEmit` + esbuild production) → exit 0, no output. Log: `.tmp/build.log`.
- `npm run test:e2e` (FULL suite, real Obsidian 1.12.7, headless) → exit 0,
  **40 passed (6.9s)**, 0 failed, 0 skipped. Both new tests among them (#18, #19).
  Log: `.tmp/e2e-after-fix.log`.

## What a reviewer must scrutinise

1. **`text.lastIndexOf("-")` correctness** rests entirely on the regex allowing only `[ \t]` after
   the dash. If the regex is ever widened further, that invariant must be rechecked — the
   comment says so at the call site.
2. **`markdownAfterEmbed`'s node arithmetic** (`findIndex(node => node.contains(el))`) assumes the
   embed widget is one direct child of `.cm-line`. It throws loudly when there is no `.cm-line`
   ancestor; it would silently return `""` if the widget were somehow not found (`findIndex` →
   `-1` → `slice(0)` would instead return the WHOLE line, which fails loudly, not vacuously).
   Verified empirically: it returned `"- "` pre-fix and `" "` post-fix.
3. **Test ordering dependency**: the new tests use the constant `LINE_TRAILING_SPACE_MARKED` and
   must stay ABOVE `fold state survives an edit that shifts every position below it`, which
   inserts lines. Documented on the constant.
4. **Source mode / reading mode were not changed.** Reading mode already accepted `![[x]]- `;
   its e2e spec is untouched and still green.

## Deliberately NOT done

- No unit-test runner introduced (per direction). I also did NOT file a follow-up ticket for one:
  the regex + offset logic is now covered end-to-end by two falsifiable exact-text assertions that
  were proven red first, so a unit runner would add tooling, not coverage, for this bug.
- No commit, no change_log entry, ticket left open.
