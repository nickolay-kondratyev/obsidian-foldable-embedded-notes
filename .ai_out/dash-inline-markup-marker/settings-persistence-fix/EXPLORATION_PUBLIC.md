# Exploration: dash glued to inline markup wrongly arms the fold marker

Repo: /home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes
Branch: settings-persistence-fix

A matching bug ticket already exists at
`_tickets/reading-mode-a-dash-glued-to-inline-markup-x-bold-wrongly-arms-the-fold-marker.md`
with the same design and acceptance criteria given in the task context. Treat that file as
authoritative for scope; this doc is the technical map for implementing it.

## 1. `stripFoldMarker` and its callers

File: `src/foldableEmbedsPostProcessor.ts`

```
9:  /** Single fold marker character; `![[x]]-` folds by default. */
10: const FOLD_MARKER = "-";
```

Caller (`makeFoldable`, line 85):
```
85:   const hasFoldMarker = this.stripFoldMarker(embed);
86:   const key = this.buildKey(embed, ctx, sectionEl, indexWithinSection);
87:   const folded = this.store.get(key) ?? foldedByDefault(this.readSettings(), hasFoldMarker);
```
`stripFoldMarker` is called exactly once per embed, before the embed is wired; its boolean
return only feeds the "folded by default" decision (via `foldedByDefault` in
`src/settings/foldableEmbedsSettings.ts`) — the fold-state STORE (`FoldStateStore`) can still
override it on reopen. `hasFoldMarker` is not otherwise used.

Current implementation (lines 128-157):
```
128: /**
129:  * STRICT fold-marker parse. `-` counts as a marker only when it is the FIRST
130:  * character of the embed span's next text-node sibling (i.e. immediately after
131:  * `]]`, no whitespace between) AND is itself followed by whitespace or the end
132:  * of that text node. `![[x]]-like` therefore keeps its literal dash.
133:  *
134:  * When it IS a marker, only the dash is removed so it never renders; any
135:  * trailing text/whitespace on that node is preserved. Structural check (no
136:  * regex lookbehind) — required for Obsidian mobile/iOS Safari.
137:  *
138:  * @returns whether this embed carries the fold marker (see `foldedByDefault` for what
139:  *          that means once the "start collapsed" setting is taken into account).
140:  */
141: private stripFoldMarker(embed: HTMLElement): boolean {
142:   const sibling = embed.nextSibling;
143:   if (sibling === null || sibling.nodeType !== Node.TEXT_NODE) {
144:     return false;
145:   }
146:   const text = sibling.textContent ?? "";
147:   if (!text.startsWith(FOLD_MARKER)) {
148:     return false;
149:   }
150:   const afterMarker = text.slice(FOLD_MARKER.length);
151:   const followedByWhitespaceOrEol = afterMarker === "" || /^\s/.test(afterMarker);
152:   if (!followedByWhitespaceOrEol) {
153:     return false;
154:   }
155:   sibling.textContent = afterMarker;
156:   return true;
157: }
```

### The bug

`afterMarker === ""` is meant to mean "the dash is the last character before end of line", but
it actually only means "the dash is the last character of THIS TEXT NODE". When inline markup
(`**bold**`, `` `code` ``, a link, etc.) immediately follows the dash, Obsidian's renderer
splits that markup into a SIBLING element (e.g. `<strong>`) — so the text node containing the
dash is just `"-"`, `afterMarker` is `""`, and the branch wrongly treats it as end-of-line. The
dash gets stripped and the embed folds by default, even though `![[x]]-**bold**` should keep a
literal dash and stay unfolded (matching the already-correct `![[x]]-x` case, where `x` stays
in the SAME text node so `afterMarker` is `"x"` and correctly fails the whitespace test).

### Proposed fix (from the ticket, matches task context)

Keep the existing "followed by whitespace" branch. For the `afterMarker === ""` case, ALSO
require that `sibling` (the text node holding the dash) is the last inline node before a
line-break or block end:
```
sibling.nextSibling === null || sibling.nextSibling instanceof HTMLBRElement
```
This stays structural (no regex lookbehind — see section 5) and needs no new state: `sibling`
is already in scope.

