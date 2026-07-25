import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { CLS_FOLDED, expectFolded } from "./foldAssertions";
import { ObsidianHarness } from "./obsidianHarness";

/**
 * Live Preview foldable-embed feature, driven against a REAL Obsidian.
 *
 * Fixture `lp-embeds.md` (see LINE_* constants for the 0-based line numbers):
 *   `![[child]]`                   → embed #0, unmarked. A line that is NOTHING BUT an
 *                                    embed becomes a BLOCK widget: Obsidian replaces the
 *                                    whole `.cm-line`, so this embed is a direct child of
 *                                    `.cm-content` and has no `.cm-line` ancestor.
 *   `![[child]]-`                  → embed #1, whole-line marker → folded by default.
 *                                    The trailing dash keeps the line from being a pure
 *                                    embed line, so this one renders INSIDE its `.cm-line`.
 *   `Inline ![[child]]- tail text.` → embed #2, mid-paragraph marker: deliberately NOT a
 *                                    fold marker in Live Preview (see AC3) — the dash stays
 *                                    literal and the embed is unfolded.
 *   A code-span `![[child]]-`      → no embed widget at all; text stays literal.
 *   `![[child]]- ` (+ one space)  → embed #3, whole-line marker followed by an INVISIBLE
 *                                    trailing space: still a marker (reading mode accepts
 *                                    it too), and only the dash is hidden.
 *
 * ONE Obsidian instance and ONE fresh vault copy PER SPEC FILE (`ObsidianHarness.launch`
 * re-seeds the copy and spawns its own app), so nothing here can leak into another spec.
 * Within this file tests are serial and build on earlier fold interactions. The config's
 * `workers: 1` + `fullyParallel: false` is load-bearing: two Obsidian instances would
 * otherwise fight over the same vault-copy and sandbox-config directories.
 *
 * No fixed sleeps anywhere — embeds render asynchronously, so every assertion is
 * web-first (`expect`/`expect.poll`).
 */

test.describe.configure({ mode: "serial" });

const NOTE_PATH = "lp-embeds.md";
/** The one space after the marker dash on `LINE_TRAILING_SPACE_MARKED`, spelled out. */
const TRAILING_SPACE = " ";
const NOTE_CONTENT = [
	"# Live preview parent", // 0
	"", // 1
	"![[child]]", // 2
	"", // 3
	"![[child]]-", // 4
	"", // 5
	"Inline ![[child]]- tail text.", // 6
	"", // 7
	"A code-span mention of `![[child]]-` stays literal.", // 8
	"", // 9
	// APPENDED at the end on purpose: every LINE_* / EMBED_* constant above keeps its value.
	`![[child]]-${TRAILING_SPACE}`, // 10
	"", // 11
].join("\n");

/** A note embedding another note, which itself embeds one — the NESTED-embed fixture. */
const NESTED_PARENT_PATH = "lp-nested.md";
const NESTED_CHILD_NAME = "lp-nested-child";
const NESTED_GRANDCHILD_NAME = "sibling";
const NESTED_FIXTURES = {
	[NESTED_PARENT_PATH]: `# Nested parent\n\n![[${NESTED_CHILD_NAME}]]\n`,
	[`${NESTED_CHILD_NAME}.md`]: `# Nested child\n\nBody before the nested embed.\n\n![[${NESTED_GRANDCHILD_NAME}]]\n`,
};

/**
 * A note with two ADJACENT whole-line embeds — the shape that exposes fold-anchor
 * lifetime. Its own file because `lp-embeds.md` separates its embeds with blank lines:
 * deleting one embed's line there moves a BLANK line onto the freed anchor, which proves
 * nothing about the next embed.
 */
