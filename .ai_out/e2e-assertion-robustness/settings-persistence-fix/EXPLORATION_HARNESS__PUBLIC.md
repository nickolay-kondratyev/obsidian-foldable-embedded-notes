# EXPLORATION_HARNESS — PUBLIC

Map of the e2e layer as it exists on branch `settings-persistence-fix`.

> Written by TOP_LEVEL_AGENT on behalf of the Explore agent (that role had no write tool).
> Line numbers below are the explorer's reading of the CURRENT tree and differ from the ticket's
> (the ticket was written before the settings-persistence commits). Re-verify before editing.

## 1. Process lifecycle (`e2e/obsidianHarness.ts`)

**Spawn** (`spawnAndConnect`, ~130-153):

```ts
const obsidianProcess = childProcess.spawn(executablePath, [
	`--user-data-dir=${SANDBOX_CONFIG_DIR}`,
	"--remote-debugging-port=0",
	...(process.platform === "linux" ? ["--no-sandbox"] : []),
	...(process.env["OBSIDIAN_E2E_EXTRA_ARGS"]?.split(" ").filter((a) => a !== "") ?? []),
]);
try { /* waitForDevtoolsEndpoint -> connectOverCDP -> waitForObsidianWindow
         -> waitForWorkspaceReady -> enableCommunityPlugins */ }
catch (error) { obsidianProcess.kill(); throw error; }
```

- No `stdio` option → default `"pipe"`. **stdout is never drained** (defect 4).
- Catch path: bare, un-awaited `kill()`, asymmetric with `close()` (~155-164) which always uses
  `killAndWaitForExit`. A launch failure can leave a dying Obsidian still writing the sandbox dirs.

**stderr** — listened to ONLY inside `waitForDevtoolsEndpoint` (~420-445): accumulates into
`stderrSoFar`, regex-matches `DevTools listening on (ws://\S+)`, resolves. The `data` listener is
**never removed** after resolve, so the whole session accumulates in memory; conversely nothing
*reports* stderr after boot (post-boot crashes are silently dropped).

**`killAndWaitForExit`** (~173-186): no-op if already exited; else `SIGKILL` timer
(`FORCE_KILL_AFTER_MS`), `once("exit")` → resolve, then `kill()`.

**`prepareSandboxConfigDir`** (~394-405): wipes + recreates `SANDBOX_CONFIG_DIR`, writes
`obsidian.json` (vault registered, `open: true`, fixed `E2E_VAULT_ID`), then `seedWindowState()`.

**`readPersistedPluginData`** (~320-335, static): reads
`<VAULT_COPY_DIR>/.obsidian/plugins/<PLUGIN_ID>/data.json` from Node. Returns `null` when the file
does not exist (a valid terminal answer, deliberately not retried). **Already has** a parse retry:
`PERSISTED_DATA_READ_ATTEMPTS = 5` at `PERSISTED_DATA_READ_RETRY_MS = 50`ms — but **rethrows on the
last attempt**, which is exactly what `expect.poll` cannot absorb (defect 3 is PARTIALLY mitigated,
not fixed). The retry also does not cover an `ENOENT` race between `existsSync` and `readFileSync`.

**Boot polling**: `waitForObsidianWindow` (~447-468) polls contexts/pages for a URL starting
`app://obsidian.md` every `WINDOW_POLL_INTERVAL_MS=250` up to `LAUNCH_TIMEOUT_MS=60000`;
`waitForWorkspaceReady` (~470-476) waits on `app.workspace.layoutReady`;
`enableCommunityPlugins` (~478-495) enables + polls `app.plugins.plugins[id]`.

## 2. `expectFolded` (`e2e/start-collapsed-setting.e2e.ts:90-96`)

```ts
async function expectFolded(embed: Locator, folded: boolean): Promise<void> {
	if (folded) { await expect(embed).toHaveClass(FOLDED_RE); return; }
	await expect(embed).not.toHaveClass(FOLDED_RE);   // <-- passes on a MISSING element
}
```

`FOLDED_RE = /\bfen-folded\b/` (:41). Call sites and polarity:

| line | polarity |
|------|----------|
| 134 | positive |
| 141 | positive |
| 162 | **negative** |
| 170 | **negative** |
| 176 | positive (live preview) |
| 187 | **negative** (live preview first click) |
| 194 | **negative** |
| 199 | **negative** |
| 223 | **dynamic** — `!foldedBeforeClick`, the dead-click guard |
| 236 | positive, post-`relaunch()` |

