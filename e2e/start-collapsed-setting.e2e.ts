import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";

/**
 * The "start embedded notes collapsed" setting, driven against a REAL Obsidian.
 *
 * The suite starts with the setting SEEDED ON in `data.json` (the default is OFF, so
 * every "starts folded" assertion below is falsifiable: with the setting ignored these
 * plain `![[child]]` embeds would render expanded, exactly as the other two specs assert).
 * It then turns the setting OFF through the real settings dialog and back ON.
 *
 * Two DIFFERENT properties are asserted about persistence, because one does not imply
 * the other:
 * - the tab WRITES: `data.json` on disk is read back from Node and must hold the value
 *   just chosen. This is what fails if `saveData` is never called — asserting a
 *   post-restart behaviour cannot, since the seeded file already says what we want.
 * - the plugin READS at load: after a real Obsidian restart the setting still applies.
 *
 * Serial, ONE Obsidian per file (plus one relaunch), no fixed sleeps.
 */

test.describe.configure({ mode: "serial" });

const DATA_JSON_PATH = `.obsidian/plugins/${PLUGIN_ID}/data.json`;
const SETTING_NAME = "Start embedded notes collapsed";

/** `child.md` comes from the dev vault; note A carries an unmarked AND a marked embed. */
const NOTE_A_PATH = "start-collapsed-a.md";
const NOTE_B_PATH = "start-collapsed-b.md";
const FIXTURES = {
	[DATA_JSON_PATH]: JSON.stringify({ startCollapsed: true }),
	[NOTE_A_PATH]: "# Start collapsed A\n\n![[child]]\n\n![[child]]-\n",
	// A note NEVER opened while the setting was on: its fold state is untouched by the
	// clicks above, so what it renders is purely the setting's doing.
	[NOTE_B_PATH]: "# Start collapsed B\n\n![[child]]\n",
};

const CLS_FOLDABLE = "fen-embed";
const CLS_FOLDED = "fen-folded";
const FOLDED_RE = new RegExp(`\\b${CLS_FOLDED}\\b`);
/** Obsidian's own class for a toggle in the "on" position. */
const TOGGLE_ENABLED_RE = /\bis-enabled\b/;

/** Document order inside the fixture notes. */
const EMBED_UNMARKED = 0;
const EMBED_MARKED = 1;

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({ extraFixtures: FIXTURES });
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

/** Embeds the plugin has wired in the READING view (scoped: the hidden editor DOM is wired too). */
function readingEmbeds(): Locator {
	return page.locator(`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}`);
}

/** Embeds the plugin has wired in the EDITOR (Live Preview). */
function editorEmbeds(): Locator {
	return page.locator(`.cm-content .internal-embed.${CLS_FOLDABLE}`);
}

async function openInReadingMode(notePath: string): Promise<void> {
	await harness.openFile(notePath);
	await harness.setMarkdownViewMode("preview");
	await expect(readingEmbeds().first()).toBeAttached();
}

async function openInLivePreview(notePath: string): Promise<void> {
	await harness.openFile(notePath);
	// Live Preview is a flavour of EDITING mode, so enter editing mode first.
	await harness.setMarkdownViewMode("source");
	await harness.setLivePreviewEnabled(true);
	await expect(editorEmbeds().first()).toBeAttached();
}

/** The setting's toggle row in the plugin's settings tab. */
function startCollapsedToggle(): Locator {
	return page.locator(".setting-item", { hasText: SETTING_NAME }).locator(".checkbox-container");
}

async function expectFolded(embed: Locator, folded: boolean): Promise<void> {
	if (folded) {
		await expect(embed).toHaveClass(FOLDED_RE);
		return;
	}
	await expect(embed).not.toHaveClass(FOLDED_RE);
}

function isFoldedNow(embed: Locator): Promise<boolean> {
	return embed.evaluate((node, cls) => node.classList.contains(cls), CLS_FOLDED);
}

/**
 * Waits for the plugin to have WRITTEN this value to `data.json`. Polls because the save
 * is an unawaited consequence of the toggle click, not something the UI reports.
 */
async function expectPersistedStartCollapsed(startCollapsed: boolean): Promise<void> {
	await expect
		.poll(() => ObsidianHarness.readPersistedPluginData())
		.toMatchObject({ startCollapsed });
}

async function expectToggleState(toggle: Locator, enabled: boolean): Promise<void> {
	if (enabled) {
		await expect(toggle).toHaveClass(TOGGLE_ENABLED_RE);
		return;
	}
	await expect(toggle).not.toHaveClass(TOGGLE_ENABLED_RE);
}

async function setStartCollapsedInSettings(enabled: boolean): Promise<void> {
	await harness.openPluginSettingsTab();
	const toggle = startCollapsedToggle();
	// The tab must already show the CURRENT value, or the click below would be flipping
	// something unknown — and every assertion after it would be meaningless.
	await expectToggleState(toggle, !enabled);
	await toggle.click();
	await expectToggleState(toggle, enabled);
	await harness.closeSettings();
}

