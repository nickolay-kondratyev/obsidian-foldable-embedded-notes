import { DEFAULT_SETTINGS } from "./foldableEmbedsSettings";
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

	/** Reads `data.json`; missing file or missing keys fall back to the defaults. */
	async load(): Promise<void> {
		const persisted = (await this.persistence.loadData()) as Partial<FoldableEmbedsSettings> | null;
		this.current = { ...DEFAULT_SETTINGS, ...persisted };
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
