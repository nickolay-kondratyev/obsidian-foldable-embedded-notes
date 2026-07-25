# Private notes for a future clone of yourself

Scope: read-only exploration only, no code changes made. Everything below is extra context
beyond what's in EXPLORATION_PUBLIC.md — read that first.

## Key surprise
This bug already has a fully-formed ticket sitting in `_tickets/` with the SAME design
(`sibling.nextSibling === null || sibling.nextSibling instanceof HTMLBRElement`) as given in the
task context verbatim — meaning the task context was almost certainly copy-pasted from that
ticket. Status in the ticket frontmatter was `in_progress`, assignee
`CC_WITH-nickolaykondratyev`, created `2026-07-25T00:44:50Z` (today). There's also a prior probe
mentioned in the ticket body: "throwaway probe specs and logs are in the gitignored
`.tmp/probe/`" — I did NOT check whether `.tmp/probe/` still exists in this checkout (it's
gitignored so may or may not be present; worth checking before duplicating probe work). If a
future clone runs this task, check `.tmp/probe/` for `probe*.e2e.ts` — it might already contain
a working repro/fix draft for `![[g]]-**bold** tail` and `` ![[g]]-`code` ``.

## Things I did NOT verify empirically
- Did not actually RUN `npm run lint`, `npm run build`, or `npm run test:e2e` — read-only
  exploration, and running full e2e requires downloading Obsidian (slow, and this session
  didn't need to prove current green/red state). If asked to also verify baseline lint/build
  pass before the fix, that's a quick add: `npm run lint && npm run build` from repo root.
- Did not measure actual e2e wall-clock time. `scripts/run-e2e.sh` downloads a pinned Obsidian
  1.12.7 tarball on first run (cached afterward) then runs Playwright serially per spec file.
  Rough guess: each spec file that boots Obsidian probably takes 15-45s including Electron
  startup; `foldable-embeds.e2e.ts` has ~9 tests but only ONE `beforeAll` launch (serial mode),
  so it's cheaper than the file count suggests. If precision matters, just time a real run.
- Did not check whether there are OTHER embeds-with-marker e2e specs beyond
  `foldable-embeds.e2e.ts` that might need an analogous fixture (e.g.
  `live-preview-foldable-embeds.e2e.ts`, `start-collapsed-setting.e2e.ts`) — the ticket only asks
  for reading-mode coverage, and I confirmed Live Preview isn't affected (section 7 in public
  doc), so I don't think those other files need touching, but a reviewer should double check
  `start-collapsed-setting.e2e.ts` doesn't rely on `stripFoldMarker`'s old behavior in some
  incidental way (I only grepped/read foldable-embeds.e2e.ts and markedEmbedLines.ts in depth;
  I did NOT read start-collapsed-setting.e2e.ts or settings-persistence.e2e.ts line by line).

## Test-writing footguns already flagged in the codebase (worth repeating to the implementer)
`e2e/foldAssertions.ts` has hard-won Playwright matcher gotchas documented inline:
- `expect(missing).not.toHaveClass(re)` (scalar regex) correctly fails on a missing element.
- `not.toHaveClass([/re/])` (ARRAY form) passes VACUOUSLY on zero matched elements — a
  different code path internally. Always use `expectFolded()` rather than hand-rolling class
  assertions in the new test, to not reintroduce this footgun.

