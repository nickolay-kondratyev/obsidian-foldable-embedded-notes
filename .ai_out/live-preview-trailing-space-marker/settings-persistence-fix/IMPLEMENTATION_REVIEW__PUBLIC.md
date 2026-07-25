# IMPLEMENTATION REVIEW — Live Preview: fold marker inert with a trailing space

Commit under review: `eebd621` (vs `41bed39`). Ticket `nid_drtkfuu5gijr9qjec5tj2o2yh_e`.

## Verdict: READY

0 BLOCKING · 2 SHOULD-FIX · 2 NIT/Suggestion.

The fix is small, correct, and the two new e2e tests are genuinely falsifiable. Nothing was
weakened or removed. The two SHOULD-FIX items are test-harness hardening and one DRY
extraction; neither blocks merge.

## Verification I ran myself

- `npm run lint` → exit 0. One PRE-EXISTING warning (`foldableEmbedsSettingTab.ts:12`,
  `obsidianmd/settings-tab/prefer-setting-definitions`), untouched by this change.
- `npm run build` (`tsc -noEmit` + esbuild production) → exit 0.
- `npm run test:e2e -- live-preview-foldable-embeds.e2e.ts` → **15 passed**, 0 failed,
  0 skipped. Both new tests (#6, #7) green.
- No `sanity_check.sh` in this repo.

## 1. `lastIndexOf("-")` correctness — CHECKED, CORRECT

`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/src/livePreview/markedEmbedLines.ts:24,47`

```ts
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/;
found.push({ lineFrom, dashFrom: lineFrom + text.lastIndexOf("-") });
```

I tried to break it and could not. For every line the regex admits, the structure is
`![[` + target + `]]` + `-` + `[ \t]*`. Any dash inside the target sits *before* `]]`, i.e.
strictly before the marker; the suffix after the marker admits only space/tab, so it can
contain no dash at all. Therefore the marker dash IS the line's last `-`, unconditionally.

Concrete cases walked through:
- `![[my-note]]-` → target dash at 4, marker at 12, `lastIndexOf` = 12. Correct.
- `![[a-b]]-   ` → marker at 8 (`text.length - 1` = 11 would have been WRONG — this is
  exactly the arithmetic bug the change fixes). Correct.
- `![[a-b]]-\t` → same, correct.
- `![[--]]-` → marker at 7. Correct.
- `![[x]]--` → rejected by the regex (only one dash permitted). No case reaches `lastIndexOf`.
- A line of only whitespace, or `- ![[x]]-`, or `![[x]]- tail` → rejected by `^!`/`$`.

The invariant is stated at the call site (`markedEmbedLines.ts:45-46`) and re-stated in the
regex WHAT comment, so a future widening of the regex has a fighting chance of being caught.
`[ \t]*` over `\s*` is the right call: the scan is per-line, and `\s` would spell `\n`/`\r`
that cannot occur.

`Decoration.replace(dashFrom, dashFrom + 1)` (`markedEmbedLines.ts:94`) is unchanged in width
— one character, the dash — which is the deliberate decision the design note asked for, and it
matches reading mode (`stripFoldMarker` writes `afterMarker` back verbatim, whitespace
included). Documented at `markedEmbedLines.ts:81-82`.

## 2. Alignment with reading mode — ALIGNED for whole-line input

`src/foldableEmbedsPostProcessor.ts:94-110` accepts a dash that is the first char of the
embed's next text sibling AND is followed by whitespace or end-of-node. For lines that are
NOTHING BUT an embed plus marker, the two parsers now accept and reject the same set:

| line | reading | live preview |
|---|---|---|
| `![[x]]-` | fold | fold |
| `![[x]]- ` / `![[x]]-\t` | fold | fold (**this fix**) |
| `![[x]] -` | no | no |
| `![[x]]-like` | no | no |
| `![[x]]--` | no | no |

Remaining, PRE-EXISTING and deliberate divergences (both already documented under the
"whole-line only" WHY at `markedEmbedLines.ts:9-13` and asserted by the AC3 test at
`e2e/live-preview-foldable-embeds.e2e.ts:253`):
- `![[x]]- tail text` → reading mode folds, Live Preview does not.
- An INDENTED marked embed (list item / blockquote, e.g. `- ![[x]]-`) → `^!` rejects it in
  Live Preview; reading mode folds it. See suggestion S1.

Neither is in this ticket's scope and neither is a regression.

## ⚠️ SHOULD-FIX

### SF1 — `currentLineOf` now has two trim-equal candidates in the fixture

`e2e/live-preview-foldable-embeds.e2e.ts:287-293` and `:420-426`

```ts
const markedLine = await currentLineOf("![[child]]-");
await harness.replaceRange("", { line: markedLine, ch: 0 }, { line: markedLine, ch: 1 });
```

`currentLineOf` matches on `line.trim() === needle`. The new fixture line 10 is
`![[child]]- ` — which **trims to exactly the same string** as line 4. The test is correct
today only because `findIndex` returns the FIRST match and `LINE_MARKED` (4) precedes
`LINE_TRAILING_SPACE_MARKED` (10). If the fixture is ever reordered, that `replaceRange`
silently deletes the `!` from the wrong line and every later assertion in this serial spec
degrades in a confusing way — the exact class of silent-wrongness `e2e/foldAssertions.ts`
argues against.

Fix (cheap): have `currentLineOf` fail loudly on ambiguity, e.g. collect all matching indices
and `throw` unless there is exactly one; or drop the `trim()` and compare the raw line, which
distinguishes the two fixture lines outright.

### SF2 — duplicated "no `.cm-line` ancestor" guard (DRY)

`e2e/live-preview-foldable-embeds.e2e.ts:143-153` (`lineTextOfEmbed`) and `:169-183`
(`markdownAfterEmbed`) now carry the identical four lines *and* the identical WHY comment
about vacuous assertions. That is the repo's own DRY heuristic tripping ("if you'd write the
same WHY comment twice, even a single line is worth extracting").

Fix: extract one helper that resolves an embed to its `.cm-line` element (or throws with that
message) and let both read from it. Knowledge about the DOM contract then lives in one place.

## 💡 Suggestions

- **S1 — follow-up ticket for the indented-embed divergence.** `- ![[x]]-` inside a list
  folds in reading mode and not in Live Preview. Same *family* of bug as the one just fixed
  (a whole-line rule that is stricter than the reading-mode rule), but with a real design
  question attached (an indented line still cannot be inside a code span, so `^[ \t]*!\[\[`
  may well be safe — it needs its own thinking and its own test, not a drive-by). Per
  CLAUDE.md's ownership rule this belongs in a `ticket`, not in this change.
- **S2 — NIT.** `markdownAfterEmbed`'s `findIndex(...) === -1` path silently falls back to
  `slice(0)` (whole line). It cannot happen (`el` is a descendant of `line`) and it fails
  loudly rather than vacuously under the exact-equality assertion, so this is fine as-is;
  noting only that the neighbouring `closest` guard chose to throw and this one does not.

## Falsifiability of the new tests — VERIFIED

- `` `![[child]]- ` with a trailing space still folds by default `` (`:234`) — reverting the
  regex makes line 10 unmarked, so the embed renders unfolded and `expectFolded(_, true)`
  fails. The implementer's stash-run recorded exactly that failure, and `expectFolded`'s
  positive branch (`toHaveClass`) is the non-vacuous one per `e2e/foldAssertions.ts`.
- `only the dash is hidden … its trailing space survives` (`:240`) — asserts exact `" "` and
  then exact `"- "`, not `trimEnd()`. Reverting yields `"- "` for the first assertion. This is
  also the assertion that pins the `dashFrom` arithmetic: had `dashFrom` stayed
  `text.length - 1`, the replace range would cover the SPACE instead of the dash and this
  reads `"-"`. Good, deliberate test design.
- Existing assertions were **changed, not weakened**: `toHaveCount(3)` → `EMBED_COUNT` (4)
  tracks a real fixture addition; the Source-mode test's `toBe(1)` → `MARKED_LINE_COUNT` (2)
  is the honest new count, and its Live Preview baseline of `0` (`:337`) is unchanged and is
  now a *stronger* claim (both dashes hidden) — that baseline alone would also catch a revert.
- No test was deleted or skipped. The fixture was APPENDED so no existing `LINE_*`/`EMBED_*`
  constant shifted — the right way to add a case without breaking neighbours.
- Cursor-on-line reveal is covered in both directions (`:226` for the plain marker, `:247-250`
  for the trailing-space one) and both pass.

## CLAUDE.md edit

`CLAUDE.md:45-49` — accurate, two lines, and it records the *stable* decision (blanks
tolerated; the decoration hides exactly the dash) rather than a volatile detail. Consistent
with the surrounding bullets' voice. No further doc updates needed.

## Security / architecture

Nothing to flag: no I/O, no user-supplied data leaving the vault, no new dependency, no
Node/Electron API, no state added. Regex is anchored and linear — no catastrophic-backtracking
shape (`[^\]\n]+` followed by a literal, single `[ \t]*` tail).
