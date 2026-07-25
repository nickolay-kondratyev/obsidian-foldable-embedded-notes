import { Plugin } from "obsidian";
import { FoldStateStore } from "./foldStateStore";
import { FoldableEmbedsPostProcessor } from "./foldableEmbedsPostProcessor";
import { livePreviewFoldExtension } from "./livePreview/livePreviewFoldExtension";
import { FoldableEmbedsSettingTab } from "./settings/foldableEmbedsSettingTab";
import { FoldableEmbedsSettingsStore } from "./settings/foldableEmbedsSettingsStore";

/**
 * Makes `![[note]]` embeds foldable in reading mode AND in Live Preview;
 * `![[note]]-` folds by default, as does every embed while the "start embedded notes
 * collapsed" setting is on.
 * Lifecycle only — feature logic lives in the post-processor, fold store, settings and
 * livePreview modules.
 */
export default class FoldableEmbeddedNotesPlugin extends Plugin {
	private postProcessor?: FoldableEmbedsPostProcessor;

	async onload(): Promise<void> {
		const settings = new FoldableEmbedsSettingsStore(this);
		// Awaited before anything is registered so no render can read default settings
		// while the persisted ones are still loading.
		await settings.load();
		const readSettings = () => settings.get();

		const store = new FoldStateStore();
		this.postProcessor = new FoldableEmbedsPostProcessor(store, readSettings);
		this.registerMarkdownPostProcessor(this.postProcessor.process);
		// Needs no onunload counterpart: registerEditorExtension unregisters itself,
		// CM6 then destroys the view plugin, whose destroy() removes the injected DOM.
		this.registerEditorExtension(livePreviewFoldExtension(readSettings));
		this.addSettingTab(new FoldableEmbedsSettingTab(this.app, this, settings));
	}

	onunload(): void {
		this.postProcessor?.teardown();
	}
}