:223 is fed by `isFoldedNow(unmarked)` at :216 — a raw non-retrying `classList.contains` via
`evaluate`, then a retrying `expect` three lines later. Fragility point worth noting.

`expectPersistedStartCollapsed` (:106-110) = `expect.poll(() => readPersistedPluginData())
.toMatchObject({ startCollapsed })`; called at :206 and :230 (:232 relaunches).
Sibling `expectPersistedData` in `settings-persistence.e2e.ts:91-95` uses strict `toEqual`
deliberately — that suite proves no key is dropped.

## 3. Round-trip test (`e2e/foldable-embeds.e2e.ts:115-127`)

Clicks `.markdown-embed-title` of `foldableEmbeds().nth(0)` on the already-open `parent.md`, asserts
`fen-folded`, then `setMarkdownViewMode("source")` → `("preview")`, then re-asserts. **It never
leaves the file** — same leaf throughout, so the element survives and the store is never consulted.

**No "open another note then come back" helper exists.** `obsidianAppApi.ts` exposes only
`openFile(vaultPath)` (into `getLeaf(false)`, reusing the active leaf) plus `getLeaf`,
`getMostRecentLeaf`, `getActiveFile`. No history/`goBack` wrapper, no previous-file bookkeeping —
a genuine navigation round-trip must call `openFile` explicitly both ways.

The same in-place mode round-trip is reused verbatim at `start-collapsed-setting.e2e.ts:164-170`.

**Fixtures.** Git-tracked base vault `.dev-vault/`: `parent.md` (embeds `child` twice — `![[child]]`
then `![[child]]-` — and links `[[sibling]]`), `child.md`, `sibling.md`, `.obsidian/*.json`, and the
built plugin. Copied fresh into `.tmp/e2e/vault` by `prepareVaultCopy` on every `launch()`.
Per-spec `extraFixtures` are layered onto the copy only (ephemeral):
- `foldable-embeds`: `marker-negative.md`, `twins.md`, `ref-child.md`, `ref-parent.md`
- `start-collapsed-setting`: seeded `data.json` `{startCollapsed:true}` + `start-collapsed-a/b.md`
- `settings-persistence`: seeded `data.json` `{startCollapsed:false, someFutureSetting:"keep-me"}`
- `live-preview-foldable-embeds`: `lp-embeds.md`, `lp-nested.md`, `lp-nested-child.md`

`sibling.md` already exists in the base vault — a natural "other file" for the round-trip fix.

## 4. Conventions

- One Obsidian process **per spec FILE**: `launch()` in `beforeAll`, `harness?.close()` in `afterAll`.
- Every spec file: `test.describe.configure({ mode: "serial" })` — tests depend on prior state.
- `playwright.config.ts`: `workers: 1`, `fullyParallel: false`, `retries: 0`, test timeout 120s,
  expect timeout 15s. Specs never run concurrently, across files either.
- Harness timeouts: `LAUNCH_TIMEOUT_MS=60000`, `WORKSPACE_READY_TIMEOUT_MS=60000`,
  `PLUGIN_READY_TIMEOUT_MS=30000`, `FORCE_KILL_AFTER_MS=10000`, `WINDOW_POLL_INTERVAL_MS=250`.
- No fixed sleeps in assertions except `settings-persistence.e2e.ts:128`
  (`STALE_WRITE_GRACE_MS = 1000`), justified: proving the ABSENCE of a later write.
- `e2e/tsconfig.json` extends root, `noEmit: true`, `types: ["node"]`. No `e2e/README*` exists.

## 5. Traps for these four fixes

- `relaunch()` (~119-127) re-seeds window state deliberately — Obsidian shrinks the window at
  shutdown, and a tiny window makes pointer interactions silently miss while DOM-only assertions
  still pass. Any restart-related change must keep that reseed.
- Adding a spec file or splitting a test costs a full Electron boot (seriality is a hard constraint).
- A new SHARED fixture belongs in `.dev-vault/` and then needs `npm run setup:dev-vault`; a stale
  dev-vault plugin build throws its own error at `prepareVaultCopy` (~378-381).
- `readPersistedPluginData`'s existing retry is narrower than it looks (parse failures only).
