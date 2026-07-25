import { MarkdownPostProcessorContext } from "obsidian";
import { EmbedFoldDom } from "./embedFoldDom";
import { FoldableEmbedMark } from "./foldableEmbedMark";
import { FoldStateStore } from "./foldStateStore";
import { foldedByDefault } from "./settings/foldableEmbedsSettings";
import type { ReadSettings } from "./settings/foldableEmbedsSettings";
import { WiredElements } from "./wiredElements";

/** Single fold marker character; `![[x]]-` folds by default. */
const FOLD_MARKER = "-";

/** Classes Obsidian puts on non-note embeds (images/pdf/media) — these are never foldable. */
const MEDIA_EMBED_CLASSES = ["media-embed", "image-embed", "video-embed", "audio-embed", "pdf-embed"];

type OnTitleReady = (title: HTMLElement) => void;

/**
 * Reading-mode markdown post-processor that makes note embeds foldable.
 *
 * Note embeds load their title/content asynchronously: at post-process time the
 * `.internal-embed` span exists but the `.markdown-embed` class and title bar
 * arrive later. We therefore wait (via a scoped MutationObserver, or synchronously
 * when already loaded) for the title before wiring up folding. Media embeds never
 * gain `.markdown-embed`, so they are simply never touched.
 */
export class FoldableEmbedsPostProcessor {
	/** Observers still waiting for an embed to resolve; disconnected on plugin unload. */
	private readonly liveObservers = new Set<MutationObserver>();
	/**
	 * Embeds this instance has made foldable and not yet given up. Strong references on
	 * purpose — {@link teardown} has to reach them — and bounded by the live DOM: a mark's
	 * `containerEl` IS its embed span, and `MarkdownPostProcessorContext.addChild` documents
	 * that removing the `containerEl` unloads the child, which calls {@link forget}.
	 */
	private readonly liveMarks = new Set<FoldableEmbedMark>();
	private readonly wiredEmbeds = new WiredElements();

	constructor(
		private readonly store: FoldStateStore,
		private readonly readSettings: ReadSettings,
	) {}

	/**
	 * Undoes everything this instance did to the DOM, for plugin unload.
	 *
	 * Both halves are needed: still-live observers (e.g. a never-resolving `![[missing]]`)
	 * must stop, and every mark must come off — Obsidian discards a reading view wholesale
	 * on unload, but an embed BODY inside a Live Preview widget is DOM Obsidian keeps.
	 */
	teardown(): void {
		for (const observer of this.liveObservers) {
			observer.disconnect();
		}
		this.liveObservers.clear();
		// Unloaded HERE and not left to `ctx.addChild`: MEASURED against Obsidian 1.12.7,
		// disabling the plugin does NOT unload the render components its children hang off,
		// so a nested embed inside a Live Preview widget kept every mark (e2e proves it).
		// Copied: each unload calls back into `forget`, which mutates this set.
		for (const mark of Array.from(this.liveMarks)) {
			mark.unload();
		}
		this.liveMarks.clear();
	}

	readonly process = (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		const embeds = Array.from(el.querySelectorAll<HTMLElement>(EmbedFoldDom.SEL_INTERNAL_EMBED));
		embeds.forEach((embed, indexWithinSection) => {
			this.whenMarkdownEmbedReady(embed, (title) =>
				this.makeFoldable(embed, title, ctx, el, indexWithinSection),
			);
		});
	};

	private makeFoldable(
		embed: HTMLElement,
		title: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		sectionEl: HTMLElement,
		indexWithinSection: number,
	): void {
		// Guard against a second post-process pass over the same live DOM.
		if (this.wiredEmbeds.has(embed)) {
			return;
		}
		const hasFoldMarker = this.stripFoldMarker(embed);
		const key = this.buildKey(embed, ctx, sectionEl, indexWithinSection);
		const folded = this.store.get(key) ?? foldedByDefault(this.readSettings(), hasFoldMarker);

		const mark = new FoldableEmbedMark(embed, (unloaded) => this.forget(unloaded));
		this.liveMarks.add(mark);
		this.wiredEmbeds.add(embed);
		// Loaded HERE rather than left to `ctx.addChild` below (which loads it only while the
		// rendering component itself is loaded): a component that was never loaded ignores
		// `unload()`, and then `teardown()` could not undo this mark.
		mark.load();

		EmbedFoldDom.markFoldable(embed);
		const chevron = EmbedFoldDom.ensureChevron(title);
		EmbedFoldDom.applyFoldState(embed, chevron, folded);

		EmbedFoldDom.onTitleClick(
			title,
			() => {
				// Inverts what is DISPLAYED — see EmbedFoldDom.isFolded for WHY that, and not
				// the recomputed default, is the operand (Live Preview's toggle matches).
				const nowFolded = !EmbedFoldDom.isFolded(embed);
				EmbedFoldDom.applyFoldState(embed, chevron, nowFolded);
				this.store.set(key, nowFolded);
			},
			// The title element can be Obsidian's and outlive this render (a nested embed
			// inside a Live Preview widget), so the listener needs a real removal path.
			mark.listenerOptions,
		);

		// Hands this mark's lifetime to the renderer: per `MarkdownPostProcessorContext.addChild`
		// the mark is unloaded once its `containerEl` — this embed span — leaves the DOM. Last
		// statement only so that what is handed over is a FULLY wired mark; `addChild` itself
		// never unloads (`Component.addChild` only ever loads), so the order is not load-bearing.
		ctx.addChild(mark);
	}