const DELETE_LINE_PATH = "lp-delete-line.md";
const DELETE_LINE_FIRST_EMBED = "child";
const DELETE_LINE_SECOND_EMBED = "sibling";
const DELETE_LINE_FIRST_TEXT = `![[${DELETE_LINE_FIRST_EMBED}]]`;
const DELETE_LINE_CONTENT = [
	"# Delete line parent", // 0
	"", // 1
	DELETE_LINE_FIRST_TEXT, // 2
	`![[${DELETE_LINE_SECOND_EMBED}]]`, // 3
	"", // 4
	"Tail text.", // 5
].join("\n");

const LINE_UNMARKED = 2;
const LINE_MARKED = 4;
const LINE_ELSEWHERE = 0;
/** The lines bracketing `LINE_MARKED` — a selection between them touches it via NEITHER endpoint. */
const LINE_ABOVE_MARKED = LINE_MARKED - 1;
const LINE_BELOW_MARKED = LINE_MARKED + 1;
/**
 * Valid only while the document still has its original line numbering — the tests using it
 * all run BEFORE the one that inserts lines above it.
 */
const LINE_TRAILING_SPACE_MARKED = 10;

/** Document order of the four embed widgets in `.cm-content`. */
const EMBED_UNMARKED = 0;
const EMBED_MARKED = 1;
const EMBED_INLINE_MARKED = 2;
const EMBED_TRAILING_SPACE_MARKED = 3;
const EMBED_COUNT = 4;
/** Fixture lines carrying a whole-line fold marker: `LINE_MARKED` + `LINE_TRAILING_SPACE_MARKED`. */
const MARKED_LINE_COUNT = 2;

const CLS_FOLDABLE = "fen-embed";
const CLS_COLLAPSED = "is-collapsed";
const COLLAPSED_RE = new RegExp(`\\b${CLS_COLLAPSED}\\b`);

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			[NOTE_PATH]: NOTE_CONTENT,
			[DELETE_LINE_PATH]: DELETE_LINE_CONTENT,
			...NESTED_FIXTURES,
		},
	});
	page = harness.page;
	await harness.openFile(NOTE_PATH);
	await harness.setMarkdownViewMode("source");
	// Live Preview is a flavour of EDITING mode, so enter editing mode first.
	await harness.setLivePreviewEnabled(true);
	await expect(embeds().nth(EMBED_TRAILING_SPACE_MARKED)).toBeAttached();
});

test.afterAll(async () => {
	await harness?.close();
});

/** Embeds the plugin has wired, in document order, inside the editor. */
function embeds(): Locator {
	return page.locator(`.cm-content .internal-embed.${CLS_FOLDABLE}`);
}

/** The two readings of an embed's `.cm-line` that the assertions below need. */
interface EmbedLineText {
	/** Everything the line renders, the embed's own body included. */
	readonly whole: string;
	/** Only what is rendered AFTER the embed widget — the raw markdown tail. */
	readonly afterEmbed: string;
}

/**
 * Both readings of the `.cm-line` holding the nth embed, taken in ONE `page.evaluate` because
 * the relationship (`closest(".cm-line")`) has no locator equivalent — and so the DOM
 * contract below is stated exactly ONCE. Callers poll it via `expect.poll`, so decoration
 * updates are awaited rather than slept on.
 *
 * THROWS when the embed has no `.cm-line` ancestor (i.e. Obsidian turned it into a BLOCK
 * widget): returning `""` there would silently satisfy every "the dash is hidden"
 * assertion, so a DOM-shape change must fail loudly instead.
 */
function embedLineText(nth: number): Promise<EmbedLineText> {
	return embeds()
		.nth(nth)
		.evaluate((el) => {
			const line = el.closest(".cm-line");
			if (line === null) {
				throw new Error("e2e: embed has no .cm-line ancestor (block widget?) — assertion would be vacuous");
			}
			const nodes = Array.from(line.childNodes);
			const widgetIndex = nodes.findIndex((node) => node.contains(el));
			return {
				whole: line.textContent ?? "",
				afterEmbed: nodes
					.slice(widgetIndex + 1)
					.map((node) => node.textContent ?? "")
					.join(""),
			};
		});
}

