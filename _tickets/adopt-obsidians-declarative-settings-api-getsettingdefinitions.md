---
id: nid_te0hj5zcdpmho937ct3lif7oq_e
title: "Adopt Obsidian's declarative settings API (getSettingDefinitions)"
status: open
deps: []
links: []
created_iso: 2026-07-24T23:08:21Z
status_updated_iso: 2026-07-24T23:08:21Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

`npm run lint` reports one WARNING against `src/settings/foldableEmbedsSettingTab.ts`:

    obsidianmd/settings-tab/prefer-setting-definitions — "This PluginSettingTab does not
    implement getSettingDefinitions(); its settings will not appear in Obsidian's settings
    search for users on 1.13.0 or later."

Not done as part of the start-collapsed-setting feature: the declarative settings API
requires Obsidian >= 1.13.0, while `manifest.json` declares `minAppVersion: 1.0.0`.
Adopting it means either bumping `minAppVersion` (a user-facing compatibility decision
that needs human approval) or maintaining both code paths.

When picked up: implement `getSettingDefinitions()` on
`src/settings/foldableEmbedsSettingTab.ts` (keeping `DEFAULT_SETTINGS` in
`src/settings/foldableEmbedsSettings.ts` as the single source of truth for defaults), do
NO I/O inside it, and bump `minAppVersion` + `versions.json` accordingly.

## Acceptance Criteria

`npm run lint` is warning-free; the "Start embedded notes collapsed" toggle is findable via Obsidian's global settings search; e2e/start-collapsed-setting.e2e.ts still passes.

