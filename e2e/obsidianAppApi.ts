/**
 * Typed facade over Obsidian's `window.app`, for use INSIDE `page.evaluate`
 * callbacks (which run in the Obsidian renderer, so they cannot call imported
 * helpers — but types are erased, so a shared `interface` is the one thing they
 * CAN share).
 *
 * Deliberately PARTIAL: it models only the members this suite drives, in the
 * states this suite runs them in (e.g. a main-area leaf always exists by the
 * time any of this is called). WHY-NOT `obsidian`'s own `App` type: the members
 * the harness needs most — `plugins`, `commands`, `vault.setConfig`,
 * `view.editor` — are undocumented internals absent from it, so it would have to
 * be augmented member-by-member anyway.
 */

/** 0-based editor position, matching Obsidian's own `EditorPosition`. */
export interface EditorPosition {
	readonly line: number;
	readonly ch: number;
}

/** Opaque handle to a `TFile`/`TFolder`; the suite only ever passes it back in or reads its path. */
export interface AbstractFile {
	readonly path: string;
}

export interface Editor {
	getValue(): string;
	/** `"head"`/`"anchor"` return the selection's MOVING/fixed end; `"from"`/`"to"` its ordered ends. */
	getCursor(mode?: "head" | "anchor" | "from" | "to"): EditorPosition;
	setCursor(position: EditorPosition): void;
	setSelection(anchor: EditorPosition, head?: EditorPosition): void;
	replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void;
}

export interface ViewState {
	readonly type: string;
	readonly state?: Record<string, unknown>;
}

export interface WorkspaceLeaf {
	readonly view: { readonly editor: Editor };
	getViewState(): ViewState;
	setViewState(state: ViewState): Promise<void>;
	openFile(file: AbstractFile): Promise<void>;
}

export interface ObsidianApp {
	readonly vault: {
		getAbstractFileByPath(path: string): AbstractFile | null;
		setConfig(key: string, value: unknown): void;
	};
	readonly workspace: {
		readonly layoutReady: boolean;
		getLeaf(newLeaf: boolean): WorkspaceLeaf;
		getMostRecentLeaf(): WorkspaceLeaf;
		getActiveFile(): AbstractFile | null;
	};
	readonly commands: {
		executeCommandById(id: string): boolean;
	};
	readonly metadataCache: {
		/** Null until Obsidian has indexed that file — see `ObsidianHarness.openFile`. */
		getCache(path: string): unknown | null;
	};
	readonly plugins: {
		readonly plugins: Record<string, unknown>;
		readonly enabledPlugins: Set<string>;
		setEnable(enabled: boolean): Promise<void>;
		enablePlugin(pluginId: string): Promise<void>;
		disablePlugin(pluginId: string): Promise<void>;
	};
}

declare global {
	interface Window {
		/**
		 * Obsidian installs this once the renderer boots — so it is genuinely
		 * ABSENT for a moment at launch; code that runs during boot must guard
		 * with `window.app?.`.
		 */
		readonly app: ObsidianApp;
	}
}
