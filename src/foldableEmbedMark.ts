import { MarkdownRenderChild } from "obsidian";
import { EmbedFoldDom } from "./embedFoldDom";

/** Told when a mark has undone itself, so the owner can drop its bookkeeping. */
export type OnMarkUnloaded = (mark: FoldableEmbedMark) => void;

/**
 * ONE embed the reading-mode post-processor made foldable, and the exact inverse of that.
 *
 * WHY this exists at all — the post-processor renders every embed BODY, including the
 * bodies inside LIVE PREVIEW widgets, and that DOM is Obsidian's and is REUSED (it is why
 * `LivePreviewFoldView.destroy()` exists). A genuine reading view is discarded wholesale on
 * plugin unload, but those nested bodies are not: without a removal path the disabled
 * plugin leaves a stray chevron behind and keeps folding through a listener nothing can
 * reach any more.
 *
 * It is a `MarkdownRenderChild` handed to `MarkdownPostProcessorContext.addChild`, whose
 * documented unload trigger is the DOM: "if the containerEl of the child is ever removed,
 * the component's unload will be called". `containerEl` here is the embed span itself, so a
 * re-render that replaces that span takes its mark with it — which keeps the owner's
 * registry bounded and lets the SAME reused element be wired again afterwards.
 *
 * That trigger does NOT cover plugin unload: disabling the plugin leaves Obsidian's DOM
 * exactly where it is, so nothing removes the span and nothing unloads this mark (MEASURED
 * on 1.12.7 — see the owner's `teardown`, which unloads every live mark itself).
 */
export class FoldableEmbedMark extends MarkdownRenderChild {
	/** One abort for every listener added under this mark. */
	private readonly listeners = new AbortController();

	constructor(
		embed: HTMLElement,
		private readonly onUnloaded: OnMarkUnloaded,
	) {
		super(embed);
	}

	/** The embed this mark is on — {@link MarkdownRenderChild.containerEl}, named for its role. */
	get embed(): HTMLElement {
		return this.containerEl;
	}

	/** Ties a title-click listener's lifetime to this mark. */
	get listenerOptions(): AddEventListenerOptions {
		return { signal: this.listeners.signal };
	}

	onunload(): void {
		this.listeners.abort();
		EmbedFoldDom.unmark(this.embed);
		this.onUnloaded(this);
	}
}
