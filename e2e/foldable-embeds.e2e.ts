import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ObsidianHarness } from "./obsidianHarness";

/**
 * Reading-mode foldable-embed feature, driven against a REAL Obsidian.
 *
 * `.dev-vault/parent.md` already contains, in order:
 *   1. `![[child]]`   — unmarked (foldable, unfolded by default)
 *   2. `![[child]]-`  — fold-marker (folded by default, dash must not render)
 * A strict-negative variant `![[child]]-x` is layered in via extraFixtures.
 *
 * Serial: ONE Obsidian instance; later tests build on earlier fold interactions.
 */

test.describe.configure({ mode: "serial" });

const PARENT_NOTE_PATH = "parent.md";
const NEGATIVE_NOTE_PATH = "marker-negative.md";
/** Embeds the SAME note twice (independent fold state). */
const TWINS_NOTE_PATH = "twins.md";
/** Embeds heading- and block-ref marker variants. */
const REF_PARENT_NOTE_PATH = "ref-parent.md";
const REF_CHILD_NOTE_PATH = "ref-child.md";

const CLS_FOLDABLE = "fen-embed";
const CLS_FOLDED = "fen-folded";
const CLS_COLLAPSED = "is-collapsed";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			// Strict-marker negative case: the dash is glued to `x`, so it is NOT a
			// fold marker and must render literally.
			[NEGATIVE_NOTE_PATH]: "# Negative\n\n![[child]]-x\n",
			// Same note embedded twice — each occurrence must fold independently.
			[TWINS_NOTE_PATH]: "# Twins\n\n![[child]]\n\n![[child]]\n",
			// Heading- and block-ref marker variants of a note carrying both refs.
			[REF_CHILD_NOTE_PATH]:
				"# Ref child\n\n## Section A\n\nBody of section A.\n\nStandalone block. ^blockid\n",
			[REF_PARENT_NOTE_PATH]:
				"# Ref parent\n\n![[ref-child#Section A]]-\n\n![[ref-child#^blockid]]-\n",
		},
	});
	page = harness.page;
	await harness.openFile(PARENT_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	// The plugin only marks an embed foldable once its title has loaded.
	await expect(foldableEmbeds().first()).toBeAttached();
	await expect(foldableEmbeds().nth(1)).toBeAttached();
});

test.afterAll(async () => {
	await harness?.close();
});

/**
 * Only embeds the plugin has processed (title loaded + wired), in the READING view.
 * Scoped to `.markdown-reading-view`: Obsidian keeps the (hidden) Live Preview editor
 * DOM in the same leaf, and the plugin marks embeds there too — an unscoped selector
 * would match both and shift every `nth()` index in this suite.
 */
function foldableEmbeds(): Locator {
	return page.locator(`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}`);
}

/** textContent of the DOM text node immediately following an embed span. */
function nextSiblingText(embed: Locator): Promise<string> {
	return embed.evaluate((node) => node.nextSibling?.textContent ?? "");
}

test("unmarked embed renders unfolded with its body visible", async () => {
	const unmarked = foldableEmbeds().nth(0);
	await expect(unmarked).not.toHaveClass(new RegExp(`\\b${CLS_FOLDED}\\b`));
	// Baseline for the folded-hidden assertion below: the populated body div is visible.
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeVisible();
});

test("`![[child]]-` renders folded, body hidden, no visible dash", async () => {
	const marked = foldableEmbeds().nth(1);
	await expect(marked).toHaveClass(new RegExp(`\\b${CLS_FOLDED}\\b`));
	// Prove the CSS collapses the RIGHT element: the populated body is actually
	// hidden (not merely that the class is present). Non-tautological — the
	// unfolded embed above asserts the same locator is visible.
	await expect(marked.locator(".markdown-embed-content").first()).toBeHidden();
	// The marker dash was stripped from the trailing text node, so nothing after
	// the embed still begins with '-'.
	expect(await nextSiblingText(marked)).not.toMatch(/^-/);
});

test("chevron is present and reflects fold state", async () => {
	const unfoldedChevron = foldableEmbeds().nth(0).locator(".fen-collapse-icon");
	const foldedChevron = foldableEmbeds().nth(1).locator(".fen-collapse-icon");
	await expect(unfoldedChevron.locator("svg")).toBeAttached();
	await expect(unfoldedChevron).not.toHaveClass(new RegExp(`\\b${CLS_COLLAPSED}\\b`));
	await expect(foldedChevron).toHaveClass(new RegExp(`\\b${CLS_COLLAPSED}\\b`));
});

test("clicking the title folds, then unfolds", async () => {
	const embed = foldableEmbeds().nth(0);
	const title = embed.locator(".markdown-embed-title");
	const foldedRe = new RegExp(`\\b${CLS_FOLDED}\\b`);

	await title.click();
	await expect(embed).toHaveClass(foldedRe);
	await expect(embed.locator(".fen-collapse-icon")).toHaveClass(new RegExp(`\\b${CLS_COLLAPSED}\\b`));

	await title.click();
	await expect(embed).not.toHaveClass(foldedRe);
});

test("fold state survives a reading -> editing -> reading round-trip", async () => {
	const foldedRe = new RegExp(`\\b${CLS_FOLDED}\\b`);
	// Fold the first (unmarked) embed, then round-trip the view mode.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expect(foldableEmbeds().nth(0)).toHaveClass(foldedRe);

	await harness.setMarkdownViewMode("source");
	await harness.setMarkdownViewMode("preview");

	// Re-rendered from scratch; the session store must restore the manual fold.
	await expect(foldableEmbeds().nth(0)).toBeAttached();
	await expect(foldableEmbeds().nth(0)).toHaveClass(foldedRe);
});

test("strict-marker negative `![[child]]-x` stays unfolded with the dash visible", async () => {
	await harness.openFile(NEGATIVE_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expect(embed).toBeAttached();
	await expect(embed).not.toHaveClass(new RegExp(`\\b${CLS_FOLDED}\\b`));
	// The literal dash (and its glued `x`) must remain in the trailing text node.
	expect(await nextSiblingText(embed)).toMatch(/^-x/);
});

test("two embeds of the SAME note fold independently", async () => {
	await harness.openFile(TWINS_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(1)).toBeAttached();

	const foldedRe = new RegExp(`\\b${CLS_FOLDED}\\b`);
	// Fold only the FIRST occurrence; the second (same note) must be unaffected.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expect(foldableEmbeds().nth(0)).toHaveClass(foldedRe);
	await expect(foldableEmbeds().nth(1)).not.toHaveClass(foldedRe);
});

test("heading- and block-ref `![[note#...]]-` fold by default with the dash stripped", async () => {
	await harness.openFile(REF_PARENT_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(1)).toBeAttached();

	const foldedRe = new RegExp(`\\b${CLS_FOLDED}\\b`);
	const headingEmbed = foldableEmbeds().nth(0); // ![[ref-child#Section A]]-
	const blockEmbed = foldableEmbeds().nth(1); // ![[ref-child#^blockid]]-

	await expect(headingEmbed).toHaveClass(foldedRe);
	await expect(blockEmbed).toHaveClass(foldedRe);
	expect(await nextSiblingText(headingEmbed)).not.toMatch(/^-/);
	expect(await nextSiblingText(blockEmbed)).not.toMatch(/^-/);
});
