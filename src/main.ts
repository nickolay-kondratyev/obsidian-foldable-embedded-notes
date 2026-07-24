import { Plugin } from "obsidian";
import { FoldStateStore } from "./foldStateStore";
import { FoldableEmbedsPostProcessor } from "./foldableEmbedsPostProcessor";
import { livePreviewFoldExtension } from "./livePreview/livePreviewFoldExtension";

/**
 * Makes `![[note]]` embeds foldable in reading mode AND in Live Preview;
 * `![[note]]-` folds by default.
 * Lifecycle only — feature logic lives in the post-processor, fold store and
 * livePreview modules.
 */
export default class FoldableEmbeddedNotesPlugin extends Plugin {
	private postProcessor?: FoldableEmbedsPostProcessor;

	onload(): void {
		const store = new FoldStateStore();
		this.postProcessor = new FoldableEmbedsPostProcessor(store);
		this.registerMarkdownPostProcessor(this.postProcessor.process);
		// Needs no onunload counterpart: registerEditorExtension unregisters itself,
		// CM6 then destroys the view plugin, whose destroy() removes the injected DOM.
		this.registerEditorExtension(livePreviewFoldExtension());
	}

	onunload(): void {
		this.postProcessor?.disconnectAll();
	}
}
