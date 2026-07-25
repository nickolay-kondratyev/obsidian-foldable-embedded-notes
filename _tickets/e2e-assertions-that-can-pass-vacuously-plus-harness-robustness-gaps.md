---
closed_iso: 2026-07-25T04:32:45Z
id: nid_ocmytlb996sexgks0wagew41s_e
title: "e2e: assertions that can pass vacuously, plus harness robustness gaps"
status: closed
deps: []
links: []
created_iso: 2026-07-25T00:44:50Z
status_updated_iso: 2026-07-25T04:32:45Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

Four independent measured problems in the e2e layer — all of them let a real regression go green, or make CI flaky:

1. `e2e/foldable-embeds.e2e.ts:115-127` ("fold state survives a reading -> editing -> reading round-trip") does NOT re-render: stamping the embed element and doing `preview -> source -> preview` leaves the SAME element in place, so the test passes even with a completely broken `src/foldStateStore.ts`. Its comment at `:124` claims "Re-rendered from scratch". A FILE round-trip does rebuild the DOM (measured) and does restore the fold via the store.

2. `e2e/start-collapsed-setting.e2e.ts:90-96` — `expectFolded(embed, false)` is only `not.toHaveClass(...)`, and Playwright passes a NEGATED matcher immediately when the locator resolves to no element (`_expectCore` returns `{matches: options.isNot, missingReceived: true}`). So it cannot distinguish "expanded" from "gone". Concretely: drop the `preventDefault()`/`stopPropagation()` in `src/embedFoldDom.ts:84-85`, the title click falls through to Obsidian's "open the embed", the locator detaches — and the guard test at `:180-188`, whose whole purpose is catching a dead click, goes GREEN on a real regression. Same hole at `:194`, `:199`, `:223`.

3. `e2e/obsidianHarness.ts:309-315` (`readPersistedPluginData`) does `readFileSync` + `JSON.parse` and is driven by `expect.poll` (`e2e/start-collapsed-setting.e2e.ts:106-110`). In Playwright, the polled function's rejection is NOT converted into a retry (`const value = await actual();` sits outside the try/catch in `node_modules/playwright/lib/matchers/expect.js`), so observing `data.json` mid-write throws `SyntaxError` and hard-fails the very assertion meant to be patient.

4. `e2e/obsidianHarness.ts:129-138` spawns Obsidian with default `stdio: 'pipe'` and never drains STDOUT (only stderr is consumed, `:408`). Once the child writes ~64 KB the pipe buffer fills and its `write()` blocks forever — the app freezes and every later assertion times out, looking random. Secondary: the stderr `data` listener is never removed, so `stderrSoFar` accumulates the whole session in memory. Also `:146-149` uses a bare `obsidianProcess.kill()` on the launch-failure path, re-introducing the exact race that `killAndWaitForExit` (`:163-183`) documents — a killed-but-not-awaited Obsidian keeps writing sandbox-config files, so the NEXT spec's `prepareSandboxConfigDir` wipe (`:374-376`) can fail with `ENOTEMPTY` and mask the original failure.

## Design

1. Make the round-trip test leave the file and come back (`openFile(other)` -> `openFile(parent)`), or assert element identity actually changed.
2. In `expectFolded`, assert PRESENCE before the negated matcher (`await expect(embed).toBeAttached()`, or use the positive `expect(...markdown-embed-content...).toBeVisible()`).
3. `try { return JSON.parse(...) } catch { return null }` in `readPersistedPluginData`.
4. `spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] })`; remove the stderr listener once the endpoint is found; `await ObsidianHarness.killAndWaitForExit(obsidianProcess)` in the launch-failure catch.

## Acceptance Criteria

- Each fixed assertion FAILS when the behaviour it guards is deliberately broken (verify by temporarily breaking it, then revert).
- Full e2e suite green; no long-run hangs; `git status` clean afterwards.


## Notes

**2026-07-25T03:35:41Z**

Promoted to priority 1 and should be done FIRST of the must-fix set: several other tickets' acceptance criteria are 'covered by an e2e test', and today two of those assertion shapes can pass vacuously (negated matcher on a missing element; a round-trip that does not re-render). Fixing them first means the rest of the run-through is actually verifiable.

**2026-07-25T04:32:45Z**

RESOLVED. Defects 1, 3, 4 fixed as filed; defect 2's premise was DISPROVEN by independent measurement.

1. Round-trip test now leaves the note (sibling.md) and returns, with a shared e2e/reRenderGuard.ts asserting DOM-node identity changed. Proven non-vacuous: red under a broken FoldStateStore.get(), green after revert.
2. NOT the described bug. Playwright 1.61.1 scalar not.toHaveClass(/re/) FAILS on a zero-element locator (matches: options.isNot is the fail-in-either-polarity sentinel, not a pass), and deleting preventDefault/stopPropagation detaches nothing on Obsidian 1.12.7. However the ARRAY form not.toHaveClass([/re/]) DOES pass vacuously — documented as a WHY comment in the new shared e2e/foldAssertions.ts, and toBeAttached() retained.
3. readPersistedPluginData returns null instead of throwing, so expect.poll can retry. Inner parse-retry kept: settings-persistence.e2e.ts reads it once without a poll.
4. stdio ["ignore","ignore","pipe"]; stderr listener detached with resume(); launch-failure path awaits killAndWaitForExit.

Suite 37/37 green, lint + build clean, tree clean. Follow-ups: nid_lgos6hbf2hvl2sp5jns0xgg5u_e (preventDefault/stopPropagation measurably UNCOVERED — flagged, not deleted), nid_1oipd3ymnbsdlbql01h7hue4p_e, nid_js55rt1e78e55nuj83xh2lg3h_e, nid_jbtcd5ty1u4urr7p01n4ngnuw_e, plus the deferred symmetric-cleanup chore.