/** Text of the `.cm-line` holding the nth embed. */
function lineTextOfEmbed(nth: number): Promise<string> {
	return embedLineText(nth).then((text) => text.whole);
}

/** Whether the embed's line still renders a trailing marker dash. */
function lineEndsWithDash(nth: number): Promise<boolean> {
	return lineTextOfEmbed(nth).then((text) => text.trimEnd().endsWith("-"));
}

/**
 * The raw markdown rendered AFTER the nth embed on its line, character for character.
 *
 * WHY not `lineTextOfEmbed` + `trimEnd()`: trimming cannot tell "dash hidden, trailing space
 * still rendered" from "dash AND space both hidden" — and which characters the hiding
 * decoration covers is exactly what the trailing-space tests are about. Taking the line
 * nodes that FOLLOW the embed's widget also drops the embed's own rendered text, which
 * would otherwise swamp an exact comparison.
 */
function markdownAfterEmbed(nth: number): Promise<string> {
	return embedLineText(nth).then((text) => text.afterEmbed);
}

test("unmarked embed renders unfolded, with a visible body and a chevron", async () => {
	const unmarked = embeds().nth(EMBED_UNMARKED);
	await expectFolded(unmarked, false);
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeVisible();
	await expect(unmarked.locator(".fen-collapse-icon svg")).toBeAttached();
});

test("clicking the title folds the unmarked embed, clicking again unfolds it", async () => {
	const unmarked = embeds().nth(EMBED_UNMARKED);
	const title = unmarked.locator(".markdown-embed-title");

	await title.click();
	await expectFolded(unmarked, true);
	// Prove the CSS collapses the RIGHT element, not merely that a class is present.
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeHidden();
	await expect(unmarked.locator(".fen-collapse-icon")).toHaveClass(COLLAPSED_RE);

	await title.click();
	await expectFolded(unmarked, false);
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeVisible();
});

test("whole-line `![[child]]-` folds by default with the dash hidden", async () => {
	const marked = embeds().nth(EMBED_MARKED);
	await expectFolded(marked, true);
	await expect(marked.locator(".markdown-embed-content").first()).toBeHidden();
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(false);
});

test("the FIRST click on a default-folded marked embed UNFOLDS it", async () => {
	const marked = embeds().nth(EMBED_MARKED);
	await expectFolded(marked, true);

	await marked.locator(".markdown-embed-title").click();

	// Guards the `effectiveFold` rule: toggling must invert the EFFECTIVE state
	// (marker default included), not an absent explicit state — otherwise the first
	// click would dispatch "fold" on an already-folded embed and look dead.
	await expectFolded(marked, false);
});

