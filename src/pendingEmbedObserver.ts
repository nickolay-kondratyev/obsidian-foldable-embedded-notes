import { MarkdownRenderChild } from "obsidian";

/** Told on every change to the observed embed; stop by calling `unload()` on the argument. */
export type OnEmbedMutated = (pending: PendingEmbedObserver) => void;

/** Told when an observer has stopped, so the owner can drop its bookkeeping. */
export type OnObserverStopped = (pending: PendingEmbedObserver) => void;

/**
 * What Obsidian can still change about an embed while it loads: its own classes (a bare
 * `internal-embed` becomes `markdown-embed`, `media-embed`, `file-embed`…) and its body.
 */
const OBSERVED_MUTATIONS: MutationObserverInit = {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: ["class"],
};

/**
 * ONE MutationObserver waiting for ONE embed to finish loading, whose life is bounded by
 * the RENDER that created it.
 *
 * WHY this is a `MarkdownRenderChild` and not a bare observer: an embed does not have to
 * resolve. `![[does-not-exist]]` settles as `internal-embed is-loaded file-embed mod-empty`
 * and is then never touched again, so an observer waiting for a title on it waits forever —
 * and every re-render of the note added another one (MEASURED 2 → 4 → 6 on Obsidian 1.12.7,
 * each retaining a detached section subtree). Handed to
 * `MarkdownPostProcessorContext.addChild`, whose documented unload trigger is the DOM ("if
 * the containerEl of the child is ever removed, the component's unload will be called"), the
 * observer dies with the embed span it observes — for ANY reason an embed never resolves,
 * not just the classes we happen to know about.
 *
 * That trigger does NOT cover plugin unload (Obsidian leaves its DOM where it is), which is
 * why the owner's `teardown` also unloads every live observer itself — same asymmetry as
 * `FoldableEmbedMark`.
 */
export class PendingEmbedObserver extends MarkdownRenderChild {
	private readonly observer: MutationObserver;

	constructor(
		embed: HTMLElement,
		onEmbedMutated: OnEmbedMutated,
		private readonly onStopped: OnObserverStopped,
	) {
		super(embed);
		this.observer = new MutationObserver(() => onEmbedMutated(this));
	}

	/** The embed being waited on — {@link MarkdownRenderChild.containerEl}, named for its role. */
	get embed(): HTMLElement {
		return this.containerEl;
	}

	onload(): void {
		this.observer.observe(this.embed, OBSERVED_MUTATIONS);
	}

	onunload(): void {
		this.observer.disconnect();
		this.onStopped(this);
	}
}