Boundary the fix must get right: `![[x]]- ` (dash then a space, same text node) must keep
folding — that already works today via the `/^\s/` branch and is untouched by this fix.
`![[x]]-\n` inside a paragraph (soft line break) renders as a `<br>` sibling in Obsidian reading
mode, which is exactly why `HTMLBRElement` is in the proposed check.

## 2. Unit test infrastructure: NONE

`package.json` scripts (full list): `dev`, `build` (`tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`),
`version`, `lint` (`eslint .`), `setup:obsidian`, `setup:dev-vault`, `test:e2e` (`bash scripts/run-e2e.sh`).
There is no `test` script, no vitest/jest config file anywhere in the repo (checked for
`vitest.config*`, `jest.config*`, `*.test.ts` — none found outside `node_modules`), and no
test-runner devDependency (only `@playwright/test`, `typescript`, `eslint*`, `esbuild`,
`obsidian`, `@codemirror/*`). All behavioural coverage in this repo is the real-Obsidian e2e
suite under `e2e/`. Any fix here can ONLY be verified/regression-guarded via e2e (or manual
testing) — there is no faster unit-level place to add a test.

## 3. e2e harness structure

Directory `e2e/`: `foldable-embeds.e2e.ts` (reading mode, the target for the new case),
`live-preview-foldable-embeds.e2e.ts`, `settings-persistence.e2e.ts`,
`start-collapsed-setting.e2e.ts`, `hello-world.e2e.ts`, plus shared helpers
`obsidianHarness.ts` (launches real Obsidian via Playwright, `ObsidianHarness.launch({ extraFixtures })`),
`foldAssertions.ts` (`expectFolded`), `reRenderGuard.ts` (`captureElement`/`expectFreshElement`),
`obsidianAppApi.ts`, `playwright.config.ts`, `tsconfig.json`.

### Fixture creation
`ObsidianHarness.launch({ extraFixtures })` seeds a throwaway vault copy; the DEFAULT vault
already has `.dev-vault/parent.md` containing (in order) `![[child]]` (unmarked) and
`![[child]]-` (marker). Additional notes are supplied as a `Record<vaultRelativePath, content>`
map passed as `extraFixtures`, e.g. in `foldable-embeds.e2e.ts`:
```ts
harness = await ObsidianHarness.launch({
	extraFixtures: {
		[NEGATIVE_NOTE_PATH]: "# Negative\n\n![[child]]-x\n",
		[TWINS_NOTE_PATH]: "# Twins\n\n![[child]]\n\n![[child]]\n",
		...
	},
});
```
`ObsidianHarness.prepareVaultCopy` (in `e2e/obsidianHarness.ts` ~line 441-454) writes each
fixture file into the copied dev vault before Obsidian boots.

### Asserting folded vs not folded
`foldAssertions.ts`'s `expectFolded(embed: Locator, folded: boolean)` checks the `fen-folded`
CSS class (`CLS_FOLDED`), with care taken (documented in the file) around Playwright's
vacuous-pass footguns for negated/array matchers — always call `expectFolded`, don't hand-roll
class assertions.

### Asserting dash stripped vs literal
Via a small helper local to `foldable-embeds.e2e.ts`:
```ts
function nextSiblingText(embed: Locator): Promise<string> {
	return embed.evaluate((node) => node.nextSibling?.textContent ?? "");
}
```
then `expect(await nextSiblingText(embed)).not.toMatch(/^-/)` (stripped) or
`.toMatch(/^-x/)` (literal, negative case).

### Existing `![[child]]-x` negative case (verbatim, lines 133-141)
```ts
test("strict-marker negative `![[child]]-x` stays unfolded with the dash visible", async () => {
	await harness.openFile(NEGATIVE_NOTE_PATH);
	await harness.setMarkdownViewMode("preview");

	const embed = foldableEmbeds().first();
	await expectFolded(embed, false);
	// The literal dash (and its glued `x`) must remain in the trailing text node.
	expect(await nextSiblingText(embed)).toMatch(/^-x/);
});
```

