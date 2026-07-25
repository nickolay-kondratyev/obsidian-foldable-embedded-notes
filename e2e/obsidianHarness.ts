import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
// Also declares the `window.app` global typing the `page.evaluate` callbacks below rely on.
import type { EditorPosition } from "./obsidianAppApi";

/**
 * Launches a REAL Obsidian (Electron) on a throwaway copy of `.dev-vault`,
 * fully sandboxed from any system Obsidian install.
 *
 * Connection: Obsidian is spawned with `--remote-debugging-port=0` and the
 * suite attaches via `chromium.connectOverCDP` to the "DevTools listening on
 * ws://…" endpoint the app prints on stderr.
 * WHY-NOT Playwright's `_electron.launch`: it additionally needs the Electron
 * MAIN process's node inspector (`--inspect=0`), which Obsidian's packaged
 * build ignores (Electron fuses), so `_electron.launch` hangs until timeout —
 * verified against Obsidian 1.12.7. All automation is renderer-level
 * (locators + `window.app`), so browser-level CDP is sufficient.
 *
 * Sandbox mechanism:
 * - `--user-data-dir=<sandbox dir>` isolates Obsidian's own config; a
 *   pre-written `obsidian.json` registers the vault with `open: true` so the
 *   app boots straight into it (no vault picker) and `updateDisabled: true`
 *   stops auto-update traffic.
 * - `--no-sandbox` on Linux: Electron's SUID chrome-sandbox is unavailable in
 *   most CI containers (electron/electron#42510).
 * - Community plugins are enabled AT RUNTIME via `app.plugins.setEnable(true)`
 *   instead of pre-seeding Chromium's localStorage leveldb (WHY-NOT: seeding
 *   requires a leveldb writer dependency for zero extra value here).
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Plugin id from the repo's own manifest — the single source of truth, so this
 * harness is copy-portable across plugin repos.
 */
export const PLUGIN_ID: string = (
	JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8")) as { id: string }
).id;

const DEV_VAULT_DIR = path.join(REPO_ROOT, ".dev-vault");
const E2E_TMP_DIR = path.join(REPO_ROOT, ".tmp", "e2e");
const VAULT_COPY_DIR = path.join(E2E_TMP_DIR, "vault");
const SANDBOX_CONFIG_DIR = path.join(E2E_TMP_DIR, "obsidian-config");
/** Fixed id for the sandbox `obsidian.json` vault entry (shape: 16 hex chars, like Obsidian's own). */
const E2E_VAULT_ID = "0e2e0e2e0e2e0e2e";

const LAUNCH_TIMEOUT_MS = 60_000;
/** Graceful-shutdown grace before SIGKILL in {@link ObsidianHarness.killAndWaitForExit}. */
const FORCE_KILL_AFTER_MS = 10_000;
const WINDOW_POLL_INTERVAL_MS = 250;
/**
 * Physical Obsidian window size pre-seeded into the sandbox (see
 * {@link ObsidianHarness.prepareSandboxConfigDir}). WHY: headless Obsidian
 * (Docker/CI, `--ozone-platform=headless`) otherwise boots into a tiny ~300×200
 * window; wide panes then overflow off-screen, so nothing is physically
 * clickable and pointer-interaction tests can't reach elements (DOM-assertion
 * tests still pass — they query the DOM directly). A CDP
 * `Emulation.setDeviceMetricsOverride` only resizes the LAYOUT viewport, not the
 * input surface, so real clicks still miss; resizing the actual window is the
 * only fix. Obsidian restores this from `<userdata>/<vaultId>.json` at boot.
 */
const WINDOW_WIDTH_PX = 1280;
const WINDOW_HEIGHT_PX = 800;
/** App boot → `layoutReady` covers vault index + workspace restore. */
const WORKSPACE_READY_TIMEOUT_MS = 60_000;
const PLUGIN_READY_TIMEOUT_MS = 30_000;
/** Tolerance for reading `data.json` while it is being rewritten — see `readPersistedPluginData`. */
const PERSISTED_DATA_READ_ATTEMPTS = 5;
const PERSISTED_DATA_READ_RETRY_MS = 50;

export type { EditorPosition };

export class ObsidianHarness {
	private constructor(
		private readonly browser: Browser,
		private readonly obsidianProcess: childProcess.ChildProcess,
		readonly page: Page,
	) {}

