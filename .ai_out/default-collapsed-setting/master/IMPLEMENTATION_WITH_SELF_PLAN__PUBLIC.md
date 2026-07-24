# IMPLEMENTATION_WITH_SELF_PLAN — PUBLIC

Feature: **"Start embedded notes collapsed"** setting (default OFF), both render modes.

- **Iteration 1** shipped the feature in commit `3f21c9d`.
- **Iteration 2 (this document)** acts on `IMPLEMENTATION_REVIEW__PUBLIC.md` (verdict
  NOT-READY: 1 interaction bug, 1 test-honesty gap). Both blockers are **fixed**, not
  rejected. Nothing was rejected outright; two NICE-TO-HAVEs were declined with rationale.

Status: **DONE** — lint 0 errors, build clean, **full e2e suite 34/34 green** (was 31; 3 new
tests). Every new/changed test was mutation-proven to be able to fail.

---

## Review disposition — item by item

| # | Item | Disposition |
|---|---|---|
| **BLOCKING-1** | LP first title click dead after a mid-session setting flip | **ADDRESSED** — `src/embedFoldDom.ts:58-71` (new `isFolded`), `src/livePreview/livePreviewFoldExtension.ts:85-100`, `src/foldableEmbedsPostProcessor.ts:72-77`, comments rewritten at `src/livePreview/foldStateField.ts:72-80` and `livePreviewFoldExtension.ts:91-97`. New e2e `e2e/start-collapsed-setting.e2e.ts:209-224`. |
| **BLOCKING-2** | "survives a restart" cannot fail on the property it names | **ADDRESSED** — new `ObsidianHarness.readPersistedPluginData()` (`e2e/obsidianHarness.ts:303-317`) + new test `e2e/start-collapsed-setting.e2e.ts:202-207`; restart test now asserts the on-disk precondition (`:226-237`); the misleading spec header rewritten (`:5-21`). Mutation-proven below. |
| **SF-1** | `load()` casts unvalidated JSON | **ADDRESSED** — `parseSettings()` in `src/settings/foldableEmbedsSettings.ts:25-40` (no cast, `typeof === "boolean"`, default projected from `DEFAULT_SETTINGS`, never re-typed); used at `src/settings/foldableEmbedsSettingsStore.ts:26-28`. |
| **SF-2** | marker-strip test vacuous when there is no sibling | **ADDRESSED** — `e2e/start-collapsed-setting.e2e.ts:144-157`: the sibling's existence is now asserted separately (`?? null` + `not.toBeNull()`), so `""` can no longer stand in for "nothing to check". |
| **NTH-1** | corrupt `data.json` kills the whole plugin | **ADDRESSED** — `src/settings/foldableEmbedsSettingsStore.ts:31-42`. Placed in the STORE, not `main.ts`, so `main.ts` stays lifecycle-only: the store owns persistence, therefore it owns persistence failure. |
| **NTH-2** | `onChange` has no failure path | **ADDRESSED** — `src/settings/foldableEmbedsSettingTab.ts:36-49`: `catch` + `Notice` naming the ACTUAL consequence ("will be lost when Obsidian restarts"), since the in-memory value does take effect. |
| **NTH-3** | truth-table row 4 never asserted | **ADDRESSED** — `e2e/start-collapsed-setting.e2e.ts:139-142`. Not merely tidiness as it turned out: it is the only test that catches an XOR truth table (proof below). |
| **NTH-4** | harness uses undocumented internals via `any` | **ADDRESSED** — note added at `e2e/obsidianHarness.ts:325-326`. |
| **NTH-5** | settings `desc` is two sentences | **DECLINED (reviewer agreed)** — the second sentence carries the "takes effect on next render" POLS warning. Kept verbatim. |
| — | README limitation about an absorbed first click | **NOT NEEDED** — that text was only required *if* BLOCKING-1 were accepted. It was fixed, so README stays as written (it already, and still correctly, says open panes are not re-folded on the spot). |

### Declined, with rationale

- **NTH-5** (one-sentence `desc`) — see above; the reviewer's own note says keep.
- **A unit test for `parseSettings`** — there is still no unit-test runner in this repo
  (pre-existing open ticket). Adding one for a 4-line pure function would be scope creep;
  coverage stays e2e, exactly as iteration 1 recorded.
- No `#QUESTION_FOR_HUMAN` was needed: the coherent fix for BLOCKING-1 required **none** of
  the excluded machinery (no `Compartment`, no forced re-render of open panes).

---

## BLOCKING-1 — the ROOT fix

The bug was not "the click handler reads the wrong function"; it was **which of two
legitimately different things the inversion operates on**:

- `effectiveFold(state, line, settings)` answers *"what should be RENDERED"*.
- the `fen-folded` class answers *"what the user is LOOKING AT"*.

They are the same value only until the default term changes underneath an
already-rendered pane — precisely what the binding decision "next render is enough"
permits for the `startCollapsed` setting. The user clicks on **pixels**, so the pixels are
the correct operand.

`src/livePreview/livePreviewFoldExtension.ts:98` now dispatches `!EmbedFoldDom.isFolded(embed)`.
State remains the single source of truth for *rendering* — `sync()` still projects
`effectiveFold` (`:81`) and the dispatch immediately makes state agree with the screen.

Two consequences worth noting:

1. **The modes converged rather than diverged.** Reading mode was already inverting its DOM
   class (`foldableEmbedsPostProcessor.ts:73`) — which is why the reviewer found it
   unaffected. Both call sites now go through the one named `EmbedFoldDom.isFolded`, which
   is where the WHY is documented once, in the module that owns the shared DOM contract.
2. **Both misleading comments were rewritten**, as the review required:
   `livePreviewFoldExtension.ts:91-97` (was "Invert the STATE, never the DOM class") and
   `foldStateField.ts:72-80` (`effectiveFold` no longer claims to be the click handler's
   operand).

---

## Falsifiability evidence (every test touched or added)

Each mutation was applied to `src/`, the spec re-run, then the source restored from a
byte-identical copy and re-verified green.

| Test | Mutation applied | Result | Log |
|---|---|---|---|
| **NEW** `:209` "a title click is never dead after the setting is flipped under an open pane" | `toggle()` reverted to `!effectiveFold(...)` (the reviewed code) | **RED — only this test failed**, 9 passed. `toHaveClass` timed out on `"…is-loaded fen-embed"` (unfolded), i.e. the click was a no-op | `.tmp/it2-e2e-falsify-b1.log` |
| **NEW** `:202` "the settings tab writes the new value through to data.json" | `saveData(...)` removed from `foldableEmbedsSettingsStore.ts` (the reviewer's exact mutant, which previously left 8/8 GREEN) | **RED**, 8 passed. `Expected - "startCollapsed": false` / timeout on the predicate | `.tmp/it2-e2e-falsify-b2.log` |
| **NEW** `:139` "a `![[child]]-` is folded too" | `foldedByDefault` → `startCollapsed !== hasFoldMarker` (XOR) | **RED**. Note test `:131` still PASSED under this mutant, so the new test covers a row nothing else did | `.tmp/it2-e2e-falsify-row4.log` |
| **CHANGED** `:144` "the marker dash is still stripped" | `sibling.textContent = afterMarker` removed | **RED**: `Expected pattern: not /^-/ Received string: "-"` — still falsifiable after being hardened against the vacuous case | `.tmp/it2-e2e-falsify-strip.log` |
| **CHANGED** `:226` "the setting survives an Obsidian restart" | (unchanged property; it proves the READ path) | Its write-path claim was moved to `:202`, which is where the mutant now dies. Header rewritten to state the two properties separately | — |
| Tests `:131`, `:159`, `:173`, `:180`, `:190`, `:197` | untouched behaviour; only `toHaveClass(FOLDED_RE)` → the `expectFolded()` helper | Iteration 1's falsification (neutered `foldedByDefault`) still stands; re-verified green | `.tmp/it2-e2e-full.log` |

Restoration was verified each time with `git diff --stat` before the final full run.

---

## Gates — commands run and REAL output

| Command | Result |
|---|---|
| `npm run lint` | exit 0 — **0 errors, 1 warning** (`.tmp/it2-lint.log`) |
| `npm run build` | exit 0 (`tsc -noEmit` + esbuild production) (`.tmp/it2-build.log`) |
| `npm run test:e2e` (FULL suite) | exit 0 — **34 passed** (`.tmp/it2-e2e-full.log`) |
| `npm run test:e2e -- start-collapsed-setting.e2e.ts` | exit 0 — **11 passed** (`.tmp/it2-e2e-spec.log`) |

Suite breakdown: 23 pre-existing tests (`foldable-embeds`, `hello-world`,
`live-preview-foldable-embeds`) — **unchanged and still green**; 11 in
`start-collapsed-setting.e2e.ts` (8 → 11).

The single lint warning is unchanged and still correctly deferred:
`obsidianmd/settings-tab/prefer-setting-definitions` needs Obsidian ≥ 1.13.0 while
`manifest.json` declares `minAppVersion: 1.0.0`. Ticket
`_tickets/adopt-obsidians-declarative-settings-api-getsettingdefinitions.md`.

---

## Files changed in iteration 2

| File | Change |
|---|---|
| `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes-mirror-1/src/embedFoldDom.ts` | new `isFolded()` — "what the user is looking at", with the WHY that makes it the click operand |
| `.../src/livePreview/livePreviewFoldExtension.ts` | `toggle()` inverts the projection; comment rewritten |
| `.../src/livePreview/foldStateField.ts` | `effectiveFold` doc corrected (render-only) |
| `.../src/foldableEmbedsPostProcessor.ts` | uses the shared `EmbedFoldDom.isFolded` |
| `.../src/settings/foldableEmbedsSettings.ts` | new `parseSettings()` (SF-1) |
| `.../src/settings/foldableEmbedsSettingsStore.ts` | parses instead of casting; tolerates a read failure (NTH-1) |
| `.../src/settings/foldableEmbedsSettingTab.ts` | save-failure `Notice` (NTH-2) |
| `.../e2e/obsidianHarness.ts` | `readPersistedPluginData()`; undocumented-internals note |
| `.../e2e/start-collapsed-setting.e2e.ts` | 3 new tests, honest header, hardened strip assertion, `expectFolded`/`isFoldedNow`/`expectPersistedStartCollapsed` helpers |
| `.../CLAUDE.md` | `embedFoldDom` architecture line now names `isFolded` and the invariant it protects |

`README.md` needed no change — see the disposition table.

## Questions for human
None.