### Existing positive marker test (verbatim, lines 85-95)
```ts
test("`![[child]]-` renders folded, body hidden, no visible dash", async () => {
	const marked = foldableEmbeds().nth(1);
	await expectFolded(marked, true);
	// Prove the CSS collapses the RIGHT element: the populated body is actually
	// hidden (not merely that the class is present). Non-tautological — the
	// unfolded embed above asserts the same locator is visible.
	await expect(marked.locator(".markdown-embed-content").first()).toBeHidden();
	// The marker dash was stripped from the trailing text node, so nothing after
	// the embed still begins with '-'.
	expect(await nextSiblingText(marked)).not.toMatch(/^-/);
});
```

### Adding the new case
Per the ticket, add fixtures like `[BOLD_NOTE_PATH]: "# Bold\n\n![[child]]-**bold** tail\n"` (or
reuse `NEGATIVE_NOTE_PATH`'s note by adding another line/embed) to `extraFixtures` in
`beforeAll`, then a new `test(...)` block right after the existing negative-marker test (line
133-141) asserting `expectFolded(embed, false)` and that the rendered text still shows a literal
`-` immediately before the bold content. Because `**bold**` becomes a `<strong>` sibling element
(not part of the same text node), the assertion needs to check the DASH is still visible
somewhere in the embed's following inline content — e.g. assert on `embed.nextSibling` text
directly (should now be `"-"`, not stripped) AND/OR use a locator/regex over the parent
paragraph's rendered text to confirm a literal `-` appears before "bold". Whichever assertion
style is used, keep it next to (not replacing) the existing `![[child]]-x` test, and note in a
comment which specific DOM shape (`text node "-"` + `<strong>` sibling) is being exercised, since
that's exactly what the current bug silently mishandles.

## 4. Running lint / build / e2e

- Lint: `npm run lint` (→ `eslint .`)
- Build (type-check + bundle): `npm run build` (→ `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`)
- e2e: `npm run test:e2e` (→ `bash scripts/run-e2e.sh`), or `npm run test:e2e -- e2e/foldable-embeds.e2e.ts` to scope to one spec file.
  - `scripts/run-e2e.sh`: if `OBSIDIAN_PATH` is unset, auto-downloads a pinned Obsidian 1.12.7
    (Linux-only auto-download, via `scripts/setup-obsidian-bin.sh`, cached under
    `${XDG_CACHE_HOME:-$HOME/.cache}/obsidian-e2e` or `$OBSIDIAN_CACHE_DIR`); then runs
    `npm run setup:dev-vault`, type-checks `e2e/` (`npx tsc -p e2e/tsconfig.json`), then
    `npx playwright test --config e2e/playwright.config.ts`.
  - In a headless/no-display environment (no `$DISPLAY`/`$WAYLAND_DISPLAY`), the script auto-sets
    `OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"` (overridable).
  - On non-Linux, `setup-obsidian-bin.sh` refuses to auto-download; set `OBSIDIAN_PATH` manually
    to a local Obsidian binary.
  - Approximate runtime: not separately timed in this exploration (read-only pass); the suite
    launches ONE real Electron/Obsidian instance per spec file (`test.describe.configure({ mode: "serial" })`
    in `foldable-embeds.e2e.ts`) and drives multiple UI interactions per file — expect on the
    order of tens of seconds per spec file plus Electron startup overhead; the FIRST run also
    pays the one-time Obsidian binary download.

## 5. Mobile / iOS Safari lookbehind constraint

- `src/foldableEmbedsPostProcessor.ts:136`: "Structural check (no regex lookbehind) — required
  for Obsidian mobile/iOS Safari." directly in `stripFoldMarker`'s doc comment.
- `CLAUDE.md:104`: "Avoid Node/Electron APIs for mobile compatibility; set `isDesktopOnly`
  accordingly." (general mobile-compat note, not lookbehind-specific).
- Prior exploration doc `.ai_out/reading-mode-foldable-embeds/master/EXPLORATION_PUBLIC.md`
  documents the `eslint-plugin-obsidianmd` rule `regexLookbehind` — "lookbehind regex
  unsupported on some iOS Safari versions (Obsidian mobile)" — as the origin of this constraint;
  the strict marker parse was written structurally (inspecting `nextSibling` text) specifically
  to avoid `(?<=\]\])`-style lookbehind assertions. The ticket for this bug explicitly repeats
  "Keep the structural (no-lookbehind) style — it is required for Obsidian mobile/iOS Safari,"
  so the fix must extend the structural approach (checking `sibling.nextSibling`) rather than
  introduce any lookbehind regex.
- `src/livePreview/markedEmbedLines.ts` uses a plain (non-lookbehind) whole-line regex
  `/^!\[\[[^\]\n]+\]\]-[ \t]*$/` — also lookbehind-free, consistent with the constraint, though
  its own doc comment doesn't call out lookbehind by name (see section 7 for why its approach
  differs).

