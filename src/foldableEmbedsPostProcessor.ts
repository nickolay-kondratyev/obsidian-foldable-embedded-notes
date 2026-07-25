import { MarkdownPostProcessorContext } from "obsidian";
import { EmbedFoldDom } from "./embedFoldDom";
import { EmbedFoldKeyRegistry } from "./embedFoldKeyRegistry";
import type { PendingEmbedFoldKey } from "./embedFoldKeyRegistry";
import { EmbedFoldKeys } from "./embedFoldKeys";
import type { EmbedOccurrence } from "./embedFoldKeys";
import { FoldableEmbedMark } from "./foldableEmbedMark";
import { FoldStateStore } from "./foldStateStore";
import { PendingEmbedObserver } from "./pendingEmbedObserver";
import { foldedByDefault } from "./settings/foldableEmbedsSettings";
import type { ReadSettings } from "./settings/foldableEmbedsSettings";
import { WiredElements } from "./wiredElements";

/** Single fold marker character; `![[x]]-` folds by default. */
const FOLD_MARKER = "-";

/**
 * Classes Obsidian stamps on an embed that has RESOLVED to media. Media is never foldable,
 * and a resolved media embed will not become a note later — the target file it names exists
 * and is not markdown — so waiting on one can stop.
 *
 * WHY-NOT `file-embed` here, even though it too means "not a note": it is NOT terminal.
 * `file-embed mod-empty` means "this embed's target does not exist RIGHT NOW", and MEASURED
 * on Obsidian 1.12.7 the SAME span is upgraded in place to `markdown-embed` once the note is
 * created (vault edit, Sync, index catching up) — `unresolved-embed-observers.e2e.ts` pins
 * that. Its sibling `file-embed mod-generic` (`![[notes.txt]]`) genuinely is terminal, but is
 * deliberately NOT special-cased either: such an embed's wait is already bounded by its
 * render (see {@link PendingEmbedObserver}), so classifying it would buy nothing while
 * re-opening exactly the class-taxonomy guessing that cost the behaviour above.
 */
const MEDIA_EMBED_CLASSES = ["media-embed", "image-embed", "video-embed", "audio-embed", "pdf-embed"];

type OnTitleReady = (title: HTMLElement) => void;

/**
 * Reading-mode markdown post-processor that makes note embeds foldable.
 *
 * Note embeds load their title/content asynchronously: at post-process time the
 * `.internal-embed` span exists but the `.markdown-embed` class and title bar
 * arrive later. We therefore wait (via a scoped MutationObserver, or synchronously
 * when already loaded) for the title before wiring up folding. An embed that is not a note
 * simply never gains `.markdown-embed` and is never touched; the wait for it ends when its
 * render goes away — that, and NOT any reading of Obsidian's classes, is what bounds it (see
 * {@link PendingEmbedObserver}). Media is the one exception the classes are trusted for,
 * because a resolved media embed cannot become a note (see {@link MEDIA_EMBED_CLASSES}).
 */
export class FoldableEmbedsPostProcessor {
	/**
	 * Waits still in flight, each bounded by its own render — see {@link PendingEmbedObserver}
	 * for WHY that bound exists. Strong references on purpose, for the same reason as
	 * {@link liveMarks}: {@link teardown} has to reach them on plugin unload, which no DOM
	 * removal announces.
	 */
	private readonly liveObservers = new Set<PendingEmbedObserver>();
	/** Embeds one of those waits is already watching — at most one observer per span. */
	private readonly pendingEmbeds = new WiredElements();
	/**
	 * Embeds this instance has made foldable and not yet given up. Strong references on
	 * purpose — {@link teardown} has to reach them — and bounded by the live DOM: a mark's
	 * `containerEl` IS its embed span, and `MarkdownPostProcessorContext.addChild` documents
	 * that removing the `containerEl` unloads the child, which calls {@link forget}.
	 */
	private readonly liveMarks = new Set<FoldableEmbedMark>();
	private readonly wiredEmbeds = new WiredElements();
	/** Keys of every embed span seen, so a NESTED one can inherit its host's identity. */
	private readonly foldKeys: EmbedFoldKeyRegistry;

	constructor(
		private readonly store: FoldStateStore,
		private readonly readSettings: ReadSettings,
		private readonly keys: EmbedFoldKeys,
	) {
		this.foldKeys = new EmbedFoldKeyRegistry(keys);
	}

