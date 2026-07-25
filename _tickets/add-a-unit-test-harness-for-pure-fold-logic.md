---
id: nid_lcehddb2tdcq6qxztmhvhpgga_e
title: "Add a unit-test harness for pure fold logic"
status: open
deps: []
links: []
created_iso: 2026-07-24T22:00:07Z
status_updated_iso: 2026-07-24T22:00:07Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

The repo has no unit-test runner: every assertion runs through the real-Obsidian
Playwright e2e suite in `e2e/`. That is the right release gate, but it is a slow
and indirect way to cover pure functions.

Add a light unit-test runner (vitest or jest + config + CI wiring in
`.github/workflows/`) and cover the three pieces of pure logic that are currently
only exercised end-to-end:

1. `findMarkedEmbedLines` / the `WHOLE_LINE_MARKED_EMBED` regex in
   `src/livePreview/markedEmbedLines.ts` — positives, and the negatives that
   matter: a mid-paragraph `text ![[x]]- text`, a code-span `` `![[x]]-` ``,
   `![[x]]-x`, leading/trailing whitespace.
2. `effectiveFold` in `src/livePreview/foldStateField.ts` — the business rule
   "an explicit user choice beats the `-` marker default", including the
   `undefined` (never toggled) case.
3. The line-RANGE update/lookup in `explicitFoldField` +`explicitFoldAt`
   (same file) — inserting text at a line start must NOT lose the fold state,
   and a toggle must replace (not duplicate) the entry for that line.

None of this is a known defect: all three are green in
`e2e/live-preview-foldable-embeds.e2e.ts` today. This is about making that
coverage fast, direct and cheap to extend.

Context: deferred deliberately in
`.ai_out/live-preview-foldable-embeds/master/DETAILED_PLANNING__PUBLIC.md` §4.4
(adding a runner was not 80/20 for that ticket).

## Acceptance Criteria

- A unit-test runner is wired into the repo and into CI.
- The three pieces of logic above have focused unit tests (one assert per test, BDD GIVEN/WHEN/THEN).
- `npm run lint` and `npm run build` stay clean; the e2e suite is unchanged and still green.


## Notes

**2026-07-25T03:58:21Z**

ITEM 4 (added after the settings-persistence fix, commit 503f05b on branch
settings-persistence-fix): `FoldableEmbedsSettingsStore` in
src/settings/foldableEmbedsSettingsStore.ts, against a FAKE `SettingsPersistence`
whose `saveData` resolves OUT OF ORDER (first call settles after the second).

WHY this belongs here and is not optional: the store's write serialization is the fix
for priority-1 bug nid_rbh5zfj0mlvuo1hi2trl8fxli_e (two overlapping toggles could leave
data.json holding the value the user changed their mind about). That bug has NO
red-provable test today. The e2e guard in e2e/settings-persistence.e2e.ts ("overlapping
toggles") passed even against the UNSERIALIZED store on every run - Obsidian's writes
happened to complete in order - so it catches dropped/stale writes but CANNOT catch a
regression of the ordering itself. A fake whose promises resolve out of order is the only
deterministic route, and it needs the runner this ticket adds.

Failure scenario if never done: someone "simplifies" `setStartCollapsed` back to a bare
`await this.persistence.saveData(...)`, the whole suite stays green, and the P1 bug
silently returns.

Cases to cover:
(a) two overlapping `setStartCollapsed` calls -> the LAST call's value is what reaches
    disk last, and exactly one write happens per call;
(b) a REJECTED save does not skip the next queued write (the queue tail
    `this.saving` must stay a never-rejected promise);
(c) that rejection still reaches the CALLER, so
    FoldableEmbedsSettingTab.saveStartCollapsed's catch + Notice keeps firing;
(d) `asKeyedObject` - see the separate note on ticket nid_fp6hsv6aljxz1ifawlezcfdgu_e;
    covering it here as pure logic is the cheaper alternative to the e2e route.

Raised as SHOULD-FIX 1 in
.ai_out/settings-persistence/settings-persistence-fix/IMPLEMENTATION_REVIEW__PUBLIC.md.
