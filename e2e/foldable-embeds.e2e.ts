import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { CLS_FOLDED, expectFolded } from "./foldAssertions";
import { ObsidianHarness } from "./obsidianHarness";
import { captureElement, expectFreshElement } from "./reRenderGuard";

/**
 * Reading-mode foldable-embed feature, driven against a REAL Obsidian.
 *
 * `.dev-vault/parent.md` already contains, in order:
 *   1. `![[child]]`   — unmarked (foldable, unfolded by default)
 *   2. `![[child]]-`  — fold-marker (folded by default, dash must not render)
 * Strict-negative variants (`![[child]]-x`, `![[child]]-**bold**`) are layered in via
 * extraFixtures.
 *
 * Serial: ONE Obsidian instance; later tests build on earlier fold interactions.
 */

test.describe.configure({ mode: "serial" });

const PARENT_NOTE_PATH = "parent.md";
/** Any OTHER dev-vault note: the detour that forces `parent.md` to be re-rendered. */
const SIBLING_NOTE_PATH = "sibling.md";
const NEGATIVE_NOTE_PATH = "marker-negative.md";
/** Dash glued to INLINE MARKUP: end of text node, but not end of line. */
const INLINE_MARKUP_NOTE_PATH = "marker-inline-markup.md";
/** Marker on a SOFT-broken line: the line ends at a `<br>`, not at the block. */
const SOFT_BREAK_NOTE_PATH = "marker-soft-break.md";
/** Embeds the SAME note twice (independent fold state). */
const TWINS_NOTE_PATH = "twins.md";
/** Embeds heading- and block-ref marker variants. */
const REF_PARENT_NOTE_PATH = "ref-parent.md";
const REF_CHILD_NOTE_PATH = "ref-child.md";
/** Host note embedded TWICE, each occurrence rendering one NESTED embed of its own. */
const NESTED_CHILD_NAME = "nested-child";
const NESTED_GRANDCHILD_NAME = "nested-grandchild";
const NESTED_TWINS_NOTE_PATH = "nested-twins.md";
/** Two DIFFERENT notes hosting the SAME nested embed (cross-note identity). */
const NESTED_HOST_A_NOTE_PATH = "nested-host-a.md";
const NESTED_HOST_B_NOTE_PATH = "nested-host-b.md";

const CLS_FOLDABLE = "fen-embed";
const CLS_COLLAPSED = "is-collapsed";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			// Strict-marker negative case: the dash is glued to `x`, so it is NOT a
			// fold marker and must render literally.
			[NEGATIVE_NOTE_PATH]: "# Negative\n\n![[child]]-x\n",
			// Same strict-negative rule, but `**bold**` renders as a SIBLING <strong>
			// element, so the dash ends its own text node without ending the line.
			[INLINE_MARKUP_NOTE_PATH]:
				"# Inline markup\n\n![[child]]-**bold** tail\n\n![[child]]- tail\n",
			// Soft line break: the marker ends its LINE while more text follows in the
			// same paragraph, so `<br>` — not the block end — is what terminates it.
			[SOFT_BREAK_NOTE_PATH]: "# Soft break\n\n![[child]]-\nnext line\n",
			// Same note embedded twice — each occurrence must fold independently.
			[TWINS_NOTE_PATH]: "# Twins\n\n![[child]]\n\n![[child]]\n",
			// Heading- and block-ref marker variants of a note carrying both refs.
			[REF_CHILD_NOTE_PATH]:
				"# Ref child\n\n## Section A\n\nBody of section A.\n\nStandalone block. ^blockid\n",
			[REF_PARENT_NOTE_PATH]:
				"# Ref parent\n\n![[ref-child#Section A]]-\n\n![[ref-child#^blockid]]-\n",
			// NESTING fixtures: the host note embeds one more note, so every occurrence of
			// the host renders a nested embed whose OWN note, section text and `src` are
			// identical — everything except the HOST it sits in.
			[`${NESTED_GRANDCHILD_NAME}.md`]: "Body of the nested grandchild.\n",
			[`${NESTED_CHILD_NAME}.md`]: `# Nested child\n\n![[${NESTED_GRANDCHILD_NAME}]]\n`,
			[NESTED_TWINS_NOTE_PATH]:
				`# Nested twins\n\n![[${NESTED_CHILD_NAME}]]\n\n![[${NESTED_CHILD_NAME}]]\n`,
			[NESTED_HOST_A_NOTE_PATH]: `# Host A\n\n![[${NESTED_CHILD_NAME}]]\n`,
			[NESTED_HOST_B_NOTE_PATH]: `# Host B\n\n![[${NESTED_CHILD_NAME}]]\n`,
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