	/** Fails fast with an actionable message when the binary env var is absent. */
	static resolveObsidianPath(): string {
		const obsidianPath = process.env["OBSIDIAN_PATH"];
		if (obsidianPath === undefined || obsidianPath === "") {
			throw new Error(
				"OBSIDIAN_PATH is not set. Point it at an Obsidian binary, e.g.\n" +
					"  Linux:  OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh)\n" +
					"  macOS:  export OBSIDIAN_PATH='/Applications/Obsidian.app/Contents/MacOS/Obsidian'\n" +
					"  Windows: set OBSIDIAN_PATH to Obsidian.exe\n" +
					"Then re-run: npm run test:e2e",
			);
		}
		if (!fs.existsSync(obsidianPath)) {
			throw new Error(`OBSIDIAN_PATH does not exist: obsidianPath=[${obsidianPath}]`);
		}
		return obsidianPath;
	}

	/**
	 * Fresh launch: (re)seeds a throwaway vault copy + sandbox config, then boots
	 * Obsidian. `extraFixtures` are `vaultRelativePath → content` notes layered
	 * on top of the copied dev vault (for suites needing their own note shapes).
	 */
	static async launch(options: { extraFixtures?: Record<string, string> } = {}): Promise<ObsidianHarness> {
		ObsidianHarness.prepareVaultCopy(options.extraFixtures);
		ObsidianHarness.prepareSandboxConfigDir();
		return ObsidianHarness.spawnAndConnect();
	}

	/**
	 * Restarts Obsidian against the SAME vault copy + sandbox config — deliberately
	 * WITHOUT re-seeding them (no `prepareVaultCopy` wipe). Use to assert plugin
	 * state persisted in `.obsidian/plugins/<id>/data.json` round-trips a real
	 * restart. Closes the current instance first, then returns a FRESH harness.
	 */
	async relaunch(): Promise<ObsidianHarness> {
		await this.close();
		// Obsidian saved its ACTUAL window size at shutdown; in a headless run
		// that is the tiny default (~300×200), so the relaunched window would be
		// a sliver. Window geometry is environment plumbing (not the persisted
		// plugin state under test), so re-seed it.
		ObsidianHarness.seedWindowState();
		return ObsidianHarness.spawnAndConnect();
	}

	/** Spawns the Obsidian process against the already-prepared dirs and attaches over CDP. */
	private static async spawnAndConnect(): Promise<ObsidianHarness> {
		const executablePath = ObsidianHarness.resolveObsidianPath();
		const obsidianProcess = childProcess.spawn(
			executablePath,
			[
				`--user-data-dir=${SANDBOX_CONFIG_DIR}`,
				// Port 0 = OS-assigned; the concrete endpoint is read from stderr.
				"--remote-debugging-port=0",
				...(process.platform === "linux" ? ["--no-sandbox"] : []),
				// Escape hatch for environment-specific Chromium flags (e.g.
				// `--ozone-platform=headless` on display-less CI) without editing the harness.
				// Space-separated flags only — quoting is NOT supported, so no flag values with spaces.
				...(process.env["OBSIDIAN_E2E_EXTRA_ARGS"]?.split(" ").filter((arg) => arg !== "") ?? []),
			],
			{
				// stdout is DISCARDED rather than piped: nothing here reads it, and an
				// un-drained pipe deadlocks the app once its ~64KB OS buffer fills — Obsidian's
				// `write()` then blocks forever and every later assertion times out looking
				// random. stderr stays piped because the CDP endpoint is announced on it.
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		try {
			const cdpEndpoint = await ObsidianHarness.waitForDevtoolsEndpoint(obsidianProcess);
			const browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: LAUNCH_TIMEOUT_MS });
			const page = await ObsidianHarness.waitForObsidianWindow(browser);
			await ObsidianHarness.waitForWorkspaceReady(page);
			await ObsidianHarness.enableCommunityPlugins(page);
			return new ObsidianHarness(browser, obsidianProcess, page);
		} catch (error) {
			// AWAIT the exit, exactly as `close()` does: a killed-but-not-awaited Obsidian keeps
			// writing sandbox-config files while dying, so the NEXT spec's `prepareSandboxConfigDir`
			// wipe can fail with ENOTEMPTY and mask this original launch failure.
			await ObsidianHarness.killAndWaitForExit(obsidianProcess);
			throw error;
		}
	}

