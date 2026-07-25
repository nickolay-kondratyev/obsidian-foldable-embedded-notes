import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";
import { captureElement, expectFreshElement } from "./reRenderGuard";

/**
 * The reading-mode post-processor's pending-embed OBSERVERS must not accumulate
 * (ticket nid_78cl6bo3t8umqbndughsbjez9_e).
 *
 * An embed that never becomes a note embed — `![[does-not-exist]]`, which Obsidian
 * settles as `internal-embed is-loaded file-embed mod-empty` — used to leave its
 * MutationObserver connected forever, so every re-render of the note added two more
 * (MEASURED 2 → 4 → 6), each retaining a detached section subtree.
 *
 * WHY this reaches into plugin internals (`plugin.postProcessor.liveObservers.size`):
 * a leaked observer has NO user-visible surface — it is invisible in the DOM by
 * construction. The alternative, a production-side "how many observers" API, would exist
 * only for this test. The read is a plain field access on the instance `main.ts` already
 * keeps (TS `private` is erased at runtime), the same hook the ticket's reproduction used;
 * if that field is ever renamed, {@link liveObserverCount} throws instead of silently
 * passing.
 *
 * Serial: ONE Obsidian instance, and the counts are read across successive renders.
 */

test.describe.configure({ mode: "serial" });

/** Two embeds whose targets do not exist — nothing in the vault will ever resolve them. */
const MISSING_NOTE_PATH = "obs-missing.md";
/** Control: an embed that DOES resolve to a note, so folding must still work. */
const RESOLVED_NOTE_PATH = "obs-resolved.md";
const CHILD_NOTE_PATH = "obs-child.md";
/** Control: a media embed, which is never foldable and (MEASURED) never leaked. */
const IMAGE_NOTE_PATH = "obs-image.md";
const IMAGE_PATH = "obs-image.png";
/** Embed-free detour note, so reopening really rebuilds the note under test. */
const DETOUR_NOTE_PATH = "obs-detour.md";

/** Re-renders of the note under test; the ticket MEASURED growth from the very first one. */
const RENDER_ROUNDS = 3;

const CLS_FOLDABLE = "fen-embed";
/** Obsidian's own class for an embed whose target does not exist — the settled state. */
const CLS_UNRESOLVED = "mod-empty";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			[MISSING_NOTE_PATH]: "# Missing\n\n![[obs-nowhere]]\n\n![[obs-nowhere-either]]\n",
			[CHILD_NOTE_PATH]: "Body of the child note.\n",
			[RESOLVED_NOTE_PATH]: "# Resolved\n\n![[obs-child]]\n",
			// Not real PNG bytes: Obsidian classifies the embed from the EXTENSION, and the
			// image failing to decode changes nothing about the classes under test.
			[IMAGE_PATH]: "not really a png",
			[IMAGE_NOTE_PATH]: "# Image\n\n![[obs-image.png]]\n",
			[DETOUR_NOTE_PATH]: "# Detour\n\nA note with no embeds at all.\n",
		},
	});
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

/**
 * How many pending-embed observers the post-processor is holding right now.
 * Throws rather than returning a sentinel: a spec that cannot see the subject must FAIL.
 */
async function liveObserverCount(): Promise<number> {
	return page.evaluate((pluginId) => {
		const plugin = window.app.plugins.plugins[pluginId] as
			| { postProcessor?: { liveObservers?: Set<unknown> } }
			| undefined;
		const observers = plugin?.postProcessor?.liveObservers;
		if (observers === undefined) {
			throw new Error("e2e: postProcessor.liveObservers is not reachable — internal shape changed");
		}
		return observers.size;
	}, PLUGIN_ID);
}

function readingViewEmbeds(): Locator {
	return page.locator(".markdown-reading-view .internal-embed");
}

/**
 * Renders `notePath` in reading mode, freshly, and waits until every embed has SETTLED —
 * Obsidian stamps an embed's final classes in one go, and the post-processor's decision
 * about a pending observer is taken on exactly that mutation, so a count read before it
 * would be green for the wrong reason.
 */
async function renderFreshly(notePath: string, settledEmbeds: Locator, expectedCount: number): Promise<void> {
	await harness.reopenThroughOtherFile(notePath, DETOUR_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await expect(settledEmbeds).toHaveCount(expectedCount);
}

test("re-rendering a note of unresolved embeds does not grow the live observers", async () => {
	// GIVEN: the note rendered once, and the observer count that first render left behind.
	const unresolvedEmbeds = readingViewEmbeds().and(page.locator(`.${CLS_UNRESOLVED}`));
	await renderFreshly(MISSING_NOTE_PATH, unresolvedEmbeds, 2);
	const afterFirstRender = await liveObserverCount();
	const firstRenderEmbed = await captureElement(unresolvedEmbeds.first());

	// WHEN: the same note is rendered from scratch several more times.
	for (let round = 1; round < RENDER_ROUNDS; round++) {
		await renderFreshly(MISSING_NOTE_PATH, unresolvedEmbeds, 2);
	}
	// Guard: each round really rebuilt the embeds (a reused DOM would leak nothing).
	await expectFreshElement(firstRenderEmbed, unresolvedEmbeds.first());

	// THEN: the count has not grown — before the fix it was +2 per render (2 → 4 → 6).
	expect(await liveObserverCount()).toBeLessThanOrEqual(afterFirstRender);
});

test("a resolved note embed is still made foldable after unresolved ones were rendered", async () => {
	await renderFreshly(RESOLVED_NOTE_PATH, readingViewEmbeds(), 1);

	await expect(page.locator(`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}`)).toHaveCount(1);
});

test("a media embed is never made foldable and leaves no observer behind", async () => {
	const imageEmbeds = readingViewEmbeds().and(page.locator(".image-embed"));
	await renderFreshly(IMAGE_NOTE_PATH, imageEmbeds, 1);
	const afterFirstRender = await liveObserverCount();

	await renderFreshly(IMAGE_NOTE_PATH, imageEmbeds, 1);

	expect(await liveObserverCount()).toBeLessThanOrEqual(afterFirstRender);
	await expect(page.locator(`.markdown-reading-view .${CLS_FOLDABLE}`)).toHaveCount(0);
});
