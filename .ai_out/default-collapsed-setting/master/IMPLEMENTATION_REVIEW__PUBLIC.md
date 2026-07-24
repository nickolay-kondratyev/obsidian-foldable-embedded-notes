# IMPLEMENTATION_REVIEW__PUBLIC — "start embedded notes collapsed" setting

Reviewed commit: `3f21c9d` ("Add \"start embedded notes collapsed\" setting (both render modes)")
against `5efa23b`. Binding truth: `CLARIFICATION__PUBLIC.md`.

> **CURRENT VERDICT: READY** (iteration 1, `8d1caf9`). Everything below down to the
> `ITERATION 1 VERIFICATION` heading is the **iteration-0 review, kept as the record**.
> Jump to [ITERATION 1 VERIFICATION](#iteration-1-verification--commit-8d1caf9-vs-3f21c9d) for what is true now.

## VERDICT (iteration 0, `3f21c9d`): **NOT-READY** — 1 BLOCKING interaction bug, 1 BLOCKING test-honesty gap. Everything else is small.

The design is genuinely good: one shared `foldedByDefault()` truth table for both modes, one
source of truth for defaults, no scope creep, docs updated honestly. The two blockers are a
user-visible dead click in Live Preview and a test whose NAME claims a property it cannot fail on.

---

## Gates I re-ran myself (REAL results)

| Command | Real result | Matches implementer's claim? |
|---|---|---|
| `npm run lint` | exit 0 — **0 errors, 1 warning** (`obsidianmd/settings-tab/prefer-setting-definitions`, `.tmp/rev-lint.log`) | YES |
| `npm run build` | exit 0 (`tsc -noEmit` + esbuild, `.tmp/rev-build.log`) | YES |
| `npm run test:e2e` (full) | exit 0 — **31 passed** (`.tmp/rev-e2e-full.log`) | YES |
| `npm run test:e2e -- start-collapsed-setting.e2e.ts` | exit 0 — 8 passed (`.tmp/rev-e2e-restored.log`) | YES |

The lint warning is correctly deferred: the declarative settings API needs Obsidian ≥ 1.13.0 and
`manifest.json` declares `minAppVersion: 1.0.0`, so staying imperative is what the `obsidian-settings`
skill prescribes. Ticket `_tickets/adopt-obsidians-declarative-settings-api-getsettingdefinitions.md`
is the right disposal. **No dishonesty found in the reported numbers** — all three gates reproduce exactly.

I also ran two of my own experiments (both reverted; `git status` is clean):
1. **Mutation test of persistence** — see BLOCKING-2.
2. **Live-Preview stale-setting probe** — see BLOCKING-1.

---

## 🚨 BLOCKING

### BLOCKING-1 — Live Preview: the first title click is DEAD after the setting is flipped in an open pane

`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes-mirror-1/src/livePreview/livePreviewFoldExtension.ts:85-95` (`toggle()`)

`toggle()` inverts the *recomputed effective* state, while the DOM still shows the *previously
projected* state. The clarification's "next render is enough" licenses the embed not re-folding —
it does **not** license the click becoming inert.

**Verified empirically** (throwaway Playwright probe against real Obsidian, since deleted):
seed default (setting OFF) → open note in Live Preview (embed expanded) → flip the toggle ON in
the real settings dialog → close settings → click the embed title.

```
PROBE_RESULT afterToggle=[false] afterFirstClick=[false] afterSecondClick=[true]
```

The first click produces **no visible change**; only the second one folds. Walk-through:
`effectiveFold` = `undefined ?? (startCollapsed=true || marker=false)` = `true`, so
`folded = !true = false` → dispatches "unfold" on an already-unfolded embed.

This is the *exact* failure mode the code already defends against for markers —
`src/livePreview/foldStateField.ts:75-80` says "the click would look dead" — reintroduced by the
new setting through a path that comment no longer covers. And the flow that hits it is the most
likely one in the world: turn the new setting on, close settings, click the embed you were looking at.

Reading mode is unaffected: `foldableEmbedsPostProcessor.ts:73` inverts the DOM class, so it is
always consistent with what the user sees.

**Suggested fix** (stays inside the non-goals — no `Compartment`, no forced re-render):
invert what is actually PROJECTED, then let state remain authoritative:

```ts
// livePreviewFoldExtension.ts, toggle()
const shownAsFolded = embed.classList.contains(EmbedFoldDom.CLS_FOLDED);
this.view.dispatch({ effects: setLineFold.of({ lineFrom, folded: !shownAsFolded }) });
```

A click then always does what the user just saw it should do, and the very next `sync()` still
renders from state. This makes the WHY comment at `livePreviewFoldExtension.ts:91-92`
("Invert the STATE, never the DOM class") wrong as written — it must be updated to say the click
inverts the PROJECTION precisely because the projection can lag a settings change.
Add an e2e case for it (the probe above is 20 lines).

`#QUESTION_FOR_HUMAN:` if you would rather accept this as a known limitation of "next render is
enough", say so — but then it must be written into README's limitations, not left silent, and
ticketed. Shipping a click that silently does nothing is the one outcome I would not ship.

### BLOCKING-2 — "the setting survives an Obsidian restart" cannot fail on the property it names

`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes-mirror-1/e2e/start-collapsed-setting.e2e.ts:162-172`, and the spec header at `:5-16` which claims this is
"the only way to prove the tab writes through to `data.json`".

The seeded fixture is `{"startCollapsed": true}` (`:27`). The test toggles OFF, then back **ON**,
then relaunches and asserts *folded* — i.e. the asserted end state is **identical to the seeded
file**. `relaunch()` deliberately does not re-seed the vault (`e2e/obsidianHarness.ts:112-126`),
which is right, but a plugin that never writes at all leaves the seeded `true` on disk and the
assertion still passes.

**Verified by mutation**: I removed the write in
`src/settings/foldableEmbedsSettingsStore.ts:39` (`await this.persistence.saveData(this.current)`
→ no-op) and re-ran the spec: **8/8 still passed**, including the restart test
(`.tmp/rev-e2e-mutant.log`). Source restored, `git diff` empty, re-run green
(`.tmp/rev-e2e-restored.log`). So **no test in this repo covers the settings write path**, despite
the header comment asserting that it does. That header is the honesty problem, more than the gap.

(For the record, the write path *does* work in reality: the post-run
`.tmp/e2e/vault/.obsidian/plugins/foldable-embedded-notes/data.json` is 2-space pretty-printed,
i.e. rewritten by Obsidian's `saveData`, not the harness's compact `JSON.stringify` fixture.
Unproven by tests ≠ broken — but it is unguarded against regression.)

**Suggested fix** — either (both are cheap, the first is stronger):
1. Assert the file directly after toggling: read
   `<VAULT_COPY_DIR>/.obsidian/plugins/<PLUGIN_ID>/data.json` from Node in the spec and expect
   `{ startCollapsed: false }` right after `setStartCollapsedInSettings(false)`. This kills the
   mutant instantly and names the property honestly.
2. Or make the restart test land on the value **opposite** the seed: leave the setting OFF (tests
   6/7 already do), relaunch, assert the embed renders **expanded** — with a broken write, disk
   still says `true` and the embed folds → red.

---

## ⚠️ SHOULD-FIX

### SF-1 — `load()` casts unvalidated JSON to the settings type (the type is a lie)

`src/settings/foldableEmbedsSettingsStore.ts:27-28`

```ts
const persisted = (await this.persistence.loadData()) as Partial<FoldableEmbedsSettings> | null;
this.current = { ...DEFAULT_SETTINGS, ...persisted };
```

`data.json` is user-editable and version-drifting; the cast asserts a shape nobody checked.
Concrete failure: a hand-edited or older-format `{"startCollapsed": "false"}` makes
`startCollapsed` the truthy string `"false"` — every embed folds while the toggle renders as
**off** (`toggle.setValue("false")` is truthy in the tab but `startCollapsed` is not a boolean, so
UI and behaviour agree only by accident), and the corrupt value is then re-saved by
`setStartCollapsed`'s spread. One line fixes it and removes the cast:

```ts
const persisted = await this.persistence.loadData();
const raw = (persisted ?? {}) as Record<string, unknown>;
this.current = { startCollapsed: raw["startCollapsed"] === true };
```

(If preserving unknown forward-compat keys was the intent, keep the spread but coerce
`startCollapsed` explicitly — and say so in a WHY comment, because it is not obvious today.)

### SF-2 — the marker-stripping test passes vacuously when there is no sibling

`e2e/start-collapsed-setting.e2e.ts:112-117`

`node.nextSibling?.textContent ?? ""` returns `""` both when the dash was stripped **and** when the
embed has no next sibling at all, and `expect("").not.toMatch(/^-/)` is green either way. It is
falsifiable in today's DOM shape (unstripped → `"-"`), but it degrades to always-green the moment
Obsidian changes how it wraps the paragraph. Assert the sibling exists first, or assert the
paragraph's `textContent` has no `-`.

---

## 💡 NICE-TO-HAVE

- **A corrupt `data.json` disables the whole plugin, not just settings.**
  `src/main.ts:22` awaits `settings.load()` before *anything* is registered (the ordering WHY is
  correct). But if `loadData()` ever rejects, `onload` rejects and neither the post-processor nor
  the editor extension is registered — folding disappears entirely instead of degrading to
  defaults. A `try/catch` around `load()` that keeps `DEFAULT_SETTINGS` and `console.error`s makes
  the failure proportional.
- **`onChange` has no failure path.** `src/settings/foldableEmbedsSettingTab.ts:29-31`: if
  `saveData` rejects (read-only vault, disk full), the in-memory value has already changed, so the
  session behaves as saved and silently reverts on restart, with only an unhandled rejection in the
  console. A `catch` + `new Notice(...)` would make it honest.
- **Truth-table row 4 (`ON` + `![[a]]-` → collapsed) is never asserted** — only that the dash is
  stripped. It is trivially implied by `startCollapsed || hasFoldMarker`, so this is coverage
  tidiness, not a hole. One extra `expect(readingEmbeds().nth(EMBED_MARKED)).toHaveClass(FOLDED_RE)`.
- **`e2e/obsidianHarness.ts:307-318` uses undocumented internals** (`app.setting.openTabById`) via
  `any`. Fine and unavoidable for e2e (it is the only way to drive the real dialog), but worth a
  one-line note that a future Obsidian may break the harness, not the plugin.
- **Settings `desc` is two sentences** where the skill asks for one. Justified here — the second
  sentence carries the "takes effect on next render" POLS warning, which users need. Keep.

---

## Confirmed clean (checked, no action)

- **Truth table**, both modes: reading `foldableEmbedsPostProcessor.ts:63` and Live Preview
  `foldStateField.ts:83` both compute `explicit ?? foldedByDefault(settings, marker)`. All four rows
  correct; explicit choice still wins (e2e 26 proves it survives a re-render).
- **`![[x]]-` meaning unchanged**: `stripFoldMarker` and `markerDashDecoration` are untouched by the
  setting; the marker is folded into the default via `||`, never reinterpreted. No `+` marker.
- **Default OFF = today's behaviour**: `prepareVaultCopy` deletes `data.json`, so the two
  pre-existing specs run with no settings file at all and pass **unmodified** (e2e 12–23). No
  pre-existing behaviour test was removed, renamed or weakened — the diff only *adds* to
  `obsidianHarness.ts` (2 methods, no edits to existing ones).
- **Scope discipline**: no CM6 `Compartment`, no live re-application, no `+` marker, no per-note
  overrides, no unit-test runner. Non-goals respected.
- **CLAUDE.md standards**: `main.ts` is still lifecycle-only; no `any` anywhere in `src/`; defaults
  written once (`DEFAULT_SETTINGS`); `foldedByDefault` is the single home of duplicated *knowledge*
  across the two deliberately independent pipelines (correct DRY call — the modes stay separate);
  `SettingsPersistence` port is proper DIP; class-based, no free-floating functions beyond the two
  pure module functions that already match the file's style.
- **Settings UX** vs the `obsidian-settings` skill: single row, so no altitude/grouping/disclosure
  concerns; sentence case; no top-level heading (correct — headings only with ≥2 sections); no bare
  "Restore defaults"; save-on-change; one control per row; no hardcoded colors; defaults projected
  from the single spec, never re-typed in the UI. Imperative tab is the right call at
  `minAppVersion 1.0.0`. **Compliant.**
- **Unload cleanliness**: settings tab is owned by `addSettingTab`; the editor extension's teardown
  path is unchanged and still covered by e2e 21 ("disabling the plugin strips its injected DOM").

## Documentation Updates Needed

- `CLAUDE.md` and `README.md` updates in this commit are **accurate** — no changes needed, with one
  exception: if BLOCKING-1 is accepted rather than fixed, README's Settings section must state that
  the first click on an already-open pane after toggling may be absorbed.
- If BLOCKING-1 is fixed as suggested, the WHY comment at
  `src/livePreview/livePreviewFoldExtension.ts:91-92` ("Invert the STATE, never the DOM class") must
  be rewritten, or it will actively mislead the next maintainer.

---
---

# ITERATION 1 VERIFICATION — commit `8d1caf9` vs `3f21c9d`

Re-reviewed by a **fresh instance** of this role. I did not take any claim on trust: every
blocker was re-broken by hand and observed going red, then restored and observed going green.

## VERDICT: **READY**

Both blockers are fixed **at the root**, both fixes are now guarded by tests I personally proved
falsifiable, no non-goal was violated, and all three gates reproduce the implementer's numbers
exactly.

---

## BLOCKING-1 — Live Preview dead first click → **VERIFIED-FIXED**

Root fix: `src/livePreview/livePreviewFoldExtension.ts:98` now inverts the **projection**
(`!EmbedFoldDom.isFolded(embed)`) instead of the recomputed `effectiveFold`. This is the fix I
suggested, and it was taken one level better than suggested: the predicate was lifted into the
shared DOM contract as `EmbedFoldDom.isFolded` (`src/embedFoldDom.ts:58-69`), and reading mode
(`src/foldableEmbedsPostProcessor.ts:73`) — which already inverted its own class inline — now goes
through the same named operand. One WHY, one place, both modes.

**What I observed (mutation, not a claim).** I reverted `toggle()` to the exact iteration-0 code
(`const folded = !effectiveFold(this.view.state, lineFrom, this.readSettings())`) and re-ran the
spec:

```
✓  9 › the settings tab writes the new value through to data.json (1ms)
✘ 10 › live preview: a title click is never dead after the setting is flipped under an open pane (15.1s)

    Expected pattern: /\bfen-folded\b/
    Received string:  "internal-embed markdown-embed inline-embed is-loaded fen-embed"
  1 failed
  9 passed
```
(`.tmp/rev2-e2e-mutant-b1.log`, exit 1.) That "Received" line **is** my original probe's
`afterFirstClick=[false]` — the click on the reviewed code is a no-op, and it is now caught.
Source restored (`git checkout --`), full suite re-run: **34 passed** (`.tmp/rev2-e2e-restored.log`).

I also checked the fix cannot introduce the opposite desync: in `sync()`
(`livePreviewFoldExtension.ts:65-83`) the click listener is wired **before**
`applyFoldState` in the same synchronous iteration, so no click can ever read an
element the plugin has not yet projected onto; and the dispatch immediately triggers
`update()` → `sync()`, which re-projects from state. State remains authoritative for rendering.

The two misleading comments were rewritten as required (`foldStateField.ts:73-79`,
`livePreviewFoldExtension.ts:91-97`) and `CLAUDE.md` now names `isFolded` and the invariant.
Nothing left claiming "invert the STATE, never the DOM class".

## BLOCKING-2 — persistence test not falsifiable → **VERIFIED-FIXED**

The overclaiming header is gone; the two properties are now asserted separately (spec header
`:5-21`): a new test `:202` reads `data.json` **from Node** and asserts the value just chosen
(`false` — the *opposite* of the seeded `true`, which is what makes it falsifiable), and `:226`
keeps only the read-back-after-restart property.

**What I observed.** I applied my own original mutant — deleted
`await this.persistence.saveData(this.current)` from
`src/settings/foldableEmbedsSettingsStore.ts` — the same mutant that previously left **8/8 green**:

```
✘  9 › the settings tab writes the new value through to data.json (14.9s)
  1 failed
  8 passed
```
(`.tmp/rev2-e2e-mutant-b2.log`, exit 1.) The write path is now genuinely guarded. Source restored,
suite green.

`ObsidianHarness.readPersistedPluginData()` (`e2e/obsidianHarness.ts:303-317`) reads the file from
Node rather than asking the running plugin — the right call, and documented as such: asking
`loadData()` could have been answered from memory and would have re-created the same blind spot.

---

## Gates — re-run by me, REAL output

| Command | Real result | Matches claim? |
|---|---|---|
| `npm run lint` | exit 0 — **0 errors, 1 warning** (`prefer-setting-definitions`, unchanged & ticketed) — `.tmp/rev2-lint.log` | YES |
| `npm run build` | exit 0 (`tsc -noEmit -skipLibCheck` + esbuild production) — `.tmp/rev2-build.log` | YES |
| `npm run test:e2e` (full) | exit 0 — **34 passed** (4.9 s) — `.tmp/rev2-e2e-full.log` | YES |

23 pre-existing tests + 11 in `start-collapsed-setting.e2e.ts`. `git diff 3f21c9d 8d1caf9` touches
neither `foldable-embeds.e2e.ts` nor `live-preview-foldable-embeds.e2e.ts` — **no behaviour test was
removed, renamed, skipped or weakened**, and `package.json` is untouched (no new runner sneaked in).
My working tree is clean; both mutations were reverted and verified with `git status --porcelain`.

## Non-goals — re-checked against the diff

| Non-goal | Status |
|---|---|
| No `+` marker / no marker-syntax change | Respected — `stripFoldMarker` / `markerDashDecoration` untouched; row 4 now explicitly asserted (`:139`) |
| No CM6 `Compartment` | Respected — the only occurrence in `src/` is the doc line saying it is deliberately NOT used |
| No forced rerender of open panes | Respected — the fix changes only what a **user click** inverts; nothing re-folds by itself. Test `:209` deliberately asserts *"the displayed state inverted"*, not a fixed end state, so it cannot start smuggling in live re-application |
| No per-note overrides / no fold-state persistence | Respected |
| No unit-test runner | Respected |

## Accepted SHOULD-FIX / NICE-TO-HAVE — scope check

All five landed small and in the right place; no scope creep found.

- **SF-1** `parseSettings` (`src/settings/foldableEmbedsSettings.ts:34-40`) — no cast, explicit
  `typeof === "boolean"`, default projected from `DEFAULT_SETTINGS` rather than re-typed. Safe on
  every non-object input (`null`, string, number, array all fall back). Note it now **drops unknown
  keys** where the old spread preserved them; with a single setting that is harmless and arguably
  more honest, but it is a real behaviour change worth remembering if a downgrade path ever matters.
- **NTH-1** read-failure tolerance placed in the **store**, not `main.ts` — correct call: the store
  owns persistence, so it owns persistence failure, and `main.ts` stays lifecycle-only.
- **NTH-2** `saveStartCollapsed` catch + `Notice` naming the actual consequence
  ("will be lost when Obsidian restarts") — accurate, since the in-memory value *does* take effect.
  Also removes the unhandled rejection from the un-awaited `onChange`.
- **NTH-3 / SF-2** the truth-table row-4 test and the hardened strip assertion are both real
  additions, not padding — the implementer's XOR mutant shows row 4 was covered by nothing else.
- **NTH-4** one comment. Nothing more.

**The declined item is technically sound.** Declining a unit test for `parseSettings` on the grounds
that the repo has no unit-test runner (pre-existing ticket) is correct 80/20: standing up a runner
for a 4-line pure function is exactly the scope creep this review would otherwise flag. NTH-5
(two-sentence `desc`) was declined with my own agreement.

## Residual, explicitly NON-blocking (do not hold the change for these)

1. `parseSettings`' defensive branch (a non-boolean `startCollapsed` in `data.json`) is the one new
   line no test exercises. Cheap follow-up if ever wanted: the harness already seeds `data.json`, so
   seeding `{"startCollapsed": "false"}` and asserting embeds render **expanded** would cover it.
2. Test `:209` reads `foldedBeforeClick` at runtime and asserts inversion, which keeps it honest but
   also means it would silently go vacuous if a future Obsidian happened to re-sync the pane between
   the flip and the click. It is falsifiable **today** — I proved it above — which is what matters.

Neither is a correctness, honesty or requirement problem.

## Documentation — no further updates needed

`CLAUDE.md`'s `embedFoldDom` entry now names `isFolded` and the invariant it protects; `README.md`
lines 16-19 already state the "next render" timing correctly and needed no change, because
BLOCKING-1 was fixed rather than accepted (the limitation text was conditional on accepting it).

**FINAL VERDICT: READY.**