## Where exactly to add the new test in foldable-embeds.e2e.ts
The file is `test.describe.configure({ mode: "serial" })` and the LAST test intentionally
disables the plugin (comment: "Last in this serial file: it disables the plugin, so anything
after it would run against a half-torn-down world"). So the new test MUST go before that last
test — natural spot is right after "strict-marker negative `![[child]]-x` stays unfolded..."
(lines 133-141), which is exactly what the ticket says ("alongside the existing `![[child]]-x`
negative case").

Suggested fixture (not yet validated against real Obsidian, just inferred from Obsidian's
markdown renderer splitting inline spans into sibling elements):
```ts
const BOLD_NOTE_PATH = "marker-bold.md";
...
[BOLD_NOTE_PATH]: "# Bold\n\n![[child]]-**bold** tail\n",
```
Then in the new test:
```ts
test("strict-marker negative `![[child]]-**bold**` stays unfolded with a literal dash", async () => {
	await harness.openFile(BOLD_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expectFolded(embed, false);
	// The dash must remain a literal, VISIBLE character even though inline markup
	// immediately follows it in a SIBLING element (not the same text node).
	expect(await nextSiblingText(embed)).toBe("-");
	// Optionally also assert the rendered paragraph text still shows "-bold tail"
	// as a whole, to prove the dash is genuinely visible in the DOM, e.g. via
	// `embed.locator("xpath=..").innerText()` or checking the parent paragraph's
	// textContent contains a literal '-' right after the embed.
});
```
CAVEAT: I have not run this against real Obsidian, so the EXACT DOM shape (is the dash's text
node `"-"` alone, or does Obsidian's markdown-it/embed renderer insert something else, e.g. a
zero-width joiner or extra whitespace between the embed span and the `<strong>`?) is UNVERIFIED
speculation based on how `**bold**` parses generally. The implementer/reviewer should log
`await embed.evaluate(n => Array.from(n.parentElement.childNodes).map(c => [c.nodeType, c.nodeName, c.textContent]))`
once, against a real launch, before locking in assertions — this is exactly the kind of DOM
shape question the ticket's own "MEASURED in reading mode" section already answered by hand
(the ticket author apparently already ran this exact scenario against real Obsidian 1.12.7 and
confirmed FOLDED + dash-stripped is the CURRENT (buggy) behavior for `![[g]]-**bold** tail` and
`` ![[g]]-`code` ``). So the DOM shape is presumably already confirmed to have `sibling.nextSibling`
be a `<strong>` (or similar) element — trust the ticket's empirical claim, but a fresh MEASURED
check before writing the final assertion syntax is still good practice per this repo's own
documentation culture (lots of "MEASURED against Obsidian X.Y.Z" comments throughout the
codebase — this repo clearly values empirical verification over assumption in comments).

## Repo-wide "MEASURED against Obsidian X.Y.Z" culture
Strong convention in this codebase: doc comments frequently say things like "MEASURED against
Obsidian 1.12.7, disabling the plugin does NOT unload..." — any new comment added as part of the
fix should follow this style (state what was verified and against what, rather than assumed).

## Files read in full during this pass
- src/foldableEmbedsPostProcessor.ts (whole file)
- src/livePreview/markedEmbedLines.ts (whole file)
- e2e/foldable-embeds.e2e.ts (whole file)
- e2e/foldAssertions.ts (whole file)
- package.json
- scripts/run-e2e.sh (whole file)
- scripts/setup-obsidian-bin.sh (head only, ~50 lines, enough for the download logic)
- _tickets/reading-mode-a-dash-glued-to-inline-markup-x-bold-wrongly-arms-the-fold-marker.md (whole file)
- .ai_out/reading-mode-foldable-embeds/master/EXPLORATION_PUBLIC.md (section 6 only, via grep context)
- e2e/obsidianHarness.ts (grepped for structure, not read in full — launch/extraFixtures/
  setMarkdownViewMode/setPluginEnabled/reopenThroughOtherFile signatures only)

Not read at all: e2e/live-preview-foldable-embeds.e2e.ts, e2e/settings-persistence.e2e.ts,
e2e/start-collapsed-setting.e2e.ts, e2e/reRenderGuard.ts, e2e/obsidianAppApi.ts,
e2e/playwright.config.ts, src/settings/foldableEmbedsSettings.ts, src/embedFoldDom.ts,
src/foldableEmbedMark.ts, src/foldStateStore.ts, src/wiredElements.ts, eslint.config.mts (only
grepped for existence). If deeper context on `foldedByDefault` or the fold-state store is
needed by the implementer, those are the files to open next.
