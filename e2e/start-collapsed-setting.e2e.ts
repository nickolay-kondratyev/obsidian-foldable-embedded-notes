import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";

/**
 * The "start embedded notes collapsed" setting, driven against a REAL Obsidian.
 *
 * The suite starts with the setting SEEDED ON in `data.json` (the default is OFF, so
 * every "starts folded" assertion below is falsifiable: with the setting ignored these
 * plain `![[child]]` embeds would render expanded, exactly as the other two specs assert).
 * It then turns the setting OFF through the real settings dialog, back ON, and restarts
 * Obsidian — the only way to prove the tab writes through to `data.json` and that the
 * value is read back at load.
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
	await expect(unmarked).toHaveClass(FOLDED_RE);
	// Prove the body is really collapsed, not just that a class landed.
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeHidden();
});

test("reading mode: the marker dash is still stripped while the setting is on", async () => {
	// The setting makes `-` a no-op for FOLDING, and nothing more: the marker must still
	// be parsed away, or it would start rendering as literal text.
	const trailingText = await readingEmbeds().nth(EMBED_MARKED).evaluate((node) => node.nextSibling?.textContent ?? "");
	expect(trailingText).not.toMatch(/^-/);
});

test("reading mode: an explicit unfold beats the setting, across a re-render", async () => {
	const unmarked = readingEmbeds().nth(EMBED_UNMARKED);
	await unmarked.locator(".markdown-embed-title").click();
	await expect(unmarked).not.toHaveClass(FOLDED_RE);

	await harness.setMarkdownViewMode("source");
	await harness.setMarkdownViewMode("preview");

	// Re-rendered from scratch: the session store's explicit choice must still win over
	// the setting's "start collapsed" default.
	await expect(readingEmbeds().nth(EMBED_UNMARKED)).toBeAttached();
	await expect(readingEmbeds().nth(EMBED_UNMARKED)).not.toHaveClass(FOLDED_RE);
});

test("live preview: a plain `![[child]]` starts folded when the setting is on", async () => {
	await openInLivePreview(NOTE_A_PATH);
	const unmarked = editorEmbeds().nth(EMBED_UNMARKED);
	await expect(unmarked).toHaveClass(FOLDED_RE);
	await expect(unmarked.locator(".markdown-embed-content").first()).toBeHidden();
});

test("live preview: the FIRST click unfolds an embed folded only by the setting", async () => {
	const unmarked = editorEmbeds().nth(EMBED_UNMARKED);
	await unmarked.locator(".markdown-embed-title").click();

	// Guards the fold rule: the click inverts the EFFECTIVE state (setting included). A
	// toggle blind to the setting would compute `!undefined === true`, dispatch "fold" on
	// an already-folded embed, and look dead.
	await expect(unmarked).not.toHaveClass(FOLDED_RE);
});

test("turning the setting off makes a freshly opened note render expanded in reading mode", async () => {
	await setStartCollapsedInSettings(false);

	await openInReadingMode(NOTE_B_PATH);
	await expect(readingEmbeds().nth(EMBED_UNMARKED)).not.toHaveClass(FOLDED_RE);
});

test("with the setting off Live Preview renders that note expanded too", async () => {
	await openInLivePreview(NOTE_B_PATH);
	await expect(editorEmbeds().nth(EMBED_UNMARKED)).not.toHaveClass(FOLDED_RE);
});

test("the setting survives an Obsidian restart", async () => {
	// Turn it back ON, so the post-restart expectation ("folded") differs from the
	// built-in default — a lost data.json would show up as an expanded embed.
	await setStartCollapsedInSettings(true);

	harness = await harness.relaunch();
	page = harness.page;

	await openInReadingMode(NOTE_B_PATH);
	await expect(readingEmbeds().nth(EMBED_UNMARKED)).toHaveClass(FOLDED_RE);
});
