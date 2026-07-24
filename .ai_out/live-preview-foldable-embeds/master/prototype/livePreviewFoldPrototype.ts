import { RangeSet, RangeValue, StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { setIcon } from "obsidian";

/**
 * THROWAWAY PROTOTYPE (ticket: explore-foldable-embeds-in-live-preview-editing-mode).
 *
 * Proves/disproves that Live Preview foldable embeds are implementable without hacks:
 *  - fold state as a CM6 StateField (positions map through edits automatically),
 *  - the `-` fold marker hidden with a replace decoration (revealed when the
 *    cursor is on that line, the standard Live Preview convention),
 *  - the fold itself applied as CSS classes on Obsidian's embed widget DOM,
 *    re-applied on every view update + when the async embed finishes loading.
 */

const CLS_FOLDABLE = "fen-embed";
const CLS_FOLDED = "fen-folded";
const CLS_CHEVRON = "fen-collapse-icon";
const CLS_COLLAPSED = "is-collapsed";
const CHEVRON_ICON = "right-triangle";

const SEL_EMBED = ".internal-embed.markdown-embed";
const SEL_EMBED_TITLE = ".markdown-embed-title";

/**
 * A line that is NOTHING BUT a marked embed: `![[target]]-`.
 * WHY whole-line (vs reading mode's "dash right after any `]]`"): a raw-text
 * scan of the document cannot tell a real embed from one inside a code span
 * (`` `![[x]]-` ``), and Obsidian's markdown syntax-tree node names are not
 * public API. A whole-line match cannot occur inside a code span.
 */
const MARKED_EMBED_LINE = /^!\[\[[^\]\n]+\]\]-$/;

/** Explicit (user-clicked) fold state, anchored at the embed's start position. */
class ExplicitFold extends RangeValue {
	constructor(readonly folded: boolean) {
		super();
	}
}

const toggleFold = StateEffect.define<{ pos: number; folded: boolean }>();

const foldStateField = StateField.define<RangeSet<ExplicitFold>>({
	create: () => RangeSet.empty,
	update(set, tr) {
		// Positions follow the text through edits — the whole reason this is a StateField.
		let mapped = set.map(tr.changes);
		for (const effect of tr.effects) {
			if (!effect.is(toggleFold)) {
				continue;
			}
			const { pos, folded } = effect.value;
			const kept: { from: number; value: ExplicitFold }[] = [];
			const iter = mapped.iter();
			while (iter.value !== null) {
				if (iter.from !== pos) {
					kept.push({ from: iter.from, value: iter.value });
				}
				iter.next();
			}
			kept.push({ from: pos, value: new ExplicitFold(folded) });
			kept.sort((a, b) => a.from - b.from);
			mapped = RangeSet.of(kept.map((k) => k.value.range(k.from, k.from)));
		}
		return mapped;
	},
});

interface MarkedEmbedLine {
	/** Document position of the line start — the fold-state anchor. */
	readonly lineFrom: number;
	/** Document position of the marker dash (last char of the line). */
	readonly dashFrom: number;
}

/** Every whole-line `![[x]]-` in the document. */
function findMarkedEmbedLines(state: { doc: { lines: number; line: (n: number) => { from: number; to: number; text: string } } }): MarkedEmbedLine[] {
	const found: MarkedEmbedLine[] = [];
	for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
		const line = state.doc.line(lineNumber);
		if (MARKED_EMBED_LINE.test(line.text)) {
			found.push({ lineFrom: line.from, dashFrom: line.to - 1 });
		}
	}
	return found;
}

/** Hides the marker dash, except on the line the cursor is on (LP reveal convention). */
const markerDecorations = EditorView.decorations.compute(["doc", "selection"], (state): DecorationSet => {
	const cursorLines = new Set(state.selection.ranges.map((r) => state.doc.lineAt(r.head).number));
	const hidden = findMarkedEmbedLines(state)
		.filter((marked) => !cursorLines.has(state.doc.lineAt(marked.dashFrom).number))
		.map((marked) => Decoration.replace({}).range(marked.dashFrom, marked.dashFrom + 1));
	return Decoration.set(hidden);
});