## 6. Where the marker-parsing rule is documented

- `src/foldableEmbedsPostProcessor.ts:128-140` — the primary doc comment on `stripFoldMarker`
  itself (currently states the CURRENT, buggy rule: "AND is itself followed by whitespace or the
  end of that text node" and "`![[x]]-like` therefore keeps its literal dash" — this comment
  needs updating once the fix lands, since "end of that text node" will no longer be sufficient
  on its own).
- `src/livePreview/markedEmbedLines.ts:8-13` doc comment on `WHOLE_LINE_MARKED_EMBED` explicitly
  contrasts the two parsers: "WHY whole-line only (vs reading mode's 'dash right after any
  `]]`')" — this comparison will still be accurate after the fix (reading mode's rule becomes
  MORE precise, not fundamentally different in spirit), but is worth a re-read/update pass to
  make sure it doesn't misstate reading mode's rule post-fix.
- `CLAUDE.md` does not appear to document the marker syntax rule itself in detail (only a
  general mobile-compat note at line 104); `grep -n -i "marker"` hits in CLAUDE.md are just
  cross-references ("marker parsing", "marker dash", "marker syntax") inside a higher-level
  architecture description, not a rule specification — no CLAUDE.md section needs a content
  rewrite, just check it still reads correctly.
- `_tickets/reading-mode-a-dash-glued-to-inline-markup-x-bold-wrongly-arms-the-fold-marker.md`
  is the ticket for this exact bug and already contains the intended design/acceptance
  criteria — the implementer should treat it as the primary source of truth and update its
  `status` field per whatever workflow this repo uses for tickets.

## 7. Live Preview (`src/livePreview/markedEmbedLines.ts`) — NOT affected

`findMarkedEmbedLines` operates on raw CodeMirror document text via `doc.iterLines()`, matching
each full line against `WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/`. This regex
requires the ENTIRE line, from `![[` to end, to be `![[target]]-` plus only trailing
spaces/tabs — nothing else on the line. `![[x]]-**bold** tail` as raw text does NOT match this
regex (the line contains `**bold** tail` after the dash, which isn't `[ \t]*`), so Live Preview
correctly does NOT treat it as marked; it only hides the dash for genuinely whole-line
`![[x]]-` (optionally with trailing whitespace) markers. This is because Live Preview parses
literal source text (no DOM/inline-render split into sibling nodes the way reading mode's HTML
output does), so the "text node ends here but line doesn't" ambiguity that causes the reading-mode
bug simply cannot arise here — a line either is or is not entirely `![[x]]-` (plus blanks), full
stop. The file's own doc comment (lines 8-13) explicitly explains this design tradeoff: raw-text
whole-line matching was chosen specifically because a partial/positional raw-text scan "cannot
tell a real embed from one inside a code span," and whole-line matching sidesteps that — as a
side effect it also sidesteps this ticket's bug class entirely. CONCLUSION: no change needed in
`markedEmbedLines.ts` for this ticket; verified by reading the regex and the iteration logic,
not just by argument from the comment.
