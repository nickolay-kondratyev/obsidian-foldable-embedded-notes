import { DEFAULT_SETTINGS, parseSettings } from "./foldableEmbedsSettings";
import type { FoldableEmbedsSettings } from "./foldableEmbedsSettings";

/**
 * The persistence half of Obsidian's `Plugin` API — the only part settings need.
 * Depending on this instead of `Plugin` keeps the store trivially substitutable.
 */
export interface SettingsPersistence {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

/**
 * The plugin's settings, in memory, backed by `data.json`.
 *
 * Holds the single mutable settings reference so the rest of the plugin can read the
 * CURRENT value through a {@link ReadSettings} accessor without knowing about
 * persistence.
 */
export class FoldableEmbedsSettingsStore {
	private current: FoldableEmbedsSettings = DEFAULT_SETTINGS;

	constructor(private readonly persistence: SettingsPersistence) {}

	/** Reads `data.json`; a missing file, a missing key or an unusable value falls back to the defaults. */
	async load(): Promise<void> {
		this.current = parseSettings(await this.readPersisted());
	}

	/**
	 * WHY failure is swallowed rather than propagated: settings are not the feature. The
	 * plugin awaits this during `onload`, so a rejection here would abort onload and the
	 * embeds would stop being foldable AT ALL. Unreadable settings must cost the user their
	 * settings, nothing more — so the defaults are used, loudly.
	 */
	private async readPersisted(): Promise<unknown> {
		try {
			return await this.persistence.loadData();
		} catch (error) {
			console.error("Foldable embedded notes: could not read settings, using defaults.", error);
			return null;
		}
	}

	get(): FoldableEmbedsSettings {
		return this.current;
	}

	/** Applies a change and persists it immediately (settings save on change, never on submit). */
	async setStartCollapsed(startCollapsed: boolean): Promise<void> {
		// Replaced, never mutated: readers hold the object they were handed.
		this.current = { ...this.current, startCollapsed };
		await this.persistence.saveData(this.current);
	}
}
