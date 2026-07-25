import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { expectFolded } from "./foldAssertions";
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
].join("\n");

/** A note embedding another note, which itself embeds one — the NESTED-embed fixture. */
const NESTED_PARENT_PATH = "lp-nested.md";
const NESTED_CHILD_NAME = "lp-nested-child";
const NESTED_GRANDCHILD_NAME = "sibling";
const NESTED_FIXTURES = {
	[NESTED_PARENT_PATH]: `# Nested parent\n\n![[${NESTED_CHILD_NAME}]]\n`,
	[`${NESTED_CHILD_NAME}.md`]: `# Nested child\n\nBody before the nested embed.\n\n![[${NESTED_GRANDCHILD_NAME}]]\n`,
};

const LINE_UNMARKED = 2;
const LINE_MARKED = 4;
const LINE_ELSEWHERE = 0;

/** Document order of the three embed widgets in `.cm-content`. */
const EMBED_UNMARKED = 0;
const EMBED_MARKED = 1;
const EMBED_INLINE_MARKED = 2;

const CLS_FOLDABLE = "fen-embed";
const CLS_COLLAPSED = "is-collapsed";
const COLLAPSED_RE = new RegExp(`\\b${CLS_COLLAPSED}\\b`);

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: { [NOTE_PATH]: NOTE_CONTENT, ...NESTED_FIXTURES },
	});
	page = harness.page;
	await harness.openFile(NOTE_PATH);
	await harness.setMarkdownViewMode("source");
	// Live Preview is a flavour of EDITING mode, so enter editing mode first.
	await harness.setLivePreviewEnabled(true);
	await expect(embeds().nth(EMBED_INLINE_MARKED)).toBeAttached();
});

test.afterAll(async () => {
	await harness?.close();
});

/** Embeds the plugin has wired, in document order, inside the editor. */
function embeds(): Locator {
	return page.locator(`.cm-content .internal-embed.${CLS_FOLDABLE}`);
}

/**
 * Text of the `.cm-line` holding the nth embed. Polled through `page.evaluate` because
 * the relationship (`closest(".cm-line")`) has no locator equivalent, and asserted via
 * `expect.poll` so decoration updates are awaited rather than slept on.
 *
 * THROWS when the embed has no `.cm-line` ancestor (i.e. Obsidian turned it into a BLOCK
 * widget): returning `""` there would silently satisfy every "the dash is hidden"
 * assertion, so a DOM-shape change must fail loudly instead.
 */
function lineTextOfEmbed(nth: number): Promise<string> {
	return embeds()
		.nth(nth)
		.evaluate((el) => {
			const line = el.closest(".cm-line");
			if (line === null) {
				throw new Error("e2e: embed has no .cm-line ancestor (block widget?) — assertion would be vacuous");
			}
			return line.textContent ?? "";
		});
}

/** Whether the embed's line still renders a trailing marker dash. */
function lineEndsWithDash(nth: number): Promise<boolean> {
	return lineTextOfEmbed(nth).then((text) => text.trimEnd().endsWith("-"));
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
	await expect(embeds()).toHaveCount(3);
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
	// Baseline — in Live Preview the plugin hides the ONLY trailing dash in this note.
	await expect.poll(linesEndingWithDash).toBe(0);

	await harness.setLivePreviewEnabled(false);

	// Source mode must render raw markdown verbatim, so the plugin's dash-hiding
	// decoration is gated on `editorLivePreviewField`. Counted over `.cm-line` text
	// rather than matched against the literal `![[child]]-` so the assertion does not
	// also encode how Obsidian itself renders (or stops rendering) the embed widget.
	await expect.poll(linesEndingWithDash).toBe(1);
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
 * How many editor lines end in a `-`. Exactly one line of the fixture can (the
 * whole-line marked embed); the mid-paragraph and code-span lines end in text.
 */
function linesEndingWithDash(): Promise<number> {
	return page.evaluate(
		() =>
			Array.from(document.querySelectorAll(".cm-content .cm-line")).filter((line) =>
				(line.textContent ?? "").trimEnd().endsWith("-"),
			).length,
	);
}

/** 0-based line number of the first line whose trimmed text equals `text`. */
async function currentLineOf(text: string): Promise<number> {
	return page.evaluate((needle) => {
		const value = window.app.workspace.getMostRecentLeaf().view.editor.getValue();
		return value.split("\n").findIndex((line) => line.trim() === needle);
	}, text);
}