test("the marker dash is revealed while the cursor is on its line", async () => {
	await harness.setCursor(LINE_MARKED, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(true);

	await harness.setCursor(LINE_ELSEWHERE, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(false);
});

/**
 * A selection covering the marked line must reveal the dash even though neither of its ends
 * sits on that line: Obsidian itself un-hides the raw `![[child]]` of any line a selection
 * touches, so leaving the dash hidden would display source text the file does not hold — and
 * the invisible dash would sit inside what the user is about to type over.
 */
test("the marker dash is revealed while a selection spans its line", async () => {
	await harness.setSelection({ line: LINE_ABOVE_MARKED, ch: 0 }, { line: LINE_BELOW_MARKED, ch: 0 });
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(true);

	await harness.setCursor(LINE_ELSEWHERE, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(false);
});

test("a BACKWARDS selection spanning the marked line reveals the dash too", async () => {
	// Dragging upwards puts `head` before `anchor`; reveal must key off the range's span.
	await harness.setSelection({ line: LINE_BELOW_MARKED, ch: 0 }, { line: LINE_ABOVE_MARKED, ch: 0 });
	// Without this, a normalising `setSelection` would make this a silent duplicate of the
	// forward test: the reveal would be proven, the BACKWARDS part of the name would not.
	expect(await harness.getSelectionHead()).toEqual({ line: LINE_ABOVE_MARKED, ch: 0 });
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(true);

	await harness.setCursor(LINE_ELSEWHERE, 0);
	await expect.poll(() => lineEndsWithDash(EMBED_MARKED)).toBe(false);
});

test("`![[child]]- ` with a trailing space still folds by default", async () => {
	// A trailing space is invisible, so a marker that only works without one fails silently.
	// Reading mode has always accepted it; Live Preview must agree.
	await expectFolded(embeds().nth(EMBED_TRAILING_SPACE_MARKED), true);
});

test("only the dash is hidden on a marked line — its trailing space survives", async () => {
	// The hiding decoration must cover EXACTLY the dash, matching reading mode (which strips
	// the dash from the text node and leaves following whitespace verbatim). Asserted by exact
	// text, since a `trimEnd()`-based check passes whether or not the space was swallowed too.
	await expect.poll(() => markdownAfterEmbed(EMBED_TRAILING_SPACE_MARKED)).toBe(TRAILING_SPACE);

	// ...and the reveal-while-editing path shows the dash back in its real place.
	await harness.setCursor(LINE_TRAILING_SPACE_MARKED, 0);
	await expect.poll(() => markdownAfterEmbed(EMBED_TRAILING_SPACE_MARKED)).toBe(`-${TRAILING_SPACE}`);

	await harness.setCursor(LINE_ELSEWHERE, 0);
});

test("a mid-paragraph `![[child]]-` is foldable but keeps its literal dash", async () => {
	const inlineMarked = embeds().nth(EMBED_INLINE_MARKED);
	// AC3: only a WHOLE-LINE marker folds by default in Live Preview. The embed is
	// still click-foldable; only the fold-by-default marker is inert here.
	await expectFolded(inlineMarked, false);
	await expect.poll(() => lineTextOfEmbed(EMBED_INLINE_MARKED)).toContain("- tail text.");

	await inlineMarked.locator(".markdown-embed-title").click();
	await expectFolded(inlineMarked, true);
	await inlineMarked.locator(".markdown-embed-title").click();
	await expectFolded(inlineMarked, false);
});

test("fold state survives an edit that shifts every position below it", async () => {
	await embeds().nth(EMBED_UNMARKED).locator(".markdown-embed-title").click();
	await expectFolded(embeds().nth(EMBED_UNMARKED), true);
	// The MARKED embed was explicitly UNfolded by an earlier test. Keeping it that way is
	// the falsifiable direction: its marker default is "folded", so if the edit lost the
	// explicit anchor the fold rule would fall back to the marker and re-fold it.
	// (Re-folding it here instead would assert nothing — explicit and default would agree.)
	await expectFolded(embeds().nth(EMBED_MARKED), false);

	await harness.replaceRange("inserted\n\n", { line: LINE_UNMARKED, ch: 0 });

	await expectFolded(embeds().nth(EMBED_UNMARKED), true);
	await expectFolded(embeds().nth(EMBED_MARKED), false);
});

test("typing at the START of a folded embed's line keeps its fold state", async () => {
	// Re-fold the marked embed (the previous test deliberately left it unfolded).
	await embeds().nth(EMBED_MARKED).locator(".markdown-embed-title").click();
	await expectFolded(embeds().nth(EMBED_MARKED), true);
	// The fold anchor is a zero-length position at the line start; text inserted there
	// maps the anchor AFTER the inserted text, so the lookup must be line-RANGE based.
	const markedLine = await currentLineOf("![[child]]-");
	await harness.replaceRange("x", { line: markedLine, ch: 0 });
	await expectFolded(embeds().nth(EMBED_MARKED), true);

	// Restore the line: `x![[child]]-` is (correctly) no longer a whole-line marker,
	// so leaving it would silently disarm the marker for every later test.
	await harness.replaceRange("", { line: markedLine, ch: 0 }, { line: markedLine, ch: 1 });
	await expectFolded(embeds().nth(EMBED_MARKED), true);
});

test("a code-span `![[child]]-` produces no embed widget and stays literal", async () => {
	await expect(embeds()).toHaveCount(EMBED_COUNT);
	const codeSpanLineText = await page.evaluate(() => {
		const lines = Array.from(document.querySelectorAll(".cm-content .cm-line"));
		return lines.map((line) => line.textContent ?? "").find((text) => text.includes("stays literal")) ?? "";
	});
	expect(codeSpanLineText).toContain("![[child]]-");
});

test("disabling the plugin strips its injected DOM, and re-enabling rewires clicks", async () => {
	// Baseline: the injected marks are really there before the plugin goes away.
	await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).not.toHaveCount(0);

	await harness.setPluginEnabled(false);

	// Asserted BEFORE any view rebuild (which would restore pristine DOM on its own and
	// hide a leaky teardown): Obsidian's embed DOM is REUSED across plugin unload, so
	// destroy() must leave it exactly as Obsidian rendered it.
	await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).toHaveCount(0);
	await expect(page.locator(".cm-content .fen-collapse-icon")).toHaveCount(0);

	await harness.setPluginEnabled(true);
	// Re-enter editing mode: the reloaded plugin's editor extension attaches to
	// freshly built editor views.
	await harness.setMarkdownViewMode("preview");
	await harness.setMarkdownViewMode("source");
	await expect(embeds().nth(EMBED_UNMARKED)).toBeAttached();

	// Fold state is per-view CM state, so a reload starts clean: the unmarked embed is
	// unfolded again and one click must fold it (proving the title was really rewired).
	await expectFolded(embeds().nth(EMBED_UNMARKED), false);
	await embeds().nth(EMBED_UNMARKED).locator(".markdown-embed-title").click();
	await expectFolded(embeds().nth(EMBED_UNMARKED), true);
});

test("in plain Source mode the marker dash renders literally", async () => {
	// Park the cursor off the marked line: a cursor ON it reveals the dash anyway
	// (see the reveal test), which would make the assertion below tautological.
	await harness.setCursor(LINE_ELSEWHERE, 0);
	// Baseline — in Live Preview the plugin hides EVERY marker dash in this note.
	await expect.poll(linesEndingWithDash).toBe(0);

	await harness.setLivePreviewEnabled(false);

	// Source mode must render raw markdown verbatim, so the plugin's dash-hiding
	// decoration is gated on `editorLivePreviewField`. Counted over `.cm-line` text
	// rather than matched against the literal `![[child]]-` so the assertion does not
	// also encode how Obsidian itself renders (or stops rendering) the embed widget.
	await expect.poll(linesEndingWithDash).toBe(MARKED_LINE_COUNT);
});

test("clicking a NESTED embed's title never folds the embed it sits inside", async () => {
	await harness.openFile(NESTED_PARENT_PATH);
	await harness.setMarkdownViewMode("source");
	await harness.setLivePreviewEnabled(true);

	const outer = page.locator(`.cm-content .internal-embed[src="${NESTED_CHILD_NAME}"]`);
	const nested = outer.locator(`.internal-embed[src="${NESTED_GRANDCHILD_NAME}"]`);
	await expect(nested.locator(".markdown-embed-title")).toBeAttached();
	await expectFolded(outer, false);

	await nested.locator(".markdown-embed-title").click();

	// `posAtDOM` on a nested embed resolves to the position of the OUTER embed's widget,
	// i.e. the outer line — so an unscoped Live Preview sync would fold the PARENT here.
	await expectFolded(outer, false);
	// The nested embed still folds: an embed BODY is rendered through the markdown
	// post-processor even inside the editor, so the reading-mode path owns it — which is
	// exactly why Live Preview must leave nested embeds alone rather than wire them twice.
	await expectFolded(nested, true);

	// ...and the outer embed itself is still foldable by its own title.
	await outer.locator(".markdown-embed-title").first().click();
	await expectFolded(outer, true);
});

/**
 * Teardown of the marks the READING-MODE post-processor puts on embeds NESTED inside Live
 * Preview widget DOM. That DOM is Obsidian's and is REUSED across a plugin unload (unlike a
 * real reading view, which Obsidian discards wholesale), so nothing cleans it up for us:
 * without an explicit removal path the disabled plugin leaves a stray chevron behind, keeps
 * folding through a zombie listener, and blocks its own successor from rewiring.
 */
test("disabling the plugin strips its injected DOM from NESTED embeds, and re-enabling rewires them", async () => {
	await harness.openFile(NESTED_PARENT_PATH);
	await harness.setMarkdownViewMode("source");
	await harness.setLivePreviewEnabled(true);
	// Baseline: the nested embed really is wired before the plugin goes away.
	await expect(nestedEmbed().locator(".fen-collapse-icon")).toBeAttached();

	await harness.setPluginEnabled(false);

	// Asserted BEFORE any view rebuild (which would restore pristine DOM on its own and hide
	// a leaky teardown). Counted over the WHOLE editor, so the nested embed is included.
	await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).toHaveCount(0);
	await expect(page.locator(".cm-content .fen-collapse-icon")).toHaveCount(0);
	await expect(page.locator(`.cm-content .${CLS_FOLDED}`)).toHaveCount(0);

	// No zombie listener: with the plugin off, the nested title behaves as unpatched
	// Obsidian — the click folds nothing, and nothing swallows its default action.
	expect(await clickNestedTitleInPage()).toEqual({ folded: false, defaultPrevented: false });

	await harness.setPluginEnabled(true);
	// Leave the note and come back: MEASURED against Obsidian 1.12.7, a preview/source
	// round trip REUSES an already-rendered embed body, so the reloaded plugin's
	// post-processor is never invoked over it — only reopening the note renders it afresh.
	// (That is the plugin's documented rule everywhere: a change lands on the NEXT render.)
	await harness.openFile(NOTE_PATH);
	await harness.openFile(NESTED_PARENT_PATH);
	await harness.setMarkdownViewMode("source");
	await expect(nestedEmbed().locator(".fen-collapse-icon")).toBeAttached();

	// Fold state is per-instance, so a reload starts clean: the nested embed is unfolded and
	// one click must fold it — proving the new instance really wired this title.
	await expectFolded(nestedEmbed(), false);
	await nestedEmbed().locator(".markdown-embed-title").click();
	await expectFolded(nestedEmbed(), true);
});

