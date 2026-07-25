---
id: nid_rbh5zfj0mlvuo1hi2trl8fxli_e
title: "Settings persistence: concurrent toggles are unordered, and a save drops unknown data.json keys"
status: open
deps: []
links: []
created_iso: 2026-07-25T00:44:51Z
status_updated_iso: 2026-07-25T00:44:51Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

Two small persistence defects in `src/settings/foldableEmbedsSettingsStore.ts`:

1. `setStartCollapsed` (`:50-54`) is not serialized, and `src/settings/foldableEmbedsSettingTab.ts:26-32` fires it from `onChange` without ordering. Double-click the toggle (off -> on -> off): memory and the UI end at `false`, but two `saveData` writes to the same path are in flight with nothing ordering them, so `data.json` can keep `{"startCollapsed": true}`. Both writes succeed, so the failure `Notice` never fires — after a restart the toggle and the folding behaviour silently contradict the user's last choice.

2. `saveData(this.current)` (`:52-53`) writes only the PARSED shape (`src/settings/foldableEmbedsSettings.ts:34-40` keeps just `startCollapsed`), so any other key in `data.json` is destroyed. Scenario: a vault synced between a machine on a newer version (which added a second setting) and one still on 1.0.x — the first toggle on the old machine drops the other key permanently. Same for a key a user hand-added.

## Design

1. Serialize in the store: keep a `private saving: Promise<void>` and chain (`this.saving = this.saving.then(() => this.persistence.saveData(this.current))`), awaiting the chain so the settings tab's error handling still sees failures.
2. Retain the raw persisted object in the store and save `{ ...raw, startCollapsed }`, so unknown keys round-trip. Keep `parseSettings` as the strict READ path — this is about not destroying data on WRITE.

## Acceptance Criteria

- Rapidly toggling the setting several times leaves `data.json` agreeing with the final UI state.
- A hand-added extra key in `data.json` survives a toggle.
- lint, build and full e2e green.

