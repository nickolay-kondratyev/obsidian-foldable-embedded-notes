import { MarkdownPostProcessorContext, setIcon } from "obsidian";
import { FoldStateStore } from "./foldStateStore";

/** Marks an embed span the plugin has made foldable (also the CSS hook for a forced-visible title). */
const CLS_FOLDABLE = "fen-embed";
/** Toggled on the embed span to collapse its body (CSS hides `.markdown-embed-content`). */
const CLS_FOLDED = "fen-folded";
/** The injected chevron span inside the title bar. */
const CLS_CHEVRON = "fen-collapse-icon";
/** Core-callout convention: present while collapsed; drives the chevron rotation in CSS. */
const CLS_COLLAPSED = "is-collapsed";

/** Obsidian's built-in collapse triangle, same glyph core callouts use. */
const CHEVRON_ICON = "right-triangle";
/** Single fold marker character; `![[x]]-` folds by default. */
const FOLD_MARKER = "-";

const SEL_INTERNAL_EMBED = ".internal-embed";
const CLS_MARKDOWN_EMBED = "markdown-embed";
const SEL_EMBED_TITLE = ".markdown-embed-title";

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

	constructor(private readonly store: FoldStateStore) {}

	/** Disconnects every still-live observer (e.g. a never-resolving `![[missing]]`) on unload. */
	disconnectAll(): void {
		for (const observer of this.liveObservers) {
			observer.disconnect();
		}
		this.liveObservers.clear();
	}

	readonly process = (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		const embeds = Array.from(el.querySelectorAll<HTMLElement>(SEL_INTERNAL_EMBED));
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
		if (embed.classList.contains(CLS_FOLDABLE)) {
			return;
		}
		const foldedByDefault = this.stripFoldMarker(embed);
		const key = this.buildKey(embed, ctx, sectionEl, indexWithinSection);
		const folded = this.store.get(key) ?? foldedByDefault;

		embed.classList.add(CLS_FOLDABLE);
		const chevron = title.createSpan({ cls: CLS_CHEVRON, prepend: true });
		setIcon(chevron, CHEVRON_ICON);
		this.applyFoldState(embed, chevron, folded);

		// Listener lives and dies with this freshly-created title element, so it
		// needs no explicit deregistration. preventDefault/stopPropagation suppress
		// Obsidian's own "open the embedded note" click behaviour on the title.
		title.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const nowFolded = !embed.classList.contains(CLS_FOLDED);
			this.applyFoldState(embed, chevron, nowFolded);
			this.store.set(key, nowFolded);
		});
	}

	private applyFoldState(embed: HTMLElement, chevron: HTMLElement, folded: boolean): void {
		embed.classList.toggle(CLS_FOLDED, folded);
		chevron.classList.toggle(CLS_COLLAPSED, folded);
	}

	/**
	 * STRICT fold-marker parse. `-` counts as a marker only when it is the FIRST
	 * character of the embed span's next text-node sibling (i.e. immediately after
	 * `]]`, no whitespace between) AND is itself followed by whitespace or the end
	 * of that text node. `![[x]]-like` therefore keeps its literal dash.
	 *
	 * When it IS a marker, only the dash is removed so it never renders; any
	 * trailing text/whitespace on that node is preserved. Structural check (no
	 * regex lookbehind) — required for Obsidian mobile/iOS Safari.
	 *
	 * @returns whether this embed is folded-by-default via the marker.
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
		const followedByWhitespaceOrEol = afterMarker === "" || /^\s/.test(afterMarker);
		if (!followedByWhitespaceOrEol) {
			return false;
		}
		sibling.textContent = afterMarker;
		return true;
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
		if (embed.classList.contains(CLS_FOLDABLE)) {
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
		if (!embed.classList.contains(CLS_MARKDOWN_EMBED)) {
			return null;
		}
		return embed.querySelector<HTMLElement>(SEL_EMBED_TITLE);
	}

	private isMediaEmbed(embed: HTMLElement): boolean {
		return MEDIA_EMBED_CLASSES.some((cls) => embed.classList.contains(cls));
	}
}