/** Fold-state anchor for an embed widget: the start of the line it lives on. */
function anchorPosition(view: EditorView, embed: HTMLElement): number {
	return view.state.doc.lineAt(view.posAtDOM(embed)).from;
}

/** Applies fold classes to Obsidian's embed widgets and wires title clicks. */
class LivePreviewFoldView {
	private readonly observers = new Set<MutationObserver>();
	/**
	 * Obsidian renders embed widgets ASYNCHRONOUSLY, outside CM's update cycle,
	 * so `update()` alone never sees them. This observer is what actually drives
	 * (re)application after a widget appears or is recycled by the viewport.
	 */
	private readonly contentObserver: MutationObserver;

	constructor(private readonly view: EditorView) {
		this.contentObserver = new MutationObserver(() => this.sync());
		this.contentObserver.observe(view.contentDOM, { childList: true, subtree: true });
		this.sync();
	}

	update(update: ViewUpdate): void {
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.state.field(foldStateField) !== update.startState.field(foldStateField)
		) {
			this.sync();
		}
	}

	destroy(): void {
		this.contentObserver.disconnect();
		for (const observer of this.observers) {
			observer.disconnect();
		}
		this.observers.clear();
	}

	private sync(): void {
		const markerLineStarts = new Set(findMarkedEmbedLines(this.view.state).map((marked) => marked.lineFrom));
		for (const embed of Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>(SEL_EMBED))) {
			this.whenTitleReady(embed, (title) => this.applyTo(embed, title, markerLineStarts));
		}
	}

	private applyTo(embed: HTMLElement, title: HTMLElement, markerLineStarts: Set<number>): void {
		// posAtDOM on a widget is only line-accurate (verified: an inline embed
		// reports a few chars into its line), so fold state is anchored at the
		// LINE START — embeds sharing a line therefore share fold state.
		const pos = anchorPosition(this.view, embed);
		const folded = this.explicitFoldAt(pos) ?? markerLineStarts.has(pos);

		embed.classList.add(CLS_FOLDABLE);
		const chevron = title.querySelector<HTMLElement>(`.${CLS_CHEVRON}`) ?? this.wireTitle(embed, title);
		embed.classList.toggle(CLS_FOLDED, folded);
		chevron.classList.toggle(CLS_COLLAPSED, folded);
	}

	/**
	 * First-time setup for a title bar: chevron + click-to-fold.
	 * WHY a direct listener (and not `EditorView.domEventHandlers`): Obsidian's own
	 * embed-title handling swallows the event before it reaches CM's contentDOM.
	 */
	private wireTitle(embed: HTMLElement, title: HTMLElement): HTMLElement {
		const chevron = title.createSpan({ cls: CLS_CHEVRON, prepend: true });
		setIcon(chevron, CHEVRON_ICON);
		title.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.view.dispatch({
				effects: toggleFold.of({
					pos: anchorPosition(this.view, embed),
					folded: !embed.classList.contains(CLS_FOLDED),
				}),
			});
		});
		return chevron;
	}

	private explicitFoldAt(pos: number): boolean | null {
		let result: boolean | null = null;
		this.view.state.field(foldStateField).between(pos, pos, (_from, _to, value) => {
			result = value.folded;
			return false;
		});
		return result;
	}

	/** Embeds load async: the `.internal-embed` div exists before its title bar does. */
	private whenTitleReady(embed: HTMLElement, onReady: (title: HTMLElement) => void): void {
		const title = embed.querySelector<HTMLElement>(SEL_EMBED_TITLE);
		if (title !== null) {
			onReady(title);
			return;
		}
		const observer = new MutationObserver(() => {
			const readyTitle = embed.querySelector<HTMLElement>(SEL_EMBED_TITLE);
			if (readyTitle !== null) {
				observer.disconnect();
				this.observers.delete(observer);
				onReady(readyTitle);
			}
		});
		this.observers.add(observer);
		observer.observe(embed, { childList: true, subtree: true });
	}
}

const foldViewPlugin = ViewPlugin.fromClass(LivePreviewFoldView);

export function livePreviewFoldPrototype(): Extension {
	return [foldStateField, markerDecorations, foldViewPlugin];
}
