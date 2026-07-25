import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { expectFolded } from "./foldAssertions";
import { ObsidianHarness } from "./obsidianHarness";
import { captureElement, expectFreshElement } from "./reRenderGuard";

/**
 * Reading-mode fold IDENTITY across an edit ABOVE the embed (ticket
 * nid_7qbtubxk89team9oadnl3hanr_e).
 *
 * The session fold store keys each embed occurrence; nothing in reading mode maps that key
 * through a document change (unlike Live Preview, whose fold anchors are CM6 positions). So
 * the two failure modes an edit above an embed can produce are pinned here:
 *   1. LOSS          — the folded embed comes back UNFOLDED (`rm-shift.md`).
 *   2. MISATTRIBUTION — a DIFFERENT, untouched embed comes back folded (`rm-twin-shift.md`).
 *
 * Own Obsidian instance and own fixtures: both tests MUTATE their note, and the convention
 * for destructive edits in this suite is a fixture nobody else reads.
 *
 * Each edit is made in EDITING mode (the only place `editor.replaceRange` exists) and is then
 * observed through a genuine re-render — a reopen via a detour note, since a view-MODE
 * round-trip reuses the reading-view DOM (see `ObsidianHarness.reopenThroughOtherFile`).
 */

test.describe.configure({ mode: "serial" });

/** Two embeds of DIFFERENT notes; the first one is folded, then lines are inserted above it. */
const SHIFT_NOTE_PATH = "rm-shift.md";
/** Two embeds of the SAME note; the heading above them is deleted (misattribution case). */
const TWIN_NOTE_PATH = "rm-twin-shift.md";
/** Embed-free detour note, so reopening really rebuilds the note under test. */
const DETOUR_NOTE_PATH = "rm-detour.md";
const CHILD_A_PATH = "rm-a.md";
const CHILD_B_PATH = "rm-b.md";

/** Heading text inserted above the embeds — the marker proving the edit reached the render. */
const INSERTED_HEADING = "Inserted above";
/** Heading of `rm-twin-shift.md`, deleted mid-test; its ABSENCE proves that edit landed. */
const TWIN_HEADING = "Twin head";

const CLS_FOLDABLE = "fen-embed";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			[CHILD_A_PATH]: "Body of child A.\n",
			[CHILD_B_PATH]: "Body of child B.\n",
			// Distinct `src` per embed, so an assertion about "the FIRST embed" cannot be
			// satisfied by the other one having moved.
			[SHIFT_NOTE_PATH]: `# Shift\n\n![[rm-a]]\n\n![[rm-b]]\n`,
			// Identical `src`: the shape in which a line-keyed store MISATTRIBUTES, because
			// after the deletion the second embed sits on the first one's old line.
			[TWIN_NOTE_PATH]: `# ${TWIN_HEADING}\n\n![[rm-a]]\n\n![[rm-a]]\n`,
			[DETOUR_NOTE_PATH]: "# Detour\n\nA note with no embeds at all.\n",
		},
	});
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

/**
 * Only embeds the plugin has wired, in the READING view. Scoped exactly as in
 * `foldable-embeds.e2e.ts`: the hidden Live Preview editor DOM in the same leaf is wired
 * too and would shift every `nth()`.
 */
function foldableEmbeds(): Locator {
	return page.locator(`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}`);
}

/**
 * Waits until BOTH embeds of the note under test are fully wired.
 *
 * The chevron is injected in the same synchronous block that applies the fold class, so a
 * chevron on the LAST embed means every fold projection of this render has already happened
 * — the settled barrier a "this one is NOT folded" assertion needs (that assertion retries
 * until it passes, so on its own it would be green simply for being early).
 */
async function waitForBothEmbedsWired(): Promise<void> {
	await expect(foldableEmbeds()).toHaveCount(2);
	await expect(foldableEmbeds().nth(1).locator(".fen-collapse-icon")).toBeAttached();
}

/** Opens `path` in reading mode with both its embeds wired. */
async function openInReadingMode(path: string): Promise<void> {
	await harness.openFile(path);
	await harness.setMarkdownViewMode("preview");
	await waitForBothEmbedsWired();
}

/** Re-renders `path` from scratch (detour through an unrelated note) and waits for its embeds. */
async function reRender(path: string): Promise<void> {
	await harness.reopenThroughOtherFile(path, DETOUR_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await waitForBothEmbedsWired();
}

/** A heading of the HOST note (embedded children render headings of their own). */
function hostHeading(text: string): Locator {
	return page.locator(".markdown-reading-view h1", { hasText: text });
}

test("folding the first embed, then inserting lines ABOVE it, keeps THAT embed folded", async () => {
	await openInReadingMode(SHIFT_NOTE_PATH);

	// GIVEN: the first embed (`![[rm-a]]`) is folded and the second is not.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expectFolded(foldableEmbeds().nth(0), true);
	await expectFolded(foldableEmbeds().nth(1), false);
	const foldedBeforeEdit = await captureElement(foldableEmbeds().nth(0));

	// WHEN: two lines are inserted at the very top, shifting both embeds down.
	await harness.setMarkdownViewMode("source");
	await harness.replaceRange(`# ${INSERTED_HEADING}\n\n`, { line: 0, ch: 0 });
	await reRender(SHIFT_NOTE_PATH);
	// Gate on the edit having reached the RENDER before judging fold state; otherwise the
	// assertions below could be measuring the pre-edit document.
	await expect(hostHeading(INSERTED_HEADING)).toBeAttached();
	await expectFreshElement(foldedBeforeEdit, foldableEmbeds().nth(0));

	// THEN: the embed the user folded is still folded, and its neighbour is untouched.
	await expectFolded(foldableEmbeds().nth(0), true);
	await expectFolded(foldableEmbeds().nth(1), false);
});

test("deleting the heading ABOVE two same-note embeds does not move the fold to the other one", async () => {
	await openInReadingMode(TWIN_NOTE_PATH);

	// GIVEN: of two `![[rm-a]]` embeds, only the FIRST is folded.
	await foldableEmbeds().nth(0).locator(".markdown-embed-title").click();
	await expectFolded(foldableEmbeds().nth(0), true);
	await expectFolded(foldableEmbeds().nth(1), false);
	const foldedBeforeEdit = await captureElement(foldableEmbeds().nth(0));

	// WHEN: the heading and the blank line above the embeds are deleted, so the SECOND
	// embed lands exactly on the line the FIRST one used to occupy.
	await harness.setMarkdownViewMode("source");
	await harness.replaceRange("", { line: 0, ch: 0 }, { line: 2, ch: 0 });
	await reRender(TWIN_NOTE_PATH);
	// The deleted heading's absence is what proves the edit reached this render.
	await expect(hostHeading(TWIN_HEADING)).toHaveCount(0);
	await expectFreshElement(foldedBeforeEdit, foldableEmbeds().nth(0));

	// THEN: the fold stayed on the embed the user folded, and the second embed — which the
	// user never touched — is still unfolded.
	await expectFolded(foldableEmbeds().nth(0), true);
	await expectFolded(foldableEmbeds().nth(1), false);
});
