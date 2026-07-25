import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { expectFolded } from "./foldAssertions";
import { ObsidianHarness } from "./obsidianHarness";
import { captureElement, expectFreshElement } from "./reRenderGuard";

/**
 * A NESTED embed folded during the COLD-CACHE window at app start keeps its fold once the
 * vault index answers (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e).
 *
 * A nested embed's key is its host's key plus its own (`EmbedFoldKeys.nestedIn`), and the
 * HOST's key changes as the index warms up: positional (`L…`) while the cache is cold,
 * occurrence-based (`occ`) afterwards. So the fold the user made in that window sits under a
 * key no later render asks for, and only `FoldStateStore.adoptRecordingOf` — fed by the
 * nested key's SUPERSEDED half — brings it across. That takeover is what this spec guards;
 * nothing else here is new coverage.
 *
 * The cold window is INJECTED (`ObsidianHarness.withUnindexedNote`) rather than raced for.
 * MEASURED first: by the time this harness has a workspace and the plugin enabled, the cache
 * already answers for every fixture, so a spec that just opens a note "early" is green even
 * with the takeover removed — vacuous. Hiding the host note from `getCache` for the duration
 * of the first render reproduces the same product state deterministically, and the spec is
 * RED without the takeover (verified by reverting it).
 */

test.describe.configure({ mode: "serial" });

/** The HOST note, opened straight after launch — its embed renders the nested one. */
const HOST_NOTE_PATH = "cold-host.md";
const CHILD_NAME = "cold-child";
const GRANDCHILD_NAME = "cold-grandchild";
/** Embed-free detour note, so reopening the host really rebuilds it. */
const DETOUR_NOTE_PATH = "cold-detour.md";

const CLS_FOLDABLE = "fen-embed";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({
		extraFixtures: {
			[`${GRANDCHILD_NAME}.md`]: "Body of the cold-start grandchild.\n",
			[`${CHILD_NAME}.md`]: `# Cold child\n\n![[${GRANDCHILD_NAME}]]\n`,
			[HOST_NOTE_PATH]: `# Cold host\n\n![[${CHILD_NAME}]]\n`,
			[DETOUR_NOTE_PATH]: "# Cold detour\n\nA note with no embeds at all.\n",
		},
	});
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

/**
 * The embed NESTED inside the host's `![[cold-child]]`, in the READING view — scoped as in
 * `foldable-embeds.e2e.ts`, since the hidden Live Preview editor of the same leaf is wired too.
 */
function nestedEmbed(): Locator {
	return page
		.locator(`.markdown-reading-view .internal-embed[src="${CHILD_NAME}"]`)
		.locator(`.markdown-embed.${CLS_FOLDABLE}`);
}

/**
 * Waits until this render's nested embed is fully wired. The chevron is the settled barrier:
 * it is injected in the same synchronous block that applies the fold class.
 */
async function waitForNestedEmbedWired(): Promise<void> {
	await expect(nestedEmbed()).toHaveCount(1);
	await expect(nestedEmbed().locator(".fen-collapse-icon")).toBeAttached();
}

test("a nested embed folded while the host is UNINDEXED stays folded once it is indexed", async () => {
	// GIVEN: the host note is rendered and folded while the cache cannot answer for it, so the
	// host — and with it the nested embed — can only be keyed positionally.
	const foldedBeforeReopen = await harness.withUnindexedNote(HOST_NOTE_PATH, async () => {
		await harness.openFile(HOST_NOTE_PATH);
		await harness.setMarkdownViewMode("preview");
		await waitForNestedEmbedWired();
		await nestedEmbed().locator(".markdown-embed-title").click();
		await expectFolded(nestedEmbed(), true);
		return captureElement(nestedEmbed());
	});

	// WHEN: the cache answers again and the note is rebuilt from scratch, so the host is now
	// keyed by OCCURRENCE and the nested key changes with it.
	await harness.waitUntilIndexed(HOST_NOTE_PATH);
	await harness.reopenThroughOtherFile(HOST_NOTE_PATH, DETOUR_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");
	await waitForNestedEmbedWired();
	await expectFreshElement(foldedBeforeReopen, nestedEmbed());

	// THEN: the fold made under the weaker key was taken over, not dropped.
	await expectFolded(nestedEmbed(), true);
});