test("deleting a folded embed's whole line does not hand its fold to the next embed", async () => {
	// Its OWN file, opened LAST: this test deletes a line, so keeping it away from the
	// shared `lp-embeds.md` fixture means there is nothing for it to restore.
	await harness.openFile(DELETE_LINE_PATH);
	await harness.setMarkdownViewMode("source");
	await harness.setLivePreviewEnabled(true);

	const first = page.locator(`.cm-content .internal-embed[src="${DELETE_LINE_FIRST_EMBED}"]`);
	const second = page.locator(`.cm-content .internal-embed[src="${DELETE_LINE_SECOND_EMBED}"]`);
	await expect(second.locator(".markdown-embed-title")).toBeAttached();

	await first.locator(".markdown-embed-title").click();
	await expectFolded(first, true);
	await expectFolded(second, false);

	// Obsidian's own "delete line": the line AND its newline, i.e. a deletion STARTING at
	// the fold anchor. The anchor must die with its line — a surviving one is remapped onto
	// whatever moved up into that position, which is the second embed.
	const firstLine = await currentLineOf(DELETE_LINE_FIRST_TEXT);
	await harness.replaceRange("", { line: firstLine, ch: 0 }, { line: firstLine + 1, ch: 0 });

	// Gate first on the deletion having actually reached the editor: `expectFolded(...,
	// false)` retries until it PASSES, so asserting it against a document that still holds
	// the old line would be green for the wrong reason.
	await expect(first).toHaveCount(0);
	await expectFolded(second, false);

	// The same claim once more, immune to timing: a click inverts what is DISPLAYED, so an
	// embed that is really unfolded FOLDS here. Without this, a fold applied a moment after
	// the assertion above (embed DOM renders asynchronously) would still pass.
	await second.locator(".markdown-embed-title").click();
	await expectFolded(second, true);
});