/**
 * The embeds NESTED inside the `![[nested-child]]` hosts of the open note, in document
 * order — one per host occurrence. Chained through the host's `src` (the pattern the Live
 * Preview suite already uses) so the locator states what it selects: the SAME grandchild
 * embed, once per host, which is exactly what must fold independently.
 */
function nestedEmbeds(): Locator {
	return page
		.locator(`.markdown-reading-view .internal-embed[src="${NESTED_CHILD_NAME}"]`)
		.locator(`.markdown-embed.${CLS_FOLDABLE}`);
}

/**
 * Waits until all `expected` nested embeds of this render are fully wired.
 *
 * The chevron is injected in the same synchronous block that applies the fold class, so a
 * chevron on the LAST one means every fold projection of this render has happened — the
 * settled barrier a "this one is NOT folded" assertion needs, since that assertion retries
 * until it passes and would otherwise be green merely for being early.
 */
async function waitForNestedEmbedsWired(expected: number): Promise<void> {
	await expect(nestedEmbeds()).toHaveCount(expected);
	await expect(nestedEmbeds().nth(expected - 1).locator(".fen-collapse-icon")).toBeAttached();
}

/** Opens a note in reading mode with all `nestedCount` of its NESTED embeds wired. */
async function openWithNestedEmbeds(vaultPath: string, nestedCount: number): Promise<void> {
	await harness.openFile(vaultPath);
	await harness.setMarkdownViewMode("preview");
	await waitForNestedEmbedsWired(nestedCount);
}

/** textContent of the DOM text node immediately following an embed span. */
function nextSiblingText(embed: Locator): Promise<string> {
	return embed.evaluate((node) => node.nextSibling?.textContent ?? "");
}

test("unmarked embed renders unfolded with its body visible", async () => {
	const unmarked = foldableEmbeds().nth(0);
	await expectFolded(unmarked, false);
	// Baseline for the folded-hidden assertion below: the populated body div is visible.
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeVisible();
});

test("`![[child]]-` renders folded, body hidden, no visible dash", async () => {
	const marked = foldableEmbeds().nth(1);
	await expectFolded(marked, true);
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

	await title.click();
	await expectFolded(embed, true);
	await expect(embed.locator(".fen-collapse-icon")).toHaveClass(new RegExp(`\\b${CLS_COLLAPSED}\\b`));

	await title.click();
	await expectFolded(embed, false);
});

test("fold state survives leaving the note and coming back", async () => {
	// Fold the first (unmarked) embed, then leave for another note and return, which is
	// what actually discards and rebuilds the reading-view DOM (see
	// `reopenThroughOtherFile`): only the session fold store can bring the fold back.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expectFolded(foldableEmbeds().nth(0), true);
	const embedBeforeReopen = await captureElement(foldableEmbeds().nth(0));

	await harness.reopenThroughOtherFile(PARENT_NOTE_PATH, SIBLING_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(0)).toBeAttached();

	await expectFreshElement(embedBeforeReopen, foldableEmbeds().nth(0));
	await expectFolded(foldableEmbeds().nth(0), true);
});

