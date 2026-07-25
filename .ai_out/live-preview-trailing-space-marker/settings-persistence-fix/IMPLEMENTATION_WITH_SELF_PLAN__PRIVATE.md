# PRIVATE rehydration notes — trailing-space fold marker

STATUS: **COMPLETE**. All plan steps done. Working tree DIRTY on purpose (orchestrator commits).

## Working-tree state at handoff

Modified (uncommitted), base commit `41bed39` on `settings-persistence-fix`:
- `src/livePreview/markedEmbedLines.ts`
- `e2e/live-preview-foldable-embeds.e2e.ts`
- `CLAUDE.md`
Untracked: `.ai_out/live-preview-trailing-space-marker/` (this dir).
`git stash` list is EMPTY — the red-first stash was popped (`a02e172` dropped). Verify with
`git stash list` if anything looks missing.

## The fix in two lines

```ts
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/;   // was /^!\[\[[^\]\n]+\]\]-$/
found.push({ lineFrom, dashFrom: lineFrom + text.lastIndexOf("-") }); // was + text.length - 1
```
`Decoration.replace({}).range(dashFrom, dashFrom + 1)` UNCHANGED — width stays 1, only the
position was wrong. Decision: hide exactly the dash, keep trailing blanks (mirrors reading
mode's `stripFoldMarker`, which writes the post-dash remainder back verbatim).

## Dead ends / rejected options

- Capture-group form `/^(!\[\[[^\]\n]+\]\]-)[ \t]*$/` + `match[1].length - 1`: rejected because
  `tsconfig.json` sets `noUncheckedIndexedAccess`, making `match[1]` `string | undefined` and
  forcing an unreachable-branch guard. `lastIndexOf` is total and provable.
- `\s*$`: rejected as less explicit — the scan is per-line via `doc.iterLines()`, so only
  spaces/tabs are reachable.
- Reusing `lineEndsWithDash` for the new assertions: impossible, `trimEnd()` erases the exact
  distinction under test. Hence `markdownAfterEmbed`.

## E2E facts learned (useful next time)

- `markdownAfterEmbed` returns clean text: `"- "` pre-fix, `" "` post-fix. No zero-width chars,
  no `cm-widgetBuffer` text leakage — CM6 widget buffers are `<img>`, contributing no textContent.
- Playwright serial mode: a failing test SKIPS the rest of the file (`1 did not run`), so proving
  two tests red required two separate `-g` runs.
- Fixture line appended at the END so no existing `LINE_*`/`EMBED_*` constant moved. The new
  embed is therefore index 3 (document order), after the inline-marked one.
- `currentLineOf(text)` compares `line.trim() === needle`, so `![[child]]- ` ALSO trims to
  `![[child]]-`; `findIndex` returns the FIRST match (the plain marked line, 4). Existing test
  `typing at the START ...` is unaffected — but this is a live trap if anyone reorders the fixture.
- Full suite is fast once Obsidian is cached: 40 tests in ~7s of test time (~1 min wall incl.
  build + launch). Logs kept: `.tmp/e2e-before-fix.log`, `.tmp/e2e-before-fix-2.log`,
  `.tmp/e2e-after-fix.log`, `.tmp/lint.log`, `.tmp/build.log`.

## Known-benign noise

`npm run lint` emits ONE pre-existing warning
(`obsidianmd/settings-tab/prefer-setting-definitions` on `foldableEmbedsSettingTab.ts:12`).
Present before this change; 0 errors either way.

## If work resumes

Nothing outstanding. Remaining actions belong to the orchestrator: commit, change_log entry,
close ticket `nid_drtkfuu5gijr9qjec5tj2o2yh_e`.
