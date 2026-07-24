import { expect, test } from "@playwright/test";
import * as path from "node:path";
import { ObsidianHarness } from "./obsidianHarness";

/**
 * THROWAWAY PROTOTYPE PROBE (ticket: explore-foldable-embeds-in-live-preview-editing-mode).
 * Exercises src/livePreviewFoldPrototype.ts against a REAL Obsidian in Live Preview.
 */

test.describe.configure({ mode: "serial" });

const SHOT_DIR = path.resolve(process.cwd(), ".out");
const PARENT_NOTE_PATH = "parent.md";
const CLS_FOLDED = "fen-folded";
const FOLDED_RE = new RegExp(`\\b${CLS_FOLDED}\\b`);

let harness: ObsidianHarness;

test.beforeAll(async () => {
	harness = await ObsidianHarness.launch();
	harness.page.on("console", (msg) => {
		if (msg.type() === "error" || msg.type() === "warning") {
			console.log(`[obsidian ${msg.type()}] ${msg.text()}`);
		}
	});
	harness.page.on("pageerror", (error) => console.log(`[obsidian pageerror] ${error.message}`));
	await harness.page.evaluate(() =>
		(window as unknown as { app: any }).app.vault.setConfig("livePreview", true),
	);
	await harness.openFile(PARENT_NOTE_PATH);
	await harness.setMarkdownViewMode("source");
	await expect(harness.page.locator(".cm-content .internal-embed.fen-embed").nth(1)).toBeAttached();
});

test.afterAll(async () => {
	await harness?.close();
});

/** Embeds the prototype has wired, in document order. */
function embeds() {
	return harness.page.locator(".cm-content .internal-embed.fen-embed");
}

test("marked `![[child]]-` folds by default and the dash is not rendered", async () => {
	await expect(embeds().nth(1)).toHaveClass(FOLDED_RE);
	await expect(embeds().nth(1).locator(".markdown-embed-content").first()).toBeHidden();
	const markedLineText = await embeds()
		.nth(1)
		.evaluate((el) => el.closest(".cm-line")?.textContent ?? "");
	expect(markedLineText.trimEnd().endsWith("-")).toBe(false);
	await harness.page.screenshot({ path: path.join(SHOT_DIR, "lp-proto-default.png") });
});

test("unmarked embed stays unfolded and gets a chevron", async () => {
	await expect(embeds().nth(0)).not.toHaveClass(FOLDED_RE);
	await expect(embeds().nth(0).locator(".fen-collapse-icon svg")).toBeAttached();
});

test("clicking the title toggles the fold", async () => {
	await embeds().nth(0).locator(".markdown-embed-title").click();
	await expect(embeds().nth(0)).toHaveClass(FOLDED_RE);
	await harness.page.screenshot({ path: path.join(SHOT_DIR, "lp-proto-after-click.png") });
	await embeds().nth(0).locator(".markdown-embed-title").click();
	await expect(embeds().nth(0)).not.toHaveClass(FOLDED_RE);
});

test("fold state survives inserting lines above the embed", async () => {
	await embeds().nth(0).locator(".markdown-embed-title").click();
	await expect(embeds().nth(0)).toHaveClass(FOLDED_RE);

	await harness.page.evaluate(() => {
		const app = (window as unknown as { app: any }).app;
		app.workspace.getMostRecentLeaf().view.editor.replaceRange("inserted\n\n", { line: 2, ch: 0 });
	});

	await expect(embeds().nth(0)).toHaveClass(FOLDED_RE);
	await expect(embeds().nth(1)).toHaveClass(FOLDED_RE);
});

test("cursor on the marked line reveals the literal dash", async () => {
	const revealed = await harness.page.evaluate(async () => {
		const app = (window as unknown as { app: any }).app;
		const view = app.workspace.getMostRecentLeaf().view;
		const lines: string[] = view.editor.getValue().split("\n");
		const markedLine = lines.findIndex((l) => l.trim() === "![[child]]-");
		view.editor.setCursor({ line: markedLine, ch: 0 });
		await new Promise((r) => setTimeout(r, 400));
		const embedEl = document.querySelectorAll<HTMLElement>(".cm-content .internal-embed.fen-embed")[1];
		return embedEl?.closest(".cm-line")?.textContent ?? "";
	});
	expect(revealed.trimEnd().endsWith("-")).toBe(true);
});