/** The innermost embed of the `lp-nested.md` fixture — the one no mode WIRES on purpose. */
function nestedEmbed(): Locator {
	return page.locator(`.cm-content .internal-embed[src="${NESTED_CHILD_NAME}"] .internal-embed[src="${NESTED_GRANDCHILD_NAME}"]`);
}

/** What one click on a nested embed's title did, measured in the click's own turn. */
interface NestedTitleClickOutcome {
	/** Whether the embed came out of the click FOLDED. */
	readonly folded: boolean;
	/** Whether a listener swallowed Obsidian's own "open the embedded note" default. */
	readonly defaultPrevented: boolean;
}

/**
 * Clicks the nested embed's title and reads the outcome SYNCHRONOUSLY, inside the same
 * `dispatchEvent` turn.
 *
 * WHY not `locator.click()` + a polled assertion: the claim here is that NOTHING happened,
 * and a poll for absence is green during the window before a zombie listener has run. A
 * listener runs DURING `dispatchEvent`, so reading the class right after it leaves no such
 * window. It also survives Obsidian's default action navigating away from the note.
 */
function clickNestedTitleInPage(): Promise<NestedTitleClickOutcome> {
	return page.evaluate((target) => {
		const nested = document.querySelector(
			`.cm-content .internal-embed[src="${target.childName}"] .internal-embed[src="${target.grandchildName}"]`,
		);
		if (nested === null) {
			throw new Error("e2e: nested embed not found — the assertion would be vacuous");
		}
		const title = nested.querySelector(".markdown-embed-title");
		if (title === null) {
			throw new Error("e2e: nested embed has no title bar — the assertion would be vacuous");
		}
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		title.dispatchEvent(click);
		return { folded: nested.classList.contains(target.foldedClass), defaultPrevented: click.defaultPrevented };
	}, { childName: NESTED_CHILD_NAME, grandchildName: NESTED_GRANDCHILD_NAME, foldedClass: CLS_FOLDED });
}

