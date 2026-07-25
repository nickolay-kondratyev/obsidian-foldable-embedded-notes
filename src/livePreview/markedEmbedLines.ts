import { StateField } from "@codemirror/state";
import type { EditorState, Line, Text } from "@codemirror/state";
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
 *
 * WHY blanks are tolerated after the dash: reading mode accepts `![[x]]- ` (its marker
 * may be followed by whitespace), and a stray trailing space is INVISIBLE — requiring the
 * dash to be the literal last character made the feature die silently in one mode only.
 */
// `![[` target `]]`, the marker dash, then nothing but spaces/tabs to end of line.
const WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/;

interface MarkedEmbedLine {
	/** Document position of the line start — the fold-state anchor. */
	readonly lineFrom: number;
	/** Document position of the marker dash. */
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
			// The marker dash is the line's LAST `-`, since the regex allows nothing but
			// blanks after it. NOT `text.length - 1`: trailing blanks push that past the dash.
			found.push({ lineFrom, dashFrom: lineFrom + text.lastIndexOf("-") });
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
 * Whether any selection range touches `line` — a bare cursor sitting on it included, since a
 * cursor is an empty range.
 *
 * WHY the whole SPAN of each range and not just its `head` (the moving end): Obsidian itself
 * reveals its own raw `![[x]]` on every line a selection covers, so a dash left hidden there
 * would make the displayed source contradict the file — and would hide a character sitting
 * inside what the user is about to type over.
 *
 * WHY-NOT `anchor`/`head`: those are direction-dependent, `from`/`to` are always ordered.
 *
 * WHY-NOT collecting the touched line NUMBERS into a set: that costs one entry per selected
 * line (select-all in a long note = one per document line) on every decoration rebuild, while
 * the question actually asked is per MARKED line — of which there are few.
 */
function isTouchedBySelection(state: EditorState, line: Line): boolean {
	// The standard CM6 overlap test. Inclusive at both ends, so a range ending exactly at a
	// line start counts as touching it — the same answer `lineAt(range.to)` gave.
	return state.selection.ranges.some((range) => range.from <= line.to && range.to >= line.from);
}

/**
 * Hides the marker dash so `![[x]]-` renders as a plain embed, except on the lines the
 * selection touches — the standard Live Preview convention of revealing raw syntax you are
 * editing.
 *
 * Gated on `editorLivePreviewField`: in plain Source mode the raw text must render
 * literally, dash included.
 *
 * Hides EXACTLY the dash, never the blanks a line may carry after it — reading mode also
 * strips only the dash from the text node and leaves the whitespace verbatim.
 */
export const markerDashDecoration = EditorView.decorations.compute(
	[markedEmbedLinesField, editorLivePreviewField, "selection"],
	(state) => {
		if (!state.field(editorLivePreviewField)) {
			return Decoration.none;
		}
		const hidden = state
			.field(markedEmbedLinesField)
			.filter((marked) => !isTouchedBySelection(state, state.doc.lineAt(marked.lineFrom)))
			.map((marked) => Decoration.replace({}).range(marked.dashFrom, marked.dashFrom + 1));
		return Decoration.set(hidden);
	},
);