test("strict-marker negative `![[child]]-x` stays unfolded with the dash visible", async () => {
	await harness.openFile(NEGATIVE_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expectFolded(embed, false);
	// The literal dash (and its glued `x`) must remain in the trailing text node.
	expect(await nextSiblingText(embed)).toMatch(/^-x/);
});

test("strict-marker negative `![[child]]-**bold**` stays unfolded with the dash visible", async () => {
	await harness.openFile(INLINE_MARKUP_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expectFolded(embed, false);
	// Guard the DOM SHAPE this case is about: the dash is a text node of its own,
	// followed by a <strong> element — "end of text node" without "end of line".
	expect(await nextSiblingText(embed)).toBe("-");
	await expect(embed.locator("xpath=following-sibling::strong[1]")).toBeAttached();
});

test("`![[child]]- tail` still folds, keeping the text after the marker", async () => {
	// The whitespace branch of the marker parse, which the end-of-line rule must not narrow.
	// Same note as the test above — opened explicitly so this test can also stand alone.
	await harness.openFile(INLINE_MARKUP_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(1)).toBeAttached();

	const embed = foldableEmbeds().nth(1);
	await expectFolded(embed, true);
	expect(await nextSiblingText(embed)).toBe(" tail");
});

test("`![[child]]-` before a SOFT line break still folds", async () => {
	// The `<br>` branch of the end-of-line rule: text follows in the same paragraph, so
	// the marker's text node is NOT the last one — only the `<br>` ends the line.
	await harness.openFile(SOFT_BREAK_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expectFolded(embed, true);
	// Pin the DOM shape this case is about: dash stripped, and a <br> follows.
	expect(await nextSiblingText(embed)).toBe("");
	await expect(embed.locator("xpath=following-sibling::br[1]")).toBeAttached();
});

test("two embeds of the SAME note fold independently", async () => {
	await harness.openFile(TWINS_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(1)).toBeAttached();

	// Fold only the FIRST occurrence; the second (same note) must be unaffected.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expectFolded(foldableEmbeds().nth(0), true);
	await expectFolded(foldableEmbeds().nth(1), false);
});

test("heading- and block-ref `![[note#...]]-` fold by default with the dash stripped", async () => {
	await harness.openFile(REF_PARENT_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(foldableEmbeds().nth(1)).toBeAttached();

	const headingEmbed = foldableEmbeds().nth(0); // ![[ref-child#Section A]]-
	const blockEmbed = foldableEmbeds().nth(1); // ![[ref-child#^blockid]]-

	await expectFolded(headingEmbed, true);
	await expectFolded(blockEmbed, true);
	expect(await nextSiblingText(headingEmbed)).not.toMatch(/^-/);
	expect(await nextSiblingText(blockEmbed)).not.toMatch(/^-/);
});

test("a NESTED embed folds independently of its twin in a sibling host, across a re-render", async () => {
	// Both nested embeds render the same note, inside the same host note, from identical
	// markup — the shape in which their fold identity used to collapse onto one key
	// (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e). Only the HOST occurrence tells them apart.
	await openWithNestedEmbeds(NESTED_TWINS_NOTE_PATH, 2);

	// GIVEN: only the nested embed of the FIRST host is folded.
	await nestedEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expectFolded(nestedEmbeds().nth(0), true);
	await expectFolded(nestedEmbeds().nth(1), false);
	const foldedBeforeReopen = await captureElement(nestedEmbeds().nth(0));

	// WHEN: the note is rebuilt from scratch, so both keys are re-derived and read back.
	await harness.reopenThroughOtherFile(NESTED_TWINS_NOTE_PATH, SIBLING_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await waitForNestedEmbedsWired(2);
	await expectFreshElement(foldedBeforeReopen, nestedEmbeds().nth(0));

	// THEN: the fold is still on the one the user folded, and its twin is untouched.
	await expectFolded(nestedEmbeds().nth(0), true);
	await expectFolded(nestedEmbeds().nth(1), false);
});

test("folding a NESTED embed in one host note leaves it unfolded in ANOTHER host note", async () => {
	// GIVEN: the nested embed of host A is folded.
	await openWithNestedEmbeds(NESTED_HOST_A_NOTE_PATH, 1);
	await nestedEmbeds().first().locator(".markdown-embed-title").click();
	await expectFolded(nestedEmbeds().first(), true);

	// WHEN: host B — which embeds the very same child, for the first time this session — is
	// opened. Nothing about the nested embed itself differs between the two notes, so a fold
	// identity that ignores the host cannot tell them apart.
	await openWithNestedEmbeds(NESTED_HOST_B_NOTE_PATH, 1);

	// THEN: host B's nested embed is unfolded — the user never touched it.
	await expectFolded(nestedEmbeds().first(), false);
});

// Last in this serial file: it disables the plugin, so anything after it would run
// against a half-torn-down world.
test("disabling the plugin leaves no injected DOM in the reading view", async () => {
	// Baseline: the injected marks are really there before the plugin goes away.
	await expect(foldableEmbeds().first()).toBeAttached();

	await harness.setPluginEnabled(false);

	// OUTCOME test, not a teardown test. Measured: Obsidian DISCARDS the rendered
	// reading-view DOM when a plugin is toggled (elements stamped before the disable
	// are all detached afterwards), so the post-processor needs no unmark-on-unload
	// path of its own — unlike Live Preview, whose embed DOM Obsidian reuses.
	// This asserts what the user can actually observe; if a future Obsidian starts
	// reusing this DOM too, it fails and the removal path becomes real work.
	await expect(page.locator(`.markdown-reading-view .${CLS_FOLDABLE}`)).toHaveCount(0);
	await expect(page.locator(".markdown-reading-view .fen-collapse-icon")).toHaveCount(0);
	await expect(page.locator(`.markdown-reading-view .${CLS_FOLDED}`)).toHaveCount(0);
});
