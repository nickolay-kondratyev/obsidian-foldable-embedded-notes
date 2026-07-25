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
	/**
	 * The KEYED PART of `data.json` as it was found, so a save can put back the keys this version does not
	 * understand. {@link parseSettings} stays deliberately lossy on READ — but a vault synced
	 * from a machine running a newer plugin (or a user's hand-added key) must not have that
	 * key destroyed by the first toggle here.
	 */
	private persisted: Record<string, unknown> = {};
	/**
	 * Tail of the write queue — see {@link setStartCollapsed}. Never in a rejected state, so
	 * one failed save cannot poison every save after it.
	 */
	private saving: Promise<void> = Promise.resolve();

	constructor(private readonly persistence: SettingsPersistence) {}

	/** Reads `data.json`; a missing file, a missing key or an unusable value falls back to the defaults. */
	async load(): Promise<void> {
		const persisted = await this.readPersisted();
		this.persisted = FoldableEmbedsSettingsStore.asKeyedObject(persisted);
		this.current = parseSettings(persisted);
	}

	/**
	 * `data.json` should hold a JSON object, but it is a file a user can hand-edit: a string,
	 * an array or `null` would otherwise be SPREAD into the saved value (`"ab"` becoming
	 * `{"0":"a","1":"b"}`). Anything that is not a plain object carries no keys worth keeping,
	 * so it is dropped rather than mangled.
	 */
	private static asKeyedObject(persisted: unknown): Record<string, unknown> {
		if (typeof persisted !== "object" || persisted === null || Array.isArray(persisted)) {
			return {};
		}
		return persisted as Record<string, unknown>;
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

	/**
	 * Applies a change and persists it immediately (settings save on change, never on submit).
	 *
	 * Writes are SERIALIZED because the caller cannot serialize them: Obsidian does not await
	 * a toggle's `onChange`, so double-clicking fires overlapping calls, and two unordered
	 * writes to one path can leave `data.json` holding the value the user changed their mind
	 * about — silently, since both writes succeed.
	 *
	 * Each queued write reads `this.current` at WRITE time rather than capturing the value at
	 * CALL time: the in-memory value is already the newest one (assigned synchronously below),
	 * so every write in the queue — including the last, which decides what is on disk — writes
	 * the state the UI is showing. Earlier queued writes become harmless repeats.
	 */
	async setStartCollapsed(startCollapsed: boolean): Promise<void> {
		// Replaced, never mutated: readers hold the object they were handed.
		this.current = { ...this.current, startCollapsed };
		const written = this.saving.then(() => this.persistence.saveData({ ...this.persisted, ...this.current }));
		// WHY the queue tail is a DIFFERENT promise from the one returned: a rejected tail
		// would make every later `.then` skip its write and would surface as an unhandled
		// rejection. The tail therefore neutralises the failure; the caller still gets the
		// rejecting promise, so the settings tab keeps reporting a failed save.
		this.saving = written.catch(() => undefined);
		await written;
	}
}