test("reading mode: a plain `![[child]]` starts folded when the setting is on", async () => {
	await openInReadingMode(NOTE_A_PATH);
	const unmarked = readingEmbeds().nth(EMBED_UNMARKED);
	await expectFolded(unmarked, true);
	// Prove the body is really collapsed, not just that a class landed.
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeHidden();
});

test("reading mode: a `![[child]]-` is folded too while the setting is on", async () => {
	// Truth-table row 4: the marker is redundant, never contradictory.
	await expectFolded(readingEmbeds().nth(EMBED_MARKED), true);
});

test("reading mode: the marker dash is still stripped while the setting is on", async () => {
	// The setting makes `-` a no-op for FOLDING, and nothing more: the marker must still
	// be parsed away, or it would start rendering as literal text.
	//
	// The sibling's EXISTENCE is asserted separately on purpose: `?? ""` would report the
	// same empty string when the dash was stripped and when there is no sibling to strip
	// it from, so the day Obsidian changes how it wraps the paragraph this assertion would
	// silently stop being able to fail.
	const trailingText = await readingEmbeds()
		.nth(EMBED_MARKED)
		.evaluate((node) => node.nextSibling?.textContent ?? null);
	expect(trailingText).not.toBeNull();
	expect(trailingText).not.toMatch(/^-/);
});

test("reading mode: an explicit unfold beats the setting, across a re-render", async () => {
	const unmarked = readingEmbeds().nth(EMBED_UNMARKED);
	await unmarked.locator(".markdown-embed-title").click();
	await expectFolded(unmarked, false);

	await harness.setMarkdownViewMode("source");
	await harness.setMarkdownViewMode("preview");

	// Re-rendered from scratch: the session store's explicit choice must still win over
	// the setting's "start collapsed" default.
	await expect(readingEmbeds().nth(EMBED_UNMARKED)).toBeAttached();
	await expectFolded(readingEmbeds().nth(EMBED_UNMARKED), false);
});

test("live preview: a plain `![[child]]` starts folded when the setting is on", async () => {
	await openInLivePreview(NOTE_A_PATH);
	const unmarked = editorEmbeds().nth(EMBED_UNMARKED);
	await expectFolded(unmarked, true);
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeHidden();
});

test("live preview: the FIRST click unfolds an embed folded only by the setting", async () => {
	const unmarked = editorEmbeds().nth(EMBED_UNMARKED);
	await unmarked.locator(".markdown-embed-title").click();

	// Guards the fold rule: the embed is folded with NO explicit choice recorded, so a
	// toggle reading the raw fold field would compute `!undefined === true`, dispatch
	// "fold" on an already-folded embed, and look dead.
	await expectFolded(unmarked, false);
});

test("turning the setting off makes a freshly opened note render expanded in reading mode", async () => {
	await setStartCollapsedInSettings(false);

	await openInReadingMode(NOTE_B_PATH);
	await expectFolded(readingEmbeds().nth(EMBED_UNMARKED), false);
});

test("with the setting off Live Preview renders that note expanded too", async () => {
	await openInLivePreview(NOTE_B_PATH);
	await expectFolded(editorEmbeds().nth(EMBED_UNMARKED), false);
});

test("the settings tab writes the new value through to data.json", async () => {
	// The flip happened in the two tests above; this asserts the FILE, which is the only
	// thing that outlives the process. Without it nothing here fails when the plugin
	// never calls `saveData` — the seeded file would keep answering for it.
	await expectPersistedStartCollapsed(false);
});

test("live preview: a title click is never dead after the setting is flipped under an open pane", async () => {
	// The trap: the setting is read when an embed is SYNCED, and an already-open pane is
	// deliberately not re-folded when it changes ("next render is enough"). So right after
	// this flip the recomputed default and the rendered DOM disagree.
	await setStartCollapsedInSettings(true);

	const unmarked = editorEmbeds().nth(EMBED_UNMARKED);
	const foldedBeforeClick = await isFoldedNow(unmarked);
	await unmarked.locator(".markdown-embed-title").click();

	// Asserted as "the displayed state INVERTED", not as a fixed end state: what must hold
	// is that a click always does what the user just saw it should do. A toggle that
	// inverts the recomputed default instead dispatches the state already on screen, and
	// the first click after the flip visibly does nothing.
	await expectFolded(unmarked, !foldedBeforeClick);
});

test("the setting survives an Obsidian restart", async () => {
	// The setting was turned back ON above, so the post-restart expectation ("folded")
	// differs from the built-in default — a data.json that was not read would show up as
	// an expanded embed.
	await expectPersistedStartCollapsed(true);

	harness = await harness.relaunch();
	page = harness.page;

	await openInReadingMode(NOTE_B_PATH);
	await expectFolded(readingEmbeds().nth(EMBED_UNMARKED), true);
});
