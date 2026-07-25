# IMPLEMENTATION_REVIEWER__PRIVATE — rehydration memory

Review of `503f05b` (branch `settings-persistence-fix`) vs `b2777a6`. Verdict: **APPROVED**,
0 BLOCKING / 2 SHOULD-FIX (both ticket edits) / 3 NICE-TO-HAVE. Public review:
`IMPLEMENTATION_REVIEW__PUBLIC.md` in this dir. I did NOT commit and did NOT edit any source.

## What I actually verified (so it is not redone)

- Gates run by me, all green: `npm run lint` (exit 0, 1 pre-existing
  `prefer-setting-definitions` warning), `npm run build` (exit 0), `npm run test:e2e`
  (exit 0, **37 passed**, 6.6 s). Outputs in `.tmp/rev-lint.txt`, `.tmp/rev-build.txt`,
  `.tmp/rev-e2e.txt`.
- `scripts/run-e2e.sh:29` runs `npx tsc -p e2e/tsconfig.json` — so `e2e/` IS type-checked as
  part of `test:e2e` (root `tsconfig.json` only includes `src/**`). My initial worry that the
  sync→async harness signature change was untyped is DISSOLVED.
- Only caller of `setStartCollapsed` is `foldableEmbedsSettingTab.ts:43`, inside try/catch →
  no unhandled-rejection path.
- Only callers of `readPersistedPluginData` are `start-collapsed-setting.e2e.ts:108` (inside
  `expect.poll`, needs no `await`) and the two in the new spec (one polled, one awaited).
  `start-collapsed-setting.e2e.ts` was NOT modified despite the plan doc claiming it was.
- `src/settings/foldableEmbedsSettings.ts` untouched → `parseSettings` still strict.
- Diff is purely additive; no tests/anchor points removed.
- Promise-queue reasoning: `written` = caller's promise (rejects), `this.saving` =
  `written.catch(()=>undefined)` = never-rejected tail. Callback reads `this.current` at WRITE
  time, `this.current` assigned synchronously at CALL time ⇒ last write = newest value. Doc
  comment matches. `__proto__` from `JSON.parse` spreads as an own data property (no
  prototype pollution) — checked, not worth flagging.
- `asKeyedObject` rejects `null` / arrays / non-objects before the spread. On failed or
  absent load `persisted = {}` ⇒ unknown keys dropped, which is the only safe choice.

## The two SHOULD-FIX items (both ticket edits, no code change)

1. Ticket `nid_lcehddb2tdcq6qxztmhvhpgga_e` ("Add a unit-test harness for pure fold logic") —
   I READ it: its three items are all `src/livePreview/`, nothing about the settings store.
   The implementer deferred the deterministic ordering test to this ticket in the plan doc
   only, so archiving the feature dir loses it. Ask: append a 4th item (fake
   `SettingsPersistence` with out-of-order `saveData` → last-write-wins, failed save does not
   skip the next, rejection still reaches the caller).
2. Ticket `nid_fp6hsv6aljxz1ifawlezcfdgu_e` ("Cover parseSettings' non-boolean data.json
   branch in e2e") — extend to also cover `asKeyedObject`'s array/string/null branches, which
   currently have zero coverage at any level.

## NICE-TO-HAVE (recorded, not asked for)

- `obsidianHarness.ts:319-321`: `existsSync` false returns `null` immediately inside the retry
  loop. Only matters if Obsidian ever switches to write-temp-then-rename.
- Unbounded write queue (51 clicks = 51 identical writes). Coalescing would complicate the
  per-caller failure reporting; deliberately NOT requested.
- Doc nits: plan doc `:43`/`:51` claim `start-collapsed-setting.e2e.ts` was updated (it was
  not); store `:23` "AS IT WAS FOUND" is imprecise for the non-object case.

## Honesty assessment of the implementer (my conclusion)

Honest. The unknown-key test is a real observed red→green. The overlapping-toggle test is
explicitly labelled a GUARD not a reproduction, in the spec comment, the commit message AND
the plan doc — the failure to reproduce the race is disclosed rather than papered over. The
guard is non-vacuous (51 clicks in one JS task, odd count so the end state inverts, plus a
1 s grace period re-read for a trailing stale write). No silent fallbacks, no weakened
assertions found.