	/**
	 * Undoes everything this instance did to the DOM, for plugin unload.
	 *
	 * Both halves are needed, for the SAME reason: only a REMOVED container unloads a render
	 * child, and Obsidian discards a reading view wholesale on unload but KEEPS an embed BODY
	 * inside a Live Preview widget. MEASURED on 1.12.7 with this loop removed: a reading-view
	 * observer is unloaded by the disable anyway, one on a nested embed inside a Live Preview
	 * widget is NOT — it kept observing (same asymmetry the marks below have).
	 */
	teardown(): void {
		// Copied for the same reason as the marks below: each unload calls back into
		// `forgetObserver`, which mutates this set.
		for (const observer of Array.from(this.liveObservers)) {
			observer.unload();
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
			// Registered SYNCHRONOUSLY, before this embed's own body can be post-processed:
			// that is what guarantees an embed NESTED inside it can reach this key (see
			// EmbedFoldKeyRegistry). Derivation itself stays lazy — see `occurrenceOf`.
			const foldKey = this.foldKeys.register(embed, () =>
				this.keys.keyFor(this.occurrenceOf(embed, ctx, el, indexWithinSection)),
			);
			this.whenMarkdownEmbedReady(embed, ctx, (title) => this.makeFoldable(embed, title, ctx, foldKey));
		});
	};

	private makeFoldable(
		embed: HTMLElement,
		title: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		pendingKey: PendingEmbedFoldKey,
	): void {
		// Guard against a second post-process pass over the same live DOM.
		if (this.wiredEmbeds.has(embed)) {
			return;
		}
		const hasFoldMarker = this.stripFoldMarker(embed);
		const foldKey = pendingKey.resolve();
		// This render can identify the embed better than an earlier one could; carry over
		// whatever the user recorded back then. In practice only one of the weaker keys holds a
		// recording; if two ever did (two panes of the note rendered at different cache warmth),
		// the first listed wins and the rest are no-ops (FoldStateStore.adoptRecordingOf).
		for (const supersededKey of foldKey.supersededKeys) {
			this.store.adoptRecordingOf(supersededKey, foldKey.current);
		}
		const key = foldKey.current;
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
	 * Gathers what identifies this embed occurrence, for {@link EmbedFoldKeys} to key it.
	 * `getSectionInfo` is called HERE and not earlier: Obsidian documents it must be called
	 * right before it is needed (an embed is wired asynchronously, after its title loads).
	 */
	private occurrenceOf(
		embed: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		sectionEl: HTMLElement,
		indexWithinSection: number,
	): EmbedOccurrence {
		return {
			sourcePath: ctx.sourcePath,
			section: ctx.getSectionInfo(sectionEl),
			indexWithinSection,
			src: embed.getAttribute("src") ?? "",
			renderedSectionText: sectionEl.textContent ?? "",
		};
	}

	/**
	 * Calls `onReady` once this embed is a resolved NOTE embed — now, or whenever Obsidian
	 * finishes loading it, INCLUDING an unresolved embed whose target appears later. Never, if
	 * the embed turns out to be media, and never after the wait's own render goes away.
	 */
	private whenMarkdownEmbedReady(
		embed: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		onReady: OnTitleReady,
	): void {
		if (this.wiredEmbeds.has(embed)) {
			return;
		}
		const readyTitle = this.markdownEmbedTitle(embed);
		if (readyTitle !== null) {
			onReady(readyTitle);
			return;
		}
		// Already resolved to media: waiting would wait for a mutation that never comes.
		// MEASURED: this can only fire over DOM Obsidian REUSES (an embed body inside a Live
		// Preview widget) — on a fresh render the span is still bare `internal-embed`, and the
		// settling mutation is exactly what the observer below is for.
		if (this.isMediaEmbed(embed)) {
			return;
		}
		// At most ONE observer per live embed span, structurally. A second post-process pass
		// over the same still-pending span (Obsidian's REUSED Live Preview embed-body DOM)
		// would otherwise attach a second observer that nothing distinguishes from the first.
		// `wiredEmbeds` cannot serve: an embed enters it only once it RESOLVES.
		if (this.pendingEmbeds.has(embed)) {
			return;
		}
		this.pendingEmbeds.add(embed);
		const pending = new PendingEmbedObserver(
			embed,
			(waiting) => this.onPendingEmbedMutated(waiting, onReady),
			(stopped) => this.forgetObserver(stopped),
		);
		this.liveObservers.add(pending);
		// Loaded HERE rather than left to `ctx.addChild` — same reason as a mark's: a
		// component that was never loaded ignores `unload()`, and `teardown()` needs it.
		pending.load();
		ctx.addChild(pending);
	}

	/** One change to an embed still being waited on: is the wait over, and how did it end? */
	private onPendingEmbedMutated(pending: PendingEmbedObserver, onReady: OnTitleReady): void {
		const embed = pending.embed;
		const title = this.markdownEmbedTitle(embed);
		if (title === null && !this.isMediaEmbed(embed)) {
			return;
		}
		// Stopped BEFORE `onReady`, whose DOM writes would otherwise come back as more
		// mutations of this very embed.
		pending.unload();
		if (title !== null) {
			onReady(title);
		}
	}

	/** An observer has stopped: drop it, whether it stopped itself or its render went away. */
	private forgetObserver(pending: PendingEmbedObserver): void {
		this.liveObservers.delete(pending);
		// Forgotten too, so a LATER render of the same (reused) span can wait on it again.
		this.pendingEmbeds.remove(pending.embed);
	}

	/** The title bar, but only once this embed is a resolved markdown (note) embed. */
	private markdownEmbedTitle(embed: HTMLElement): HTMLElement | null {
		if (!embed.classList.contains(EmbedFoldDom.CLS_MARKDOWN_EMBED)) {
			return null;
		}
		return embed.querySelector<HTMLElement>(EmbedFoldDom.SEL_EMBED_TITLE);
	}

	/** Whether Obsidian has resolved this embed to media — see {@link MEDIA_EMBED_CLASSES}. */
	private isMediaEmbed(embed: HTMLElement): boolean {
		return MEDIA_EMBED_CLASSES.some((cls) => embed.classList.contains(cls));
	}
}
