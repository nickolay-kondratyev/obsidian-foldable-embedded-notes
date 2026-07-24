import { StateField } from "@codemirror/state";
import type { EditorState, Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";

/**
 * A line that is NOTHING BUT a marked embed: `![[target]]-`.
 *
 * WHY whole-line only (vs reading mode's "dash right after any `]]`"): in the editor
 * we only have raw text, and a raw-text scan cannot tell a real embed from one inside
 * a code span (`` `![[x]]-` ``); Obsidian's markdown syntax-tree node names are not
 * public API. A whole-line match cannot occur inside a code span, so this rule is safe
 * without one.
 *
 * WHY-NOT built by interpolating the reading-mode `FOLD_MARKER` constant: a literal
 * regex reads far better than one assembled from fragments, and the two parsers are
 * deliberately different rules — not one rule in two places.
 */
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-$/;

interface MarkedEmbedLine {
	/** Document position of the line start — the fold-state anchor. */
	readonly lineFrom: number;
	/** Document position of the marker dash (last character of the line). */
	readonly dashFrom: number;
}

/**
 * Every whole-line `![[x]]-` in the document, in document order.
 *
 * WHY `iterLines` with a running offset rather than indexed `doc.line(n)`: the indexed
 * form descends the document tree per line, so a full scan of a long note costs
 * O(n log n) on every keystroke; the cursor walks it once.
 */
function findMarkedEmbedLines(doc: Text): MarkedEmbedLine[] {
	const found: MarkedEmbedLine[] = [];
	let lineFrom = 0;
	for (const text of doc.iterLines()) {
		if (WHOLE_LINE_MARKED_EMBED.test(text)) {
			found.push({ lineFrom, dashFrom: lineFrom + text.length - 1 });
		}
		// +1 for the line break separating this line from the next.
		lineFrom += text.length + 1;
	}
	return found;
}

/**
 * The marked lines of the current document.
 *
 * WHY a StateField rather than scanning on demand: both the dash decoration (which
 * recomputes on every cursor move) and the view plugin's DOM sync need this answer.
 * Without caching, every arrow key would walk the whole document twice. Keyed off
 * `docChanged`, the scan runs only when it can actually change.
 */
export const markedEmbedLinesField = StateField.define<readonly MarkedEmbedLine[]>({
	create: (state) => findMarkedEmbedLines(state.doc),
	update: (lines, tr) => (tr.docChanged ? findMarkedEmbedLines(tr.state.doc) : lines),
});

/** Whether the line starting at `lineFrom` is a whole-line marked embed. */
export function isMarkedLine(state: EditorState, lineFrom: number): boolean {
	return state.field(markedEmbedLinesField).some((marked) => marked.lineFrom === lineFrom);
}

/**
 * Hides the marker dash so `![[x]]-` renders as a plain embed, except on the line the
 * cursor is on — the standard Live Preview convention of revealing raw syntax you are
 * editing.
 *
 * Gated on `editorLivePreviewField`: in plain Source mode the raw text must render
 * literally, dash included.
 */
export const markerDashDecoration = EditorView.decorations.compute(
	[markedEmbedLinesField, editorLivePreviewField, "selection"],
	(state) => {
		if (!state.field(editorLivePreviewField)) {
			return Decoration.none;
		}
		const cursorLines = new Set(state.selection.ranges.map((range) => state.doc.lineAt(range.head).number));
		const hidden = state
			.field(markedEmbedLinesField)
			.filter((marked) => !cursorLines.has(state.doc.lineAt(marked.lineFrom).number))
			.map((marked) => Decoration.replace({}).range(marked.dashFrom, marked.dashFrom + 1));
		return Decoration.set(hidden);
	},
);
