import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ObsidianHarness, PLUGIN_ID } from "./obsidianHarness";

/**
 * Hello-world e2e: proves the harness boots a REAL Obsidian, that this repo's
 * plugin actually loads/enables inside it, and that the harness can drive the
 * vault. The plugin has NO feature logic yet, so assertions here are limited to
 * genuine "the plugin loaded" facts — no faked passes. Extend with DOM
 * assertions on the foldable-embed feature once it exists.
 *
 * Serial by design: ONE Obsidian instance is launched for the whole file and
 * later tests may build on earlier navigation state.
 */

test.describe.configure({ mode: "serial" });

/** A note seeded by scripts/setup-dev-vault.sh that embeds another via `![[ ]]`. */
const PARENT_NOTE_PATH = "parent.md";

let harness: ObsidianHarness;
let page: Page;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch();
	page = harness.page;
});

test.afterAll(async () => {
	await harness?.close();
});

test("plugin instance is loaded in a real Obsidian", async () => {
	const loaded = await page.evaluate(
		(pluginId) => Boolean((window as unknown as { app: any }).app.plugins.plugins[pluginId]),
		PLUGIN_ID,
	);
	expect(loaded).toBe(true);
});

test("plugin id is in Obsidian's enabled-plugins set", async () => {
	const enabled = await page.evaluate(
		(pluginId) => (window as unknown as { app: any }).app.plugins.enabledPlugins.has(pluginId),
		PLUGIN_ID,
	);
	expect(enabled).toBe(true);
});

test("opening the embedding fixture note makes it the active file", async () => {
	await harness.openFile(PARENT_NOTE_PATH);
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { app: any }).app.workspace.getActiveFile()?.path ?? null),
		)
		.toBe(PARENT_NOTE_PATH);
});

// Next steps for real coverage (once the foldable-embed feature lands):
// - harness.runCommand(`${PLUGIN_ID}:<your-command-id>`) to drive a command,
//   then assert on rendered DOM: await expect(page.locator(".your-plugin-root")).toBeAttached();
// - harness.relaunch() to assert persisted settings round-trip a real restart.
