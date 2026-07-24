# EXPLORATION_PUBLIC — default-collapsed setting

Detail lives in siblings — read them, do not duplicate:
- `EXPLORATION_CODE.md` — how initial fold state is decided today, per mode, with file:line.
- `EXPLORATION_TEST.md` — e2e harness, seeding settings via `extraFixtures` data.json, commands, conventions.

## The one thing that matters
Both modes already share the SAME decision shape — `explicitChoice ?? markerDefault`:
- reading mode: `foldableEmbedsPostProcessor.ts:58` `this.store.get(key) ?? foldedByDefault`
- live preview: `foldStateField.ts:79-81` `explicitFoldAt(...) ?? isMarkedLine(...)`

A "start collapsed" setting is a change to the **second** term only (the default when the user has made no
explicit choice for that embed). No change to `embedFoldDom.ts` / `styles.css` is implied.

## Constraints carried into planning
1. **No settings infrastructure exists** (no `loadData`/`saveData`/`PluginSettingTab` anywhere). This feature
   introduces the first one; keep `main.ts` lifecycle-only per CLAUDE.md.
2. **Live preview has no `Compartment`** — `livePreviewFoldExtension()` returns a static Extension array and
   takes no args. Making a setting change apply to already-open editors needs a deliberate mechanism
   (a facet/StateField the ViewPlugin reads, or a re-sync dispatch), not just `workspace.updateOptions()`.
3. **Reading mode recomputes only on re-render**; there is no on-demand rerender call in `src/` today.
4. **No unit-test runner exists** → coverage convention is e2e (`npm run test:e2e`, real Obsidian). Settings
   values are seedable via `harness.launch({ extraFixtures: { ".obsidian/plugins/<id>/data.json": ... } })`,
   and `harness.relaunch()` proves persistence.
5. Verification gate: `npm run lint` + `npm run build` (build = typecheck). e2e is not in CI.
