# IMPLEMENTATION_REVIEW__PUBLIC — "start embedded notes collapsed" setting

Reviewed commit: `3f21c9d` ("Add \"start embedded notes collapsed\" setting (both render modes)")
against `5efa23b`. Binding truth: `CLARIFICATION__PUBLIC.md`.

## VERDICT: **NOT-READY** — 1 BLOCKING interaction bug, 1 BLOCKING test-honesty gap. Everything else is small.

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