/**
 * How many editor lines end in a `-` (ignoring trailing blanks). Exactly the two whole-line
 * marked embeds of the fixture can; the mid-paragraph and code-span lines end in text.
 */
function linesEndingWithDash(): Promise<number> {
	return page.evaluate(
		() =>
			Array.from(document.querySelectorAll(".cm-content .cm-line")).filter((line) =>
				(line.textContent ?? "").trimEnd().endsWith("-"),
			).length,
	);
}

/**
 * 0-based line number of THE line whose text is exactly `text`, in the note currently open.
 *
 * Compares raw lines and THROWS unless there is exactly one match. Callers feed the result
 * to `replaceRange`, so a wrong pick would silently edit an innocent line and leave every
 * later assertion in this serial spec failing somewhere else entirely. Two fixture lines
 * (`![[child]]-` and `![[child]]- `) differ ONLY by a trailing space, so a `trim()`-based
 * match would resolve both to whichever comes first — luck, not a contract.
 */
async function currentLineOf(text: string): Promise<number> {
	const matches = await page.evaluate((needle) => {
		const value = window.app.workspace.getMostRecentLeaf().view.editor.getValue();
		return value
			.split("\n")
			.map((line, index) => ({ line, index }))
			.filter((candidate) => candidate.line === needle)
			.map((candidate) => candidate.index);
	}, text);
	const [only, ...extra] = matches;
	if (only === undefined || extra.length > 0) {
		throw new Error(`e2e: expected exactly one line equal to [${text}], found [${matches.length}]`);
	}
	return only;
}
