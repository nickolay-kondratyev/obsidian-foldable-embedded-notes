import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";

/**
 * DURABILITY of the settings WRITE path, driven against a REAL Obsidian.
 *
 * Deliberately a sibling of `start-collapsed-setting.e2e.ts` rather than more tests in it:
 * that suite is about what the setting DOES (fold defaults in both render modes) and owns a
 * serial state machine around notes it opened. This one asserts only what `data.json` looks
 * like after the tab writes — it needs its own seed (a key this plugin version knows nothing
 * about) and hostile clicking, neither of which belongs in that story.
 *
 * Serial, ONE Obsidian for the file: the second test starts from the state the first left.
 */

test.describe.configure({ mode: "serial" });

const DATA_JSON_PATH = `.obsidian/plugins/${PLUGIN_ID}/data.json`;
const SETTING_NAME = "Start embedded notes collapsed";

/**
 * A `data.json` key this plugin version does not know: what a NEWER version (or the user's
 * own hand-edit) would have left behind in a synced vault. Saving must round-trip it.
 */
const UNKNOWN_KEY = "someFutureSetting";
const UNKNOWN_VALUE = "keep-me";

const FIXTURES = {
	// Seeded OFF, which is also the default — so every assertion below turns on the value
	// that had to be WRITTEN, never one the seed could answer for.
	[DATA_JSON_PATH]: JSON.stringify({ startCollapsed: false, [UNKNOWN_KEY]: UNKNOWN_VALUE }),
};

/** Obsidian's own class for a toggle in the "on" position. */
const TOGGLE_ENABLED_RE = /\bis-enabled\b/;

/**
 * Clicks fired inside ONE JavaScript task, so all their `onChange` handlers — which
 * Obsidian does not await — are in flight together. Odd, so the final UI state is the
 * OPPOSITE of the starting one: a fix that simply dropped writes would fail too.
 *
 * WHY so many for what a user does by double-clicking: which unordered write wins is timing
 * dependent, so the more overlapping saves there are, the likelier a stale one lands last.
 *
 * BE HONEST about what this test is: a GUARD, not a reproduction. Against the unserialized
 * store it still passed on every run here (Obsidian's writes happened to complete in order),
 * so it did not go red on demand. What it does catch for certain is a future change that
 * drops writes, writes a stale value, or leaves one queued behind the final one.
 */
const OVERLAPPING_CLICKS = 51;

/**
 * How long a stale write is given to land after the file already agrees with the UI.
 * WHY a fixed wait: the property under test is the ABSENCE of a later write, and nothing
 * in the UI reports "no more saves are coming". Polling alone cannot see it — a poll
 * passes on the first matching read and would happily miss a contradicting write that
 * lands a moment later.
 */
const STALE_WRITE_GRACE_MS = 1_000;

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch({ extraFixtures: FIXTURES });
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

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

/**
 * The WHOLE on-disk object, asserted by strict equality on purpose: a partial match cannot
 * fail when a key is DROPPED, which is half of what this suite is about.
 */
async function expectPersistedData(startCollapsed: boolean): Promise<void> {
	await expect
		.poll(() => ObsidianHarness.readPersistedPluginData())
		.toEqual({ startCollapsed, [UNKNOWN_KEY]: UNKNOWN_VALUE });
}

test("a toggle keeps data.json keys this version knows nothing about", async () => {
	await harness.openPluginSettingsTab();
	const toggle = startCollapsedToggle();
	await expectToggleState(toggle, false);

	await toggle.click();

	await expectToggleState(toggle, true);
	await harness.closeSettings();
	await expectPersistedData(true);
});

test("overlapping toggles leave data.json agreeing with the final UI state", async () => {
	await harness.openPluginSettingsTab();
	const toggle = startCollapsedToggle();
	await expectToggleState(toggle, true);

	// One task, N clicks: Playwright's own `click()` yields between clicks, which lets each
	// save finish and hides the very interleaving under test.
	await toggle.evaluate((node, clicks) => {
		for (let index = 0; index < clicks; index += 1) {
			(node as HTMLElement).click();
		}
	}, OVERLAPPING_CLICKS);

	await expectToggleState(toggle, false);
	await harness.closeSettings();
	await expectPersistedData(false);

	// The file agreed once — now prove it STAYS agreed, i.e. no earlier save is still queued
	// behind it with the value the user has already changed their mind about.
	await page.waitForTimeout(STALE_WRITE_GRACE_MS);
	expect(await ObsidianHarness.readPersistedPluginData()).toEqual({
		startCollapsed: false,
		[UNKNOWN_KEY]: UNKNOWN_VALUE,
	});
});
