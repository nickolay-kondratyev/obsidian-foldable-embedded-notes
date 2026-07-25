import { setIcon } from "obsidian";

/**
 * The DOM contract of a foldable embed, shared by BOTH modes (reading-mode
 * post-processor and the Live Preview CM6 extension).
 *
 * What lives here is exactly the knowledge both modes encode identically: which
 * classes must match `styles.css`, what the chevron is, what "folded" looks like,
 * why a title click must be swallowed — and the inverse of all that (`unmark`).
 * What deliberately does NOT live here: readiness waiting, fold-state identity and
 * marker parsing — those differ by design between the two modes.
 *
 * Stateless static class (CLAUDE.md: static class for stateless utilities).
 */
export class EmbedFoldDom {
	/** Marks an embed the plugin has made foldable (also the CSS hook for a forced-visible title). */
	static readonly CLS_FOLDABLE = "fen-embed";
	/** Toggled on the embed to collapse its body (CSS hides `.markdown-embed-content`). */
	static readonly CLS_FOLDED = "fen-folded";
	/** The injected chevron span inside the title bar. */
	static readonly CLS_CHEVRON = "fen-collapse-icon";
	/** Core-callout convention: present while collapsed; drives the chevron rotation in CSS. */
	static readonly CLS_COLLAPSED = "is-collapsed";

	/** Obsidian's class for a RESOLVED note embed — absent on media embeds and while loading. */
	static readonly CLS_MARKDOWN_EMBED = "markdown-embed";

	/** Obsidian's wrapper element for any `![[ ]]`, in both modes. */
	static readonly SEL_INTERNAL_EMBED = ".internal-embed";
	static readonly SEL_EMBED_TITLE = ".markdown-embed-title";

	/** Obsidian's built-in collapse triangle, same glyph core callouts use. */
	private static readonly CHEVRON_ICON = "right-triangle";

	static markFoldable(embed: HTMLElement): void {
		embed.classList.add(EmbedFoldDom.CLS_FOLDABLE);
	}

	/**
	 * The title bar's chevron, creating it on first call. Idempotent by design:
	 * Live Preview re-syncs the same (Obsidian-owned, reused) title element many times.
	 */
	static ensureChevron(title: HTMLElement): HTMLElement {
		const existing = title.querySelector<HTMLElement>(`.${EmbedFoldDom.CLS_CHEVRON}`);
		if (existing !== null) {
			return existing;
		}
		const chevron = title.createSpan({ cls: EmbedFoldDom.CLS_CHEVRON, prepend: true });
		setIcon(chevron, EmbedFoldDom.CHEVRON_ICON);
		return chevron;
	}

	static applyFoldState(embed: HTMLElement, chevron: HTMLElement, folded: boolean): void {
		embed.classList.toggle(EmbedFoldDom.CLS_FOLDED, folded);
		chevron.classList.toggle(EmbedFoldDom.CLS_COLLAPSED, folded);
	}

	/**
	 * What the user is CURRENTLY LOOKING AT — the last {@link applyFoldState} projection.
	 *
	 * This, not any recomputed state, is what a title click must invert: the user clicked
	 * on the pixels. Both modes can have a projection that lags their own idea of the
	 * default (reading mode between re-renders, Live Preview after the "start collapsed"
	 * setting is flipped under an open pane), and inverting the recomputed value there
	 * dispatches the state already on screen — a click that visibly does nothing.
	 */
	static isFolded(embed: HTMLElement): boolean {
		return embed.classList.contains(EmbedFoldDom.CLS_FOLDED);
	}

	/**
	 * Click-to-fold on a title bar. preventDefault/stopPropagation are there to stop the click
	 * ALSO doing what a click on that title otherwise does: Obsidian's own "open the embedded
	 * note" default, and — in Live Preview, where the title lives inside `.cm-content` —
	 * CodeMirror placing a cursor at the click position.
	 *
	 * HONEST about the evidence: neither effect is covered by a test, and MEASURED against
	 * Obsidian 1.12.7 the whole e2e suite stays green with both calls deleted. Treat them as a
	 * deliberate defence, NOT as an observed fix: do not drop them on the strength of a green
	 * suite, and do not claim more for them than this until something asserts it.
	 *
	 * @param options passes Live Preview's `AbortSignal` (its titles outlive the
	 * plugin); reading mode passes nothing because its title element is created and
	 * discarded with each render.
	 */
	static onTitleClick(title: HTMLElement, onClick: () => void, options?: AddEventListenerOptions): void {
		title.addEventListener(
			"click",
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				onClick();
			},
			options,
		);
	}

	/**
	 * The exact inverse of {@link markFoldable} + {@link ensureChevron}: leaves the
	 * embed as Obsidian rendered it. Lives here so it stays in lockstep with the
	 * injection above. Needed by Live Preview, whose embed DOM belongs to Obsidian
	 * and survives plugin unload; reading-mode DOM is re-created from scratch instead.
	 */
	static unmark(embed: HTMLElement): void {
		embed.classList.remove(EmbedFoldDom.CLS_FOLDABLE, EmbedFoldDom.CLS_FOLDED);
		embed.querySelector(`.${EmbedFoldDom.CLS_CHEVRON}`)?.remove();
	}
}
