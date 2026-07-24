import { Plugin } from "obsidian";
import { FoldStateStore } from "./foldStateStore";
import { FoldableEmbedsPostProcessor } from "./foldableEmbedsPostProcessor";

/**
 * Makes `![[note]]` embeds foldable in reading mode; `![[note]]-` folds by default.
 * Lifecycle only — feature logic lives in the post-processor + fold store modules.
 */
export default class FoldableEmbeddedNotesPlugin extends Plugin {
	onload(): void {
		const store = new FoldStateStore();
		const postProcessor = new FoldableEmbedsPostProcessor(store);
		this.registerMarkdownPostProcessor(postProcessor.process);
	}
}
