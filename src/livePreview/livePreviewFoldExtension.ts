import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { PluginValue, ViewUpdate } from "@codemirror/view";
import { EmbedFoldDom } from "../embedFoldDom";
import type { ReadSettings } from "../settings/foldableEmbedsSettings";
import { effectiveFold, explicitFoldField, foldStateExtension, setLineFold } from "./foldStateField";
import { markerDashDecoration } from "./markedEmbedLines";

/**
 * Projects the fold state onto Obsidian's embed widgets in the editor.
 *
 * The widget DOM is Obsidian's, rendered ASYNCHRONOUSLY and outside CM's update cycle,
 * so `update()` alone never sees a freshly loaded embed — a MutationObserver on
 * `contentDOM` is what actually drives (re)application. Because that DOM is Obsidian's
 * and is reused across edits, everything injected here is also removed in `destroy()`.
 */
class LivePreviewFoldView implements PluginValue {
	private readonly contentObserver: MutationObserver;
	/** One abort for every title listener this view added. */
	private readonly listeners = new AbortController();
	/**
	 * Titles already wired for clicks. Deliberately NOT inferred from "a chevron
	 * exists": a re-enabled plugin can meet a leftover chevron whose listener died
	 * with the previous view, and would then never rewire it.
	 */
	private readonly wiredTitles = new WeakSet<HTMLElement>();

	constructor(
		private readonly view: EditorView,
		private readonly readSettings: ReadSettings,
	) {
		// childList only, deliberately NOT attributes: our own writes are class
		// toggles (attribute mutations), so they cannot re-trigger this observer.
		// Chevron insertion IS a childList mutation and triggers exactly one extra
		// sync() pass, which finds everything already in place and mutates nothing —
		// self-terminating, not a loop.
		this.contentObserver = new MutationObserver(() => this.sync());
		this.contentObserver.observe(view.contentDOM, { childList: true, subtree: true });
		this.sync();
	}

	update(update: ViewUpdate): void {
		// Selection changes need no sync — the dash decoration handles the reveal.
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.state.field(explicitFoldField) !== update.startState.field(explicitFoldField)
		) {
			this.sync();
		}
	}

	destroy(): void {
		this.contentObserver.disconnect();
		this.listeners.abort();
		// Obsidian's embed DOM outlives this view (plugin disable/update, view
		// recreation). Leaving a chevron behind would make an embed LOOK foldable
		// while nothing is wired to fold it.
		for (const embed of this.topLevelEmbeds()) {
			EmbedFoldDom.unmark(embed);
		}
	}

	/** The single, idempotent write path from fold state to DOM. */
	private sync(): void {
		for (const embed of this.topLevelEmbeds()) {
			const title = this.noteEmbedTitle(embed);
			if (title === null) {
				continue;
			}
			const lineFrom = this.anchorLineStart(embed);
			if (lineFrom === null) {
				continue;
			}
			EmbedFoldDom.markFoldable(embed);
			const chevron = EmbedFoldDom.ensureChevron(title);
			if (!this.wiredTitles.has(title)) {
				EmbedFoldDom.onTitleClick(title, () => this.toggle(embed), { signal: this.listeners.signal });
				this.wiredTitles.add(title);
			}
			EmbedFoldDom.applyFoldState(embed, chevron, effectiveFold(this.view.state, lineFrom, this.readSettings()));
		}
	}

	private toggle(embed: HTMLElement): void {
		// Recompute: positions move as the document is edited.
		const lineFrom = this.anchorLineStart(embed);
		if (lineFrom === null) {
			return;
		}
		// Invert the STATE, never the DOM class: state is the single source of truth
		// and the DOM is only its projection.
		const folded = !effectiveFold(this.view.state, lineFrom, this.readSettings());
		this.view.dispatch({ effects: setLineFold.of({ lineFrom, folded }) });
	}

	/**
	 * The embeds this view owns: the ones written in THIS document, never those inside
	 * another embed's rendered body.
	 *
	 * WHY nested embeds are excluded: they live inside the outer embed's widget DOM, so
	 * `posAtDOM` resolves them to the OUTER embed's line — clicking a nested title would
	 * fold its parent, and both embeds would always share one fold state. They are also
	 * already the reading-mode post-processor's business (it renders every embed body),
	 * so skipping them here avoids double-wiring the same title too.
	 */
	private topLevelEmbeds(): HTMLElement[] {
		const all = Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>(EmbedFoldDom.SEL_INTERNAL_EMBED));
		return all.filter((embed) => !this.isNested(embed));
	}

	private isNested(embed: HTMLElement): boolean {
		const enclosingEmbed = embed.parentElement?.closest(EmbedFoldDom.SEL_INTERNAL_EMBED) ?? null;
		return enclosingEmbed !== null;
	}

	/**
	 * The title bar, but only once this embed is a resolved NOTE embed — the same rule
	 * reading mode applies, so the two modes agree on what "foldable" means. Doubles as
	 * the readiness gate: the title arrives asynchronously and the observer calls us back.
	 */
	private noteEmbedTitle(embed: HTMLElement): HTMLElement | null {
		if (!embed.classList.contains(EmbedFoldDom.CLS_MARKDOWN_EMBED)) {
			return null;
		}
		return embed.querySelector<HTMLElement>(EmbedFoldDom.SEL_EMBED_TITLE);
	}

	/**
	 * Fold-state anchor for an embed widget: the start of the line it sits on.
	 * `posAtDOM` on a widget is only LINE-accurate (an inline embed reports a few
	 * characters into its line), so two embeds on one line necessarily share fold
	 * state — a documented consequence, not a bug.
	 *
	 * @returns `null` when CM cannot map the element to a document position.
	 */
	private anchorLineStart(embed: HTMLElement): number | null {
		let pos: number;
		try {
			// THROWS (no sentinel return) when CM has no view desc covering this node —
			// reachable while Obsidian is mid-render of an embed widget, since that DOM is
			// created outside CM's update cycle. Swallowed: the observer re-syncs once the
			// widget is settled, and letting it escape `update()` would make CM6 deactivate
			// this whole ViewPlugin for the rest of the session.
			pos = this.view.posAtDOM(embed);
		} catch {
			return null;
		}
		return this.view.state.doc.lineAt(pos).from;
	}
}

/**
 * Everything needed to make `![[note]]` embeds foldable in Live Preview.
 *
 * `readSettings` is called at SYNC time, not captured here: the extension is registered
 * once at plugin load, while the "start collapsed" setting can change at any moment, and
 * a value read now would freeze it. Deliberately NOT a CM6 `Compartment` — already-open
 * editors are not required to re-fold the instant the setting flips; the next render
 * (reopen, mode switch, any edit) picks it up.
 */
export function livePreviewFoldExtension(readSettings: ReadSettings): Extension {
	return [
		foldStateExtension,
		markerDashDecoration,
		ViewPlugin.define((view) => new LivePreviewFoldView(view, readSettings)),
	];
}
