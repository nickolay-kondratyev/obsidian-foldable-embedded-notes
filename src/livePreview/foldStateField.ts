import { MapMode, RangeSet, RangeValue, StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { foldedByDefault } from "../settings/foldableEmbedsSettings";
import type { FoldableEmbedsSettings } from "../settings/foldableEmbedsSettings";
import { isMarkedLine, markedEmbedLinesField } from "./markedEmbedLines";

/** An explicit (user-clicked) fold choice, anchored at a line start. */
class ExplicitFold extends RangeValue {
	/**
	 * A fold anchor must DIE with the line it belongs to. `RangeValue`'s default
	 * (`TrackDel`) drops a zero-length anchor only when a deletion spans strictly ACROSS
	 * it, so deleting the anchor's own line — a deletion STARTING at the anchor, i.e.
	 * Obsidian's "delete line" — left it alive on whatever line moved up, silently folding
	 * the NEXT embed. `TrackAfter` drops it as soon as a deletion consumes the character
	 * AFTER the anchor, which is exactly "its line is gone".
	 *
	 * WHY-NOT `TrackBefore`/`TrackDel`: both keep the anchor here. And `TrackAfter` is inert
	 * for an INSERTION at the anchor (`endA == pos`), so typing at the start of a folded
	 * embed's line still keeps its fold — see {@link explicitFoldAt}.
	 */
	override readonly mapMode = MapMode.TrackAfter;

	constructor(readonly folded: boolean) {
		super();
	}
}

/** Fold state is per LINE — see {@link explicitFoldAt} for WHY. */
export interface LineFoldToggle {
	readonly lineFrom: number;
	readonly folded: boolean;
}

export const setLineFold = StateEffect.define<LineFoldToggle>();

/**
 * Explicit fold choices for the current document, per session and per editor view.
 *
 * WHY a StateField: its positions are mapped through every document change, so a fold
 * follows its embed when text is inserted or removed above it. That mapping is the
 * entire reason this is CM state rather than a plain `Map`.
 */
export const explicitFoldField = StateField.define<RangeSet<ExplicitFold>>({
	create: () => RangeSet.empty,
	update(set, tr) {
		let mapped = set.map(tr.changes);
		for (const effect of tr.effects) {
			if (!effect.is(setLineFold)) {
				continue;
			}
			// `lineFrom` is computed against the PRE-transaction document, so it must be
			// mapped before it is resolved against the post-transaction one. A no-op for
			// today's effect-only dispatch; correct for any caller that bundles a change.
			const line = tr.state.doc.lineAt(tr.changes.mapPos(effect.value.lineFrom));
			mapped = mapped.update({
				// Line-RANGE filter, not `from !== lineFrom`: an anchor can drift within
				// its own line when text is inserted at the line start (see explicitFoldAt).
				filter: (from) => from < line.from || from > line.to,
				add: [new ExplicitFold(effect.value.folded).range(line.from, line.from)],
			});
		}
		return mapped;
	},
});

/**
 * The user's explicit fold choice for the line containing `lineFrom`, or `undefined`
 * when they have not toggled it (deliberately the same convention as
 * `FoldStateStore.get` in reading mode).
 *
 * WHY the whole line rather than an exact position match: fold state IS per line (the
 * editor can only tell us which LINE a widget sits on), and a zero-length anchor maps
 * to AFTER text inserted at the line start — an exact-position lookup would silently
 * lose the fold the moment someone types at the start of the line.
 */
function explicitFoldAt(state: EditorState, lineFrom: number): boolean | undefined {
	const line = state.doc.lineAt(lineFrom);
	let found: boolean | undefined = undefined;
	state.field(explicitFoldField).between(line.from, line.to, (_from, _to, value) => {
		found = value.folded;
		return false;
	});
	return found;
}

/**
 * THE fold rule: an explicit user choice wins over the default (the `![[x]]-` marker,
 * or every embed once "start embedded notes collapsed" is on).
 *
 * This answers "what should be RENDERED", and is used only by the DOM sync. The click
 * handler deliberately does NOT invert it — it inverts the projection that sync last
 * wrote (`EmbedFoldDom.isFolded`), because the default term can change under an
 * already-rendered pane and inverting a value the user never saw makes the click dead.
 */
export function effectiveFold(state: EditorState, lineFrom: number, settings: FoldableEmbedsSettings): boolean {
	return explicitFoldAt(state, lineFrom) ?? foldedByDefault(settings, isMarkedLine(state, lineFrom));
}

/** Everything the fold rule reads; register as one unit. */
export const foldStateExtension = [markedEmbedLinesField, explicitFoldField];
