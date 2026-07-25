# PRIVATE rehydration notes — trailing-space fold marker

STATUS: **COMPLETE**, review iteration INCLUDED. Working tree DIRTY on purpose (orchestrator
commits). Original fix already committed as `eebd621`; only test-hardening is uncommitted now.

## Working-tree state at this handoff

Base of uncommitted work: `eebd621` on `settings-persistence-fix`.
- Modified: `e2e/live-preview-foldable-embeds.e2e.ts` (the two SHOULD-FIX items only)
- Modified: `_tickets/live-preview-fold-marker-inert-with-a-trailing-space.md` (a `links:`
  entry added by `ticket link` — NOT a status change; the ticket is still open on purpose)
- Untracked: `_tickets/live-preview-an-indented-marked-embed-list-item-quote-never-folds.md`
  (the new S1 follow-up, `nid_ktx90omxm6sqotiude6iliwjn_e`)
- Untracked: `.ai_out/live-preview-trailing-space-marker/`

`src/` is UNTOUCHED this iteration.

## The original fix in two lines (unchanged, committed)

```ts
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/;   // was /^!\[\[[^\]\n]+\]\]-$/
found.push({ lineFrom, dashFrom: lineFrom + text.lastIndexOf("-") }); // was + text.length - 1
```
`Decoration.replace({}).range(dashFrom, dashFrom + 1)` unchanged — width 1, position fixed.

## This iteration's two test changes

1. `currentLineOf`: raw (untrimmed) compare + throw unless EXACTLY one match. Destructures
   `const [only, ...extra]` because `noUncheckedIndexedAccess` makes `matches[0]` possibly
   undefined and I did not want a cast.
2. `embedLineText(nth) -> { whole, afterEmbed }`: one `page.evaluate`, the `.cm-line` guard
   stated once. `lineTextOfEmbed` / `markdownAfterEmbed` are thin projections.

Rejected (S2 NIT): the unreachable `findIndex === -1` fallback in `markdownAfterEmbed` — it
fails loudly under exact equality anyway.

## Traps / hard-won facts (keep these)

- **Probing a single test with `-g` is misleading here.** The spec is `mode: "serial"` and
  tests inherit fold state; `typing at the START ...` fails at its FIRST assertion when run
  alone, long before `currentLineOf`. Any red-first probe of a late test must run the WHOLE
  file (`npm run test:e2e -- live-preview-foldable-embeds.e2e.ts`).
- **The root `tsc -noEmit` does NOT cover `e2e/`** — `tsconfig.json` has
  `"include": ["src/**/*.ts"]`. e2e type errors only surface via
  `npx tsc -noEmit -p e2e/tsconfig.json` (which extends the root, so it inherits
  `noUncheckedIndexedAccess`) or at Playwright run time. Run it after editing e2e.
- `markdownAfterEmbed` returns clean text: `"- "` pre-fix, `" "` post-fix. CM6 widget buffers
  are `<img>`, so they contribute no textContent.
- Fixture line 10 was APPENDED so no existing `LINE_*` / `EMBED_*` constant moved.
- Full suite: 40 tests, ~7s test time (~1 min wall incl. build + Obsidian launch).
- Logs from this iteration: `.tmp/iter-lint-final.log`, `.tmp/iter-build-final.log`,
  `.tmp/iter-tsc-e2e.log`, `.tmp/iter-e2e-final.log`,
  `.tmp/iter-e2e-guard-probe2.log` (the SF1 guard firing: `found [2]`).

## Known-benign noise

`npm run lint` emits ONE pre-existing warning
(`obsidianmd/settings-tab/prefer-setting-definitions` on `foldableEmbedsSettingTab.ts:12`).
Present before all of this; 0 errors either way.

## If work resumes

Nothing outstanding in scope. Orchestrator still owns: commit, change_log entry, closing
`nid_drtkfuu5gijr9qjec5tj2o2yh_e`. The new ticket
`nid_ktx90omxm6sqotiude6iliwjn_e` (indented marked embed) is open and intentionally unstarted.
