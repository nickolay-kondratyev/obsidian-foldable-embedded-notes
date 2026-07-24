/**
 * The plugin's persisted settings — the shape stored in
 * `.obsidian/plugins/<id>/data.json`, so every field must be plain JSON.
 */
export interface FoldableEmbedsSettings {
	/**
	 * Whether note embeds start FOLDED when the user has made no explicit choice for
	 * them. `false` (embeds start expanded) is the historical behaviour.
	 */
	readonly startCollapsed: boolean;
}

/** The ONE source of truth for defaults — never re-type a default in the UI layer. */
export const DEFAULT_SETTINGS: FoldableEmbedsSettings = { startCollapsed: false };

/**
 * Read-time access to the CURRENT settings.
 *
 * WHY an accessor rather than a settings value: both render modes are wired once, at
 * load, but must fold according to whatever the setting says WHEN they render — a
 * captured value would freeze the setting as it was at plugin load.
 */
export type ReadSettings = () => FoldableEmbedsSettings;

/**
 * The settings described by whatever was found in `data.json`.
 *
 * WHY a parse and not a cast: that file is plain JSON a user can hand-edit and an older
 * plugin version may have written, so its shape is an assumption, not a fact. A cast would
 * let `{"startCollapsed": "false"}` through as the TRUTHY string `"false"` — every embed
 * folded while the toggle renders as off. Anything that is not a boolean is not an opinion,
 * so it falls back to the default.
 */
export function parseSettings(persisted: unknown): FoldableEmbedsSettings {
	const raw = (persisted ?? {}) as Record<string, unknown>;
	const startCollapsed = raw["startCollapsed"];
	return {
		startCollapsed: typeof startCollapsed === "boolean" ? startCollapsed : DEFAULT_SETTINGS.startCollapsed,
	};
}

/**
 * THE initial fold state for an embed the user has not explicitly folded/unfolded —
 * i.e. the "default" term of `explicitChoice ?? default`, which both render modes
 * compute independently.
 *
 * `startCollapsed` folds everything, which makes the `![[note]]-` marker a no-op
 * rather than changing its meaning (marker syntax is deliberately untouched).
 */
export function foldedByDefault(settings: FoldableEmbedsSettings, hasFoldMarker: boolean): boolean {
	return settings.startCollapsed || hasFoldMarker;
}