	/** A mark has undone itself: drop it, and let the embed be wired again by a later render. */
	private forget(mark: FoldableEmbedMark): void {
		this.liveMarks.delete(mark);
		this.wiredEmbeds.remove(mark.embed);
	}

	/**
	 * STRICT fold-marker parse. `-` counts as a marker only when it is the FIRST
	 * character of the embed span's next text-node sibling (i.e. immediately after
	 * `]]`, no whitespace between) AND is itself followed by whitespace or a real
	 * END OF LINE. `![[x]]-like` therefore keeps its literal dash.
	 *
	 * WHY end of LINE and not merely end of that text node: inline markup right after
	 * the dash (`![[x]]-**bold**`) renders as a SIBLING element, leaving the dash alone
	 * in its own text node. Treating that as end-of-line armed the marker and deleted a
	 * dash the user meant literally, inconsistently with the plain-text `![[x]]-x` case.
	 *
	 * When it IS a marker, only the dash is removed so it never renders; any
	 * trailing text/whitespace on that node is preserved. Structural check (no
	 * regex lookbehind) — required for Obsidian mobile/iOS Safari.
	 *
	 * @returns whether this embed carries the fold marker (see `foldedByDefault` for what
	 *          that means once the "start collapsed" setting is taken into account).
	 */
	private stripFoldMarker(embed: HTMLElement): boolean {
		const sibling = embed.nextSibling;
		if (sibling === null || sibling.nodeType !== Node.TEXT_NODE) {
			return false;
		}
		const text = sibling.textContent ?? "";
		if (!text.startsWith(FOLD_MARKER)) {
			return false;
		}
		const afterMarker = text.slice(FOLD_MARKER.length);
		const followedByWhitespaceOrEol = /^\s/.test(afterMarker) || (afterMarker === "" && this.isEndOfLine(sibling));
		if (!followedByWhitespaceOrEol) {
			return false;
		}
		sibling.textContent = afterMarker;
		return true;
	}

	/**
	 * Whether nothing more is RENDERED after this node inside its PARENT element: nothing
	 * follows it, or a `<br>` (Obsidian's rendering of a soft line break) does.
	 *
	 * KNOWN LIMITATION: only the node's own siblings are inspected, so an embed wrapped in
	 * inline markup (`**![[x]]-** tail`) still counts as end of line and loses its dash.
	 * Pre-existing, rare, and cheap only at the cost of walking ancestors — left alone (80/20).
	 *
	 * `Node.instanceOf` (obsidian) rather than `instanceof`: cross-window safe, so a popout
	 * window's `<br>` — built from a DIFFERENT realm's constructor — is still recognised.
	 */
	private isEndOfLine(node: Node): boolean {
		const next = node.nextSibling;
		return next === null || next.instanceOf(HTMLBRElement);
	}

	/**
	 * Stable per-session identity for one embed occurrence. Prefers the section's
	 * source line (stable across re-renders); when section info is unavailable it
	 * falls back to a content hash of the section (stable across re-renders and
	 * section-distinguishing). The occurrence index within the section is ALWAYS
	 * appended so multiple embeds of the SAME note in one section/line keep
	 * independent fold state; `src` keeps different notes from colliding.
	 */
	private buildKey(
		embed: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		sectionEl: HTMLElement,
		indexWithinSection: number,
	): string {
		const src = embed.getAttribute("src") ?? "";
		const lineStart = ctx.getSectionInfo(sectionEl)?.lineStart;
		const locator = lineStart !== undefined ? `L${lineStart}` : `S${this.sectionHash(sectionEl)}`;
		return `${ctx.sourcePath}::${locator}::${src}::#${indexWithinSection}`;
	}

	/** djb2 hash of the section's rendered text — a stable section discriminator for the rare null-section fallback. */
	private sectionHash(sectionEl: HTMLElement): number {
		const text = sectionEl.textContent ?? "";
		let hash = 5381;
		for (let i = 0; i < text.length; i++) {
			hash = (hash * 33) ^ text.charCodeAt(i);
		}
		return hash >>> 0;
	}

	private whenMarkdownEmbedReady(embed: HTMLElement, onReady: OnTitleReady): void {
		if (this.wiredEmbeds.has(embed)) {
			return;
		}
		const readyTitle = this.markdownEmbedTitle(embed);
		if (readyTitle !== null) {
			onReady(readyTitle);
			return;
		}
		const observer = new MutationObserver(() => {
			const title = this.markdownEmbedTitle(embed);
			if (title !== null) {
				this.stopObserving(observer);
				onReady(title);
				return;
			}
			if (this.isMediaEmbed(embed)) {
				this.stopObserving(observer);
			}
		});
		this.liveObservers.add(observer);
		observer.observe(embed, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	private stopObserving(observer: MutationObserver): void {
		observer.disconnect();
		this.liveObservers.delete(observer);
	}

	/** The title bar, but only once this embed is a resolved markdown (note) embed. */
	private markdownEmbedTitle(embed: HTMLElement): HTMLElement | null {
		if (!embed.classList.contains(EmbedFoldDom.CLS_MARKDOWN_EMBED)) {
			return null;
		}
		return embed.querySelector<HTMLElement>(EmbedFoldDom.SEL_EMBED_TITLE);
	}

	private isMediaEmbed(embed: HTMLElement): boolean {
		return MEDIA_EMBED_CLASSES.some((cls) => embed.classList.contains(cls));
	}
}
