# CLARIFICATION__PUBLIC — default-collapsed setting

Human-approved requirements. These are BINDING; deviations need explicit human approval.

## Requirement
A plugin setting controlling whether embedded notes `![[note]]` start collapsed or expanded.
**Default = expanded** (current behaviour, so a fresh install changes nothing).
Applies to BOTH render modes (reading mode + Live Preview).

## Human decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Meaning of `![[note]]-` when the setting is ON | `-` **keeps its literal meaning** ("this embed starts folded"). When the setting is ON it is simply a no-op. **NO new `+` marker.** No marker-syntax change of any kind. |
| 2 | Apply timing when the setting is toggled | **Next render is enough.** Already-open notes need NOT update instantly. NO CM6 `Compartment`, NO forced rerender of open leaves. The new default applies on reopen / mode switch / edit. |
| 3 | Control type | Obsidian's standard **toggle switch** (`addToggle`) in a `PluginSettingTab`. |

## Truth table (both modes)

| setting | markup | initial state |
|---------|--------|---------------|
| OFF (default) | `![[a]]`  | expanded |
| OFF (default) | `![[a]]-` | collapsed |
| ON            | `![[a]]`  | collapsed |
| ON            | `![[a]]-` | collapsed (marker is a no-op) |

An explicit user fold/unfold for a given embed **always wins** over both the marker and the setting —
unchanged from today (`explicitChoice ?? default`).

## Explicit non-goals (do NOT build)
- No `+` marker, no marker syntax changes.
- No live re-application to already-open panes.
- No per-note / per-folder overrides.
- No persistence of individual fold states (session-only store stays session-only).