	async close(): Promise<void> {
		// connectOverCDP close() only disconnects; the app process must be ended explicitly.
		// finally: if the CDP disconnect rejects (e.g. connection already dropped), the
		// Obsidian process must still be killed or it would outlive the suite as a zombie.
		try {
			await this.browser.close();
		} finally {
			await ObsidianHarness.killAndWaitForExit(this.obsidianProcess);
		}
	}

	/**
	 * Kills Obsidian and WAITS for the process to actually exit. WHY: a dying
	 * Obsidian still writes sandbox-config files (window state, workspace) on
	 * shutdown; returning before exit lets those writes race the next launch —
	 * observed as `relaunch()`'s re-seeded window state being clobbered and as
	 * `ENOTEMPTY` when the next spec wipes the config dir.
	 */
	private static killAndWaitForExit(proc: childProcess.ChildProcess): Promise<void> {
		if (proc.exitCode !== null || proc.signalCode !== null) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			// Backstop: escalate if graceful shutdown hangs (bounded, condition-based).
			const forceKillTimer = setTimeout(() => proc.kill("SIGKILL"), FORCE_KILL_AFTER_MS);
			proc.once("exit", () => {
				clearTimeout(forceKillTimer);
				resolve();
			});
			proc.kill();
		});
	}

	/** Opens a vault file in a MAIN-AREA leaf. */
	async openFile(vaultPath: string): Promise<void> {
		await this.page.evaluate(async (targetPath) => {
			// Undocumented-but-stable app globals; see obsidianAppApi.ts for the typing.
			const app = window.app;
			const file = app.vault.getAbstractFileByPath(targetPath);
			if (!file) {
				throw new Error(`e2e: vault file not found: path=[${targetPath}]`);
			}
			await app.workspace.getLeaf(false).openFile(file);
		}, vaultPath);
	}

	/**
	 * Re-opens `vaultPath` after a detour through `viaVaultPath`, so its view is REBUILT FROM
	 * SCRATCH — the rendered DOM of the note under test is discarded while the other file is
	 * open and re-created on the way back.
	 *
	 * WHY-NOT a view-MODE round-trip (reading → editing → reading) for this: Obsidian keeps
	 * the reading-view DOM of the file that stays open, so the very elements under assertion
	 * survive it. Any "fold state survives a re-render" assertion built on a mode round-trip
	 * passes even with the fold-state store completely broken. `openFile` reuses the active
	 * leaf and Obsidian tracks no history here, so both hops are explicit.
	 */
	async reopenThroughOtherFile(vaultPath: string, viaVaultPath: string): Promise<void> {
		await this.openFile(viaVaultPath);
		await this.openFile(vaultPath);
	}

	/**
	 * Runs a command by its namespaced id: `<pluginId>:<commandId>`.
	 * Throws when Obsidian reports the command did not execute.
	 */
	async runCommand(commandId: string): Promise<void> {
		const executed = await this.page.evaluate(
			(id) => window.app.commands.executeCommandById(id),
			commandId,
		);
		if (!executed) {
			throw new Error(`e2e: command did not execute: commandId=[${commandId}]`);
		}
	}

	/**
	 * Switches the active main-area markdown leaf to reading ("preview") or
	 * editing ("source") mode by patching its view state — the load-bearing bit is
	 * `state.mode`. Used to exercise the reading-mode-only foldable-embed feature
	 * and to prove fold state survives a mode round-trip.
	 */
	async setMarkdownViewMode(mode: "preview" | "source"): Promise<void> {
		await this.page.evaluate(async (targetMode) => {
			const app = window.app;
			const leaf = app.workspace.getLeaf(false);
			const viewState = leaf.getViewState();
			await leaf.setViewState({
				...viewState,
				state: { ...viewState.state, mode: targetMode },
			});
		}, mode);
	}

	/**
	 * Chooses the flavour of EDITING mode: Live Preview (embeds/markup rendered) or
	 * plain Source mode (raw markdown). Reading mode is orthogonal — see
	 * {@link setMarkdownViewMode}.
	 *
	 * Sets BOTH levers, which are genuinely different things:
	 * - the ACTIVE leaf's view state (`state.source`), the only one an already-open
	 *   editor reacts to. Verified against Obsidian 1.12.7: setting the vault config
	 *   alone leaves an open view on `.markdown-source-view.is-live-preview` even
	 *   after a reading↔editing round-trip and `workspace.updateOptions()`.
	 * - the vault-wide `livePreview` config, which is what views created LATER read.
	 */
	async setLivePreviewEnabled(enabled: boolean): Promise<void> {
		await this.page.evaluate(async (livePreview) => {
			const app = window.app;
			app.vault.setConfig("livePreview", livePreview);
			const leaf = app.workspace.getMostRecentLeaf();
			const viewState = leaf.getViewState();
			await leaf.setViewState({
				...viewState,
				state: { ...viewState.state, source: !livePreview },
			});
		}, enabled);
	}

	/** Places the editor cursor (0-based line/ch) in the active markdown editor. */
	async setCursor(line: number, ch: number): Promise<void> {
		await this.page.evaluate((position) => {
			const app = window.app;
			app.workspace.getMostRecentLeaf().view.editor.setCursor(position);
		}, { line, ch });
	}

	/**
	 * Obsidian's `editor.replaceRange` in the active markdown editor: inserts `text`
	 * at `from`, or replaces `from`..`to` with it when `to` is given (pass `""` to
	 * delete). Positions are 0-based.
	 */
	async replaceRange(text: string, from: EditorPosition, to?: EditorPosition): Promise<void> {
		await this.page.evaluate((edit) => {
			const app = window.app;
			app.workspace.getMostRecentLeaf().view.editor.replaceRange(edit.text, edit.from, edit.to);
		}, { text, from, to });
	}

	/**
	 * Turns the plugin off/on in a running Obsidian — the real unload/load path (plugin
	 * update, "Reload app without saving", dev iteration) that plugin-injected DOM has to
	 * survive.
	 *
	 * WHY the two halves are separately callable (rather than one `reloadPlugin`): the
	 * only falsifiable teardown assertion is the one made WHILE the plugin is off, before
	 * anything rebuilds the DOM.
	 */
	async setPluginEnabled(enabled: boolean): Promise<void> {
		await this.page.evaluate(
			async (options) => {
				const app = window.app;
				const plugins = app.plugins;
				await (options.enabled ? plugins.enablePlugin(options.pluginId) : plugins.disablePlugin(options.pluginId));
			},
			{ pluginId: PLUGIN_ID, enabled },
		);
		await this.page.waitForFunction(
			(options) =>
				Boolean(window.app.plugins.plugins[options.pluginId]) === options.enabled,
			{ pluginId: PLUGIN_ID, enabled },
			{ timeout: PLUGIN_READY_TIMEOUT_MS },
		);
	}

	/**
	 * The plugin's persisted settings AS THEY ARE ON DISK right now, or `null` when there is
	 * nothing readable there — the file has not been written yet, or a read landed inside a
	 * save and kept seeing a half-written one.
	 *
	 * Read from Node, deliberately NOT from `app.plugins.plugins[id].loadData()`: the point
	 * is to prove a real file was written, and asking the running plugin could be answered
	 * by in-memory state. Cheap enough to poll — see the specs that wait for a save.
	 *
	 * NEVER THROWS, and that is load-bearing: callers drive this through `expect.poll`, which
	 * does NOT convert a rejection of the polled function into a retry (it awaits the callback
	 * outside its own try/catch), so a throw here would hard-fail the very assertion whose job
	 * is to be patient. `null` is the one "no answer yet" value, and every caller asserts a
	 * concrete object against it, so a file that stays unreadable still fails the spec — with
	 * the poll's own timeout rather than a stray parse error.
	 *
	 * That safety is a CALLER-SIDE OBLIGATION this function cannot enforce: assert a concrete
	 * expected object (`toEqual` / `toMatchObject`). An assertion satisfied BY `null`
	 * (`toBeNull`, `not.toEqual`) would go green on "the plugin never wrote anything".
	 *
	 * Writing the file is not atomic (truncate, then write), so an in-flight save is genuinely
	 * observable as an empty or half-written file. The short retry below is kept even though
	 * `expect.poll` would also retry: `settings-persistence.e2e.ts` reads this ONCE without a
	 * poll (proving no stale write lands after a grace period), and that call needs the same
	 * tolerance.
	 *
	 * WHY-NOT retry an ABSENT file: "never written" is an answer, not a transient state, and
	 * callers waiting for a first save already poll. Retrying it would only slow those polls.
	 */
	static async readPersistedPluginData(): Promise<unknown> {
		const dataFile = path.join(VAULT_COPY_DIR, ".obsidian", "plugins", PLUGIN_ID, "data.json");
		if (!fs.existsSync(dataFile)) {
			return null;
		}
		for (let attempt = 1; attempt <= PERSISTED_DATA_READ_ATTEMPTS; attempt += 1) {
			try {
				// readFileSync is inside the try on purpose: `existsSync` above can also race a
				// save that recreates the file, so ENOENT is just as transient as a parse error.
				return JSON.parse(fs.readFileSync(dataFile, "utf8"));
			} catch {
				await new Promise((resolve) => setTimeout(resolve, PERSISTED_DATA_READ_RETRY_MS));
			}
		}
		return null;
	}

	/**
	 * Opens Obsidian's settings dialog on THIS plugin's tab (the tab id IS the plugin id).
	 *
	 * WHY drive the real dialog rather than the plugin's settings object: the settings tab
	 * writing through to persistence is precisely what could silently break, and only the
	 * UI path exercises it.
	 *
	 * `app.setting` is UNDOCUMENTED internal API — it is the only handle on the real dialog,
	 * so a future Obsidian breaking it breaks this harness, not the plugin. Fix it here.
	 */
	async openPluginSettingsTab(): Promise<void> {
		await this.page.evaluate((pluginId) => {
			const app = (window as unknown as { app: any }).app;
			app.setting.open();
			app.setting.openTabById(pluginId);
		}, PLUGIN_ID);
	}

	async closeSettings(): Promise<void> {
		await this.page.evaluate(() => (window as unknown as { app: any }).app.setting.close());
	}

	/** Forces the given Obsidian theme by body class (how Obsidian itself switches). */
	async setTheme(theme: "dark" | "light"): Promise<void> {
		await this.page.evaluate((mode) => {
			document.body.classList.toggle("theme-dark", mode === "dark");
			document.body.classList.toggle("theme-light", mode === "light");
		}, theme);
	}

	// --- launch internals ---------------------------------------------------

	/**
	 * Fresh copy of `.dev-vault` per run: tests stay idempotent, runtime
	 * mutations (plugin data.json) never leak into the human's vault, and
	 * e2e-only fixtures never pollute manual QA.
	 */
	private static prepareVaultCopy(extraFixtures: Record<string, string> = {}): void {
		if (!fs.existsSync(DEV_VAULT_DIR)) {
			throw new Error(`Dev vault missing: dir=[${DEV_VAULT_DIR}]. Run: npm run setup:dev-vault`);
		}
		const builtPluginFile = path.join(DEV_VAULT_DIR, ".obsidian", "plugins", PLUGIN_ID, "main.js");
		if (!fs.existsSync(builtPluginFile)) {
			throw new Error(`Plugin build missing in dev vault: file=[${builtPluginFile}]. Run: npm run setup:dev-vault`);
		}
		fs.rmSync(VAULT_COPY_DIR, { recursive: true, force: true });
		fs.cpSync(DEV_VAULT_DIR, VAULT_COPY_DIR, { recursive: true });
		// Fresh plugin settings: a stale data.json (e.g. from a previous aborted
		// run) would silently change settings under the assertions.
		fs.rmSync(path.join(VAULT_COPY_DIR, ".obsidian", "plugins", PLUGIN_ID, "data.json"), { force: true });
		for (const [relativePath, content] of Object.entries(extraFixtures)) {
			const target = path.join(VAULT_COPY_DIR, relativePath);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
	}

	private static prepareSandboxConfigDir(): void {
		fs.rmSync(SANDBOX_CONFIG_DIR, { recursive: true, force: true });
		fs.mkdirSync(SANDBOX_CONFIG_DIR, { recursive: true });
		const obsidianJson = {
			updateDisabled: true,
			vaults: {
				[E2E_VAULT_ID]: { path: VAULT_COPY_DIR, ts: Date.now(), open: true },
			},
		};
		fs.writeFileSync(path.join(SANDBOX_CONFIG_DIR, "obsidian.json"), JSON.stringify(obsidianJson));
		ObsidianHarness.seedWindowState();
	}

	/**
	 * Per-vault window state Obsidian restores at boot (keyed by vault id):
	 * seed a real-sized window so headless runs don't default to ~300×200.
	 * See WINDOW_WIDTH_PX for WHY this matters to pointer-interaction tests.
	 * Called on fresh launches AND on {@link relaunch} (Obsidian overwrites the
	 * file with the actual — headless-tiny — size at shutdown).
	 */
	private static seedWindowState(): void {
		const windowStateJson = { width: WINDOW_WIDTH_PX, height: WINDOW_HEIGHT_PX, zoom: 0 };
		fs.writeFileSync(path.join(SANDBOX_CONFIG_DIR, `${E2E_VAULT_ID}.json`), JSON.stringify(windowStateJson));
	}

	/**
	 * Resolves the "DevTools listening on ws://…" endpoint from the app's stderr.
	 *
	 * The stderr listener is removed on EVERY exit path: it accumulates what it reads into a
	 * string only useful for the boot-failure message, so leaving it attached would grow the
	 * whole session's stderr in memory for the rest of the run.
	 */
	private static waitForDevtoolsEndpoint(proc: childProcess.ChildProcess): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let stderrSoFar = "";
			const onStderrData = (chunk: Buffer): void => {
				stderrSoFar += chunk.toString();
				const match = stderrSoFar.match(/DevTools listening on (ws:\/\/\S+)/);
				if (match?.[1] !== undefined) {
					stopListening();
					resolve(match[1]);
				}
			};
			const stopListening = (): void => {
				clearTimeout(timer);
				proc.stderr?.off("data", onStderrData);
				// Keep DRAINING stderr with nothing attached to it: an un-consumed pipe deadlocks
				// the app once the OS buffer fills, and `resume()` is the documented
				// consume-and-discard. (stdout is not piped at all — see `spawnAndConnect`.)
				proc.stderr?.resume();
			};
			const timer = setTimeout(() => {
				stopListening();
				reject(
					new Error(`Obsidian never announced a DevTools endpoint. stderr so far:\n${stderrSoFar}`),
				);
			}, LAUNCH_TIMEOUT_MS);
			proc.stderr?.on("data", onStderrData);
			proc.on("exit", (code) => {
				stopListening();
				reject(new Error(`Obsidian exited before CDP was available: code=[${code}]\n${stderrSoFar}`));
			});
			proc.on("error", (error) => {
				stopListening();
				reject(error);
			});
		});
	}

	/** Waits for the vault window (`app://obsidian.md/...`) among the CDP-visible pages. */
	private static async waitForObsidianWindow(browser: Browser): Promise<Page> {
		const context = browser.contexts()[0];
		if (context === undefined) {
			throw new Error("CDP connected but Obsidian exposed no browser context");
		}
		const isVaultWindow = (page: Page): boolean => page.url().startsWith("app://obsidian.md");
		// State-poll (window creation AND its later navigation to app:// both
		// count) — CDP has no single event covering both, and the poll is bounded
		// and condition-based, not a race-masking sleep.
		const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const vaultWindow = context.pages().find(isVaultWindow);
			if (vaultWindow !== undefined) {
				return vaultWindow;
			}
			await new Promise((resolveTick) => setTimeout(resolveTick, WINDOW_POLL_INTERVAL_MS));
		}
		throw new Error(
			`No Obsidian vault window appeared. pages=[${context.pages().map((p) => p.url()).join(", ")}]`,
		);
	}

	private static async waitForWorkspaceReady(page: Page): Promise<void> {
		await page.waitForFunction(
			() => window.app?.workspace?.layoutReady === true,
			undefined,
			{ timeout: WORKSPACE_READY_TIMEOUT_MS },
		);
	}

	private static async enableCommunityPlugins(page: Page): Promise<void> {
		// A fresh sandbox shows first-boot modals (vault trust / release notes).
		// Escape dismisses them; plugin enablement below does not depend on the
		// modal's buttons, so this is best-effort cleanup, not a wait.
		await page.keyboard.press("Escape");
		await page.evaluate(async (pluginId) => {
			const app = window.app;
			// setEnable(true) = the "Turn on community plugins" switch: persists the
			// flag and loads every plugin listed in community-plugins.json.
			await app.plugins.setEnable(true);
			await app.plugins.enablePlugin(pluginId);
		}, PLUGIN_ID);
		await page.waitForFunction(
			(pluginId) => Boolean(window.app.plugins.plugins[pluginId]),
			PLUGIN_ID,
			{ timeout: PLUGIN_READY_TIMEOUT_MS },
		);
	}
}
