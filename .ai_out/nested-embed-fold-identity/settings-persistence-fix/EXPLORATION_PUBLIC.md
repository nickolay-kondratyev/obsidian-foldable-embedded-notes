# EXPLORATION — nested-embed-fold-identity (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e)

Branch: `settings-persistence-fix`. Repo: obsidian-foldable-embedded-notes.

## 0. Ticket line refs are STALE — established truth

The ticket cites `buildKey` in `src/foldableEmbedsPostProcessor.ts:120-130`. That function no
longer exists there. Key derivation now lives entirely in `src/embedFoldKeys.ts`
(`EmbedFoldKeys.keyFor` / `cachedOccurrenceOf` / `scanForOccurrence` / `positionalFallbackKey`),
introduced by commit `83a79a6 Key reading-mode folds by OCCURRENCE, not by source line` and
refined through `ee8b761`/`7c46989` (a prior, separate ticket `nid_7qbtubxk89team9oadnl3hanr_e`,
"line-shift" fold identity — already closed). `foldableEmbedsPostProcessor.ts:194-207`
(`occurrenceOf`) now only *gathers* the raw signals (`sourcePath`, `section`, `indexWithinSection`,
`src`, `renderedSectionText`) and hands them to `EmbedFoldKeys.keyFor`.

**The bug in this ticket is NOT fixed by that prior work** — `embedFoldKeys.ts:87-90` (a doc
comment written by the prior ticket's author) explicitly flags it as still open and UNMEASURED:

```
* - Nested embeds still share ONE key per host (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e). The
*   mechanism is UNMEASURED: `ctx.getSectionInfo` is expected to return null outside a
*   top-level markdown view, in which case such an embed never reaches the occurrence path and
*   takes the `S<hash>` fallback — which is per-host-section, hence one shared key either way.
```

This exploration's job was to replace "UNMEASURED" with fact. See §3.

## 1. `src/embedFoldKeys.ts` — full current key derivation

### Types / port (verbatim)

```ts
export type ReadEmbeds = (sourcePath: string) => readonly EmbedCache[];

export interface EmbedOccurrence {
	readonly sourcePath: string;
	readonly section: MarkdownSectionInformation | null;
	readonly indexWithinSection: number;
	readonly src: string;
	readonly renderedSectionText: string;
}

export interface EmbedFoldKey {
	readonly current: string;
	readonly superseded: string | null;
}

interface CachedOccurrence {
	readonly link: string;   // EmbedCache.link
	readonly ordinal: number; // how many same-link embeds precede it in the note
}
```

`ReadEmbeds` is wired in `src/main.ts:29`:
```ts
const keys = new EmbedFoldKeys((sourcePath) => this.app.metadataCache.getCache(sourcePath)?.embeds ?? []);
```
i.e. `readEmbeds(sourcePath)` = `app.metadataCache.getCache(sourcePath)?.embeds ?? []` — every
`EmbedCache` Obsidian's metadata cache has recorded for that ONE file, in document order.

### `keyFor` (embedFoldKeys.ts:106-118)

```ts
keyFor(occurrence: EmbedOccurrence): EmbedFoldKey {
	const cached = this.cachedOccurrenceOf(occurrence);
	if (cached === null) {
		return { current: this.positionalFallbackKey(occurrence), superseded: null };
	}
	const current = [
		occurrence.sourcePath,
		EmbedFoldKeys.OCCURRENCE_LOCATOR,   // "occ"
		cached.link,
		`#${cached.ordinal}`,
	].join("::");
	return { current, superseded: this.positionalFallbackKey(occurrence) };
}
```
Shape when it succeeds: `sourcePath::occ::<link>::#<ordinal>`.

### How the metadataCache entry is located BY POSITION (embedFoldKeys.ts:126-167)

```ts
private cachedOccurrenceOf(occurrence: EmbedOccurrence): CachedOccurrence | null {
	const section = occurrence.section;
	if (section === null) {
		return null;
	}
	return this.scanForOccurrence(
		this.readEmbeds(occurrence.sourcePath),
		section,
		occurrence.indexWithinSection,
	);
}

private scanForOccurrence(
	embeds: readonly EmbedCache[],
	section: MarkdownSectionInformation,
	indexWithinSection: number,
): CachedOccurrence | null {
	const seenByLink = new Map<string, number>();
	let seenInSection = 0;
	for (const embed of embeds) {
		const link = embed.link;
		const ordinal = seenByLink.get(link) ?? 0;
		const line = embed.position.start.line;
		if (line >= section.lineStart && line <= section.lineEnd) {
			if (seenInSection === indexWithinSection) {
				return { link, ordinal };
			}
			seenInSection++;
		}
		seenByLink.set(link, ordinal + 1);
	}
	return null;
}
```
Algorithm: iterate `readEmbeds(sourcePath)` (ALL embeds of that ONE file, document order),
maintain a per-link running ordinal (`seenByLink`), and — restricted to embeds whose
`position.start.line` falls inside `[section.lineStart, section.lineEnd]` — find the
`indexWithinSection`-th one. First match wins; returns `{link, ordinal}` of the embed at that
position, i.e. the CachedOccurrence. Returns `null` if `section` is `null`, or if no embed of the
scanned file lands at that position (stale cache, cache/DOM mismatch, etc).

**KEY OBSERVATION for this bug**: `this.readEmbeds(occurrence.sourcePath)` is scoped to ONE file.
For a NESTED embed, `occurrence.sourcePath` is the CHILD file's path (see §3), so this scan only
ever sees the CHILD's own embeds (e.g. the grandchild link) — it can never disambiguate WHICH
occurrence of the PARENT's embed of that child is being rendered. That distinction does not
exist anywhere in this file's data model: `sourcePath` alone stands for "the note", with no way
to further qualify "as embedded from position X of some ancestor."

### COLD-CACHE degradation path (embedFoldKeys.ts:169-187)

```ts
private static readonly LINE_LOCATOR = "L";
private static readonly SECTION_HASH_LOCATOR = "S";

private positionalFallbackKey(occurrence: EmbedOccurrence): string {
	const lineStart = occurrence.section?.lineStart;
	const locator =
		lineStart !== undefined
			? `${EmbedFoldKeys.LINE_LOCATOR}${lineStart}`
			: `${EmbedFoldKeys.SECTION_HASH_LOCATOR}${this.hash(occurrence.renderedSectionText)}`;
	return `${occurrence.sourcePath}::${locator}::${occurrence.src}::#${occurrence.indexWithinSection}`;
}
```
Two sub-cases:
- `section !== null` but the occurrence scan found nothing (cold/stale cache, but Obsidian still
  gave a line window) → `L<lineStart>` locator: `sourcePath::L<n>::<src>::#<index>`.
- `section === null` entirely (no section info at all — **this is the nested-embed case**, see
  §3) → `S<hash>` locator, hashing `renderedSectionText` (the whole rendered text of the SECTION
  element, `sectionEl.textContent`) via a djb2 hash (`hash()`, embedFoldKeys.ts:189-196):
  `sourcePath::S<hash>::<src>::#<index>`.

For the nested case, `sourcePath` is the CHILD's path (same for both occurrences of a doubly-
embedded parent), `renderedSectionText` is the CHILD's own body text (identical both times, same
child note), `src` is the grandchild's `src` attribute (identical), and `indexWithinSection` is
the ordinal of the embed within ITS OWN section — for a single-embed child body this is always
`0` for both occurrences. **All four fields are therefore identical across occurrences of the
same host embed → identical `S<hash>` key.** This is the exact mechanism of the bug — see §3 for
the direct confirmation.

### `FoldStateStore.adoptRecordingOf` — cold-cache takeover (called from the post-processor)

`src/foldableEmbedsPostProcessor.ts:89-94`:
```ts
const foldKey = this.keys.keyFor(this.occurrenceOf(embed, ctx, sectionEl, indexWithinSection));
if (foldKey.superseded !== null) {
	// This render can identify the embed better than an earlier one could; carry over
	// whatever the user recorded back then (see FoldStateStore.adoptRecordingOf).
	this.store.adoptRecordingOf(foldKey.superseded, foldKey.current);
}
const key = foldKey.current;
```
`foldKey.superseded` is non-null exactly when `cachedOccurrenceOf` SUCCEEDED (i.e. an occurrence
key was derivable) — see `keyFor` above: it always includes `positionalFallbackKey(occurrence)`
as `superseded` alongside a successful `current`. It is `null` only when the occurrence path
itself failed and `current` IS the positional fallback (nothing to supersede).

`src/foldStateStore.ts:34-44` (verbatim):
```ts
adoptRecordingOf(fromKey: string, toKey: string): void {
	if (this.foldedByKey.has(toKey)) {
		return;
	}
	const folded = this.foldedByKey.get(fromKey);
	if (folded === undefined) {
		return;
	}
	this.foldedByKey.delete(fromKey);
	this.foldedByKey.set(toKey, folded);
}
```
No-op unless only `fromKey` (the weak/positional key) has a recording; otherwise re-files it onto
`toKey` (the stronger occurrence key) and DELETES the old entry (so a different later embed
landing on that same position does not inherit the fold).

**This mechanism is IRRELEVANT to the nested-embed bug**: for a nested embed `cachedOccurrenceOf`
never succeeds (see §3), so `keyFor` always returns `{current: S<hash>..., superseded: null}` —
`adoptRecordingOf` is never invoked for these embeds at all, cold cache or warm. The nested-embed
identity problem is NOT a cold-cache/boot-race problem; it exists on EVERY render, forever, once
the cache is warm too.

## 2. `src/foldableEmbedsPostProcessor.ts` — invocation & DOM shape

### Invocation per section (foldableEmbedsPostProcessor.ts:68-75)

```ts
readonly process = (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
	const embeds = Array.from(el.querySelectorAll<HTMLElement>(EmbedFoldDom.SEL_INTERNAL_EMBED));
	embeds.forEach((embed, indexWithinSection) => {
		this.whenMarkdownEmbedReady(embed, (title) =>
			this.makeFoldable(embed, title, ctx, el, indexWithinSection),
		);
	});
};
```
`process` is Obsidian's registered `MarkdownPostProcessor` callback (registered once in
`main.ts`). Obsidian invokes it once **per rendered SECTION** of **every** markdown render pass —
including the render pass Obsidian runs internally to build a note-embed's BODY. `ctx` in that
inner pass is a `MarkdownPostProcessorContext` scoped to the CHILD file: `ctx.sourcePath` is the
child's vault path, and `ctx.getSectionInfo(sectionEl)` (called later, lazily, in `occurrenceOf`)
answers relative to the CHILD's own source document — or fails, see §3. There is exactly ONE
post-processor instance/registration; nested embeds are processed by literally the same
`process` closure, re-entered once per section, with no special-casing for "this section is
itself inside another embed."

### `occurrenceOf` — what is gathered as the embed's identity signals (foldableEmbedsPostProcessor.ts:194-207)

```ts
private occurrenceOf(
	embed: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	sectionEl: HTMLElement,
	indexWithinSection: number,
): EmbedOccurrence {
	return {
		sourcePath: ctx.sourcePath,
		section: ctx.getSectionInfo(sectionEl),
		indexWithinSection,
		src: embed.getAttribute("src") ?? "",
		renderedSectionText: sectionEl.textContent ?? "",
	};
}
```
Called from `makeFoldable` (line 89) — AFTER the async wait for the title (`whenMarkdownEmbedReady`),
which is deliberate: the doc comment notes Obsidian requires `getSectionInfo` be called
"right before it is needed."

### DOM element in hand for each embed

`embed` (an `HTMLElement`) is one `.internal-embed` span, found via
`el.querySelectorAll(EmbedFoldDom.SEL_INTERNAL_EMBED)` where
`EmbedFoldDom.SEL_INTERNAL_EMBED = ".internal-embed"` (`embedFoldDom.ts:29`). `el` is the whole
SECTION element Obsidian handed the post-processor. So yes: the code has, for every embed
occurrence, a direct handle on the `.internal-embed` span itself — confirming the ticket's
premise about what DOM is available.

### Is the host embed's DOM ancestor reachable at that point? YES, structurally.

Nothing in the current code walks up from `embed`, but the DOM shape supports it: a nested embed
body is rendered *inside* the outer `.internal-embed` span's subtree (an `.internal-embed` for
the child is a descendant of the `.internal-embed.markdown-embed` for the grandchild's host —
confirmed directly by the Live Preview nested-embed test locator pattern used elsewhere in this
repo, e2e/live-preview-foldable-embeds.e2e.ts:392-394:
```ts
const outer = page.locator(`.cm-content .internal-embed[src="${NESTED_CHILD_NAME}"]`);
const nested = outer.locator(`.internal-embed[src="${NESTED_GRANDCHILD_NAME}"]`);
```
— i.e. `.locator()` chaining works because the nested `.internal-embed` genuinely IS a DOM
descendant of the outer one). So `embed.closest('.internal-embed')` from inside the section
(excluding the embed's own class, since `closest` on itself would just return `embed`) would find
the outer host span, and `embed.parentElement?.closest('.internal-embed')` — the ticket's
suggested expression — is a plausible way to reach it (starting the search one level UP so it
does not just re-find `embed` itself, since `.internal-embed` is on `embed` too).

**CONFIRM/DENY the ticket's suggested fix shape**: CONFIRMED workable in principle — a
`WeakMap<HTMLElement, string>` mapping a wired embed's DOM node to the key it was ultimately
recorded under, consulted via `embed.parentElement?.closest('.internal-embed')` to find the host
span, is architecturally sound: `WiredElements` already proves the codebase's pattern for a
`WeakSet<HTMLElement>` keyed on embed spans (`src/wiredElements.ts`), and a sibling `WeakMap`
mirrors it exactly. The nontrivial part is ORDERING — see §3.

## 3. ORDERING QUESTION — is the host guaranteed wired before the nested embed's pass runs?

**NOT guaranteed by anything in the code, and a race is plausible by construction — though not
yet directly reproduced by this exploration's static reading (only inferable from the code +
prior probe evidence).**

Reasoning:
- `makeFoldable` is only called once `whenMarkdownEmbedReady` resolves (`foldableEmbedsPostProcessor.ts:209-236`):
  synchronously if the embed already has `.markdown-embed` + a title element, otherwise via a
  `MutationObserver` on the embed's own subtree (`childList`, `subtree`, `attributes:["class"]"`)
  that fires once Obsidian finishes rendering that embed's title bar.
- Obsidian resolves a note embed ASYNCHRONOUSLY and, in turn, that embed's own BODY (rendered via
  the SAME post-processor, recursively) is what produces any embeds NESTED inside it. So the
  outer embed's `.markdown-embed` class + title (which fire the OUTER `whenMarkdownEmbedReady`)
  and the inner embed's own readiness (which fires the INNER `whenMarkdownEmbedReady`) are
  observed on DIFFERENT MutationObservers, on different elements, with NO explicit ordering
  primitive between them. It would typically be the case that the outer title (a shallow, early
  child of the outer span) becomes ready before the deeply-nested inner embed finishes loading
  its own child content — but this is an assumption about Obsidian's internal render order, not
  something this codebase enforces or asserts anywhere.
- More fundamentally: even if the outer embed's OWN post-processor pass (over the PARENT
  document) runs and calls `makeFoldable` first, this happens in a *different invocation* of
  `process` — over the PARENT's `MarkdownPostProcessorContext` — than the nested embed's pass
  (over the CHILD's `ctx`, itself invoked from Obsidian's internal embed-loading code, likely on
  its own microtask/render cycle). There is no code here that sequences "finish wiring host embed
  X" before "start post-processing embeds nested inside X."
- **This is moot for the CURRENT bug**, because per §1/§4 below, `ctx.getSectionInfo` returns
  `null` for the nested case (confirmed measured, not the doc comment's speculative "expected to
  return null" — the E2E probe evidence in `.tmp/probe/run14b.log` shows a nested reading-mode
  embed toggles independently within one render but NOT across a fresh render, exactly matching
  "keyed identically, so store.set/get collide across occurrences" — i.e. `S<hash>` collision, not
  a race). A HOST-KEY-BASED fix (WeakMap of host → key) would introduce a NEW ordering dependency
  that does not exist today, so this question becomes load-bearing for any implementation that
  adopts the ticket's suggested shape.
- **A robust fallback if the host key is not yet known**: since `WiredElements`/`wiredEmbeds` and
  the mark bookkeeping are per-embed and already re-entrant-safe (`makeFoldable` bails early via
  `wiredEmbeds.has(embed)`, `foldableEmbedsPostProcessor.ts:85-87`), a robust design must not
  assume ordering. Two directions surfaced by this exploration, for the implementer to weigh (NOT
  a decision made here — that is IMPLEMENTATION's job):
  1. **Derive the discriminator from ANCESTRY, not from a lookup table.** Instead of a
     WeakMap<host element, key> (which needs the host to have run `makeFoldable` first), walk
     `embed.parentElement?.closest('.internal-embed')` REPEATEDLY (climb every ancestor
     `.internal-embed`, however many nesting levels deep) and identify each ancestor host by ITS
     OWN occurrence signals (its `src`, and its OWN `indexWithinSection`/position among its
     siblings at ITS level) — independent of whether that ancestor has been wired by THIS plugin
     instance yet. This sidesteps the ordering question entirely: it does not need the host's
     `EmbedFoldKeys` key to have been computed, it needs only DOM facts that exist as soon as the
     ancestor's span exists in the DOM (which is guaranteed, since the child cannot render at all
     until its containing span exists).
  2. **Lazy/two-pass key resolution**: if the WeakMap approach is kept, `keyFor` (or a wrapper)
     would need to tolerate "host key not yet known" and re-derive/re-key later (mirroring how
     `adoptRecordingOf` already re-files a fold from a weaker key to a stronger one once a better
     key becomes derivable) — i.e. reuse the EXISTING supersede/adopt mechanism rather than
     inventing a second one, keying nested embeds initially under some interim per-render-pass
     key and re-filing once/if the host key resolves.
  Either way, the implementer should MEASURE the actual ordering (via a probe spec, following the
  house style already established in `.tmp/probe/`) before committing to an approach that
  silently assumes it.

## 4. `src/foldStateStore.ts`, `src/wiredElements.ts`, `src/foldableEmbedMark.ts`

### `FoldStateStore` (foldStateStore.ts, full)
In-memory `Map<string, boolean>` (`foldedByKey`), session-scoped, no persistence (product
decision, documented in the class comment). API:
- `get(key: string): boolean | undefined`
- `set(key: string, folded: boolean): void`
- `adoptRecordingOf(fromKey: string, toKey: string): void` — see §1 above, verbatim quoted there.

### `WiredElements` (wiredElements.ts, full)
```ts
export class WiredElements {
	private readonly wired = new WeakSet<HTMLElement>();
	has(element: HTMLElement): boolean { return this.wired.has(element); }
	add(element: HTMLElement): void { this.wired.add(element); }
	remove(element: HTMLElement): void { this.wired.delete(element); }
}
```
Deliberately NOT DOM-derived (no "does it carry our class" check) — see class comment: a
re-enabled plugin instance must be able to rewire DOM a PREVIOUS instance already marked, and a
DOM-derived guard would wrongly treat that DOM as already-wired-and-therefore-skip. Membership is
per-INSTANCE (`FoldableEmbedsPostProcessor` owns its own `wiredEmbeds: WiredElements`,
`foldableEmbedsPostProcessor.ts:38`), weak by construction so a detached embed span is never kept
alive by this map.

`has`/`add`/`remove` are called from `foldableEmbedsPostProcessor.ts`:
- `whenMarkdownEmbedReady` bails early if already wired (line 210-212).
- `makeFoldable` bails early (double-post-process guard, line 85-87), then `add`s (line 100).
- `forget` (line 132-135, called from a mark's `onunload` via the `onUnloaded` callback) calls
  `remove(mark.embed)` — "let the embed be wired again by a later render."

### `FoldableEmbedMark` (foldableEmbedMark.ts, full — reproduced above in tool output)
A `MarkdownRenderChild extends`. `containerEl` (renamed `embed` via a getter) IS the embed span.
- `listeners: AbortController` — every title-click listener is added with `{signal: listeners.signal}`.
- `listenerOptions` getter exposes `{ signal: this.listeners.signal }`.
- `onunload()`: aborts listeners, calls `EmbedFoldDom.unmark(this.embed)` (strips
  `fen-embed`/`fen-folded` classes + removes the chevron), then calls `this.onUnloaded(this)` —
  wired by the post-processor to its own `forget` method.

Lifecycle: created + `mark.load()`-ed synchronously inside `makeFoldable`
(`foldableEmbedsPostProcessor.ts:98-104`), added to `this.liveMarks: Set<FoldableEmbedMark>`
(strong refs — the class comment explains `teardown()` must reach them). Handed to
`ctx.addChild(mark)` LAST (line 128) so Obsidian's documented unload trigger ("if `containerEl` is
ever removed, unload() is called") only fires once the mark is FULLY wired. On plugin
`teardown()` (`foldableEmbedsPostProcessor.ts:53-66`), EVERY live mark is unloaded EXPLICITLY
(not left to `ctx.addChild`'s DOM-removal trigger), because disabling the plugin does NOT remove
Obsidian's DOM (measured on 1.12.7) — this matters especially for nested embed bodies inside Live
Preview widgets, which Obsidian REUSES rather than discards.

## 5. e2e harness — exact facts for a nested-embed spec

### Files read
`e2e/foldable-embeds.e2e.ts`, `e2e/reading-mode-fold-key.e2e.ts`, `e2e/foldAssertions.ts`,
`e2e/obsidianHarness.ts`, `e2e/obsidianAppApi.ts`, `e2e/reRenderGuard.ts`,
`e2e/playwright.config.ts`, and (for the existing NESTED-embed pattern reference)
`e2e/live-preview-foldable-embeds.e2e.ts`.

### Vault fixture creation
`ObsidianHarness.launch({ extraFixtures })` (`obsidianHarness.ts:107-111`) → `prepareVaultCopy`
(`obsidianHarness.ts:467-485`): copies `.dev-vault/` fresh, then for each `[relativePath,
content]` in `extraFixtures` writes `content` to `VAULT_COPY_DIR/relativePath` (creating parent
dirs). Signature:
```ts
static async launch(options: { extraFixtures?: Record<string, string> } = {}): Promise<ObsidianHarness>
```
Example usage building a nested vault (from `e2e/live-preview-foldable-embeds.e2e.ts:56-62`):
```ts
const NESTED_PARENT_PATH = "lp-nested.md";
const NESTED_CHILD_NAME = "lp-nested-child";
const NESTED_GRANDCHILD_NAME = "sibling";
const NESTED_FIXTURES = {
	[NESTED_PARENT_PATH]: `# Nested parent\n\n![[${NESTED_CHILD_NAME}]]\n`,
	[`${NESTED_CHILD_NAME}.md`]: `# Nested child\n\nBody before the nested embed.\n\n![[${NESTED_GRANDCHILD_NAME}]]\n`,
};
```
(Note: `sibling.md` already exists in `.dev-vault` per `foldable-embeds.e2e.ts`'s
`SIBLING_NOTE_PATH` comment — the LP spec reuses it as its grandchild fixture; a new reading-mode
nested spec should mint its own uniquely-named fixtures, following `TWINS_NOTE_PATH` /
`REF_PARENT_NOTE_PATH` conventions in `foldable-embeds.e2e.ts`.)

### Opening a note in READING mode
```ts
await harness.openFile(PATH);                    // obsidianHarness.ts:210-220
await harness.setMarkdownViewMode("preview");     // obsidianHarness.ts:276-286
```
`openFile` deliberately does NOT wait for the vault index (`waitUntilIndexed` is opt-in,
`obsidianHarness.ts:233-238`) — relevant because the nested bug's root cause is NOT the cold-cache
path (see §1), so a nested-embed spec does not strictly need `waitUntilIndexed`, but using it
anyway keeps the spec from ALSO exercising the (already-covered-elsewhere) boot race.

### Selecting the Nth embed, INCLUDING NESTED ones

`foldable-embeds.e2e.ts` and `reading-mode-fold-key.e2e.ts` only have a FLAT selector, scoped to
avoid the hidden Live-Preview-mode DOM in the same leaf:
```ts
function foldableEmbeds(): Locator {
	return page.locator(`.markdown-reading-view .markdown-embed.${CLS_FOLDABLE}`);
}
```
This selector does NOT exist in a form that reaches into nested embeds specifically — `.nth(n)`
on it walks ALL matching spans in document order (which DOES include nested ones, since nested
`.internal-embed.markdown-embed.fen-embed` spans are still descendants of
`.markdown-reading-view`), but there is no NAMED nested selector today in the reading-mode specs.

**There IS an existing nested-embed selector pattern, in Live Preview's spec**
(`e2e/live-preview-foldable-embeds.e2e.ts:392-394`), directly reusable for reading mode by
swapping the root class:
```ts
const outer = page.locator(`.cm-content .internal-embed[src="${NESTED_CHILD_NAME}"]`);
const nested = outer.locator(`.internal-embed[src="${NESTED_GRANDCHILD_NAME}"]`);
```
i.e. scope the OUTER embed by its `src` attribute, then `.locator()`-chain into the INNER embed
by ITS `src` — reliable because `[src="..."]` is set from the raw `![[link]]` text and both
levels are real DOM descendants. For an occurrence-DISCRIMINATING nested spec (two `![[child]]`
host embeds, each nesting one `![[grandchild]]`), the analogous reading-mode locators would be
`page.locator('.markdown-reading-view .internal-embed[src="child"]').nth(i).locator('.internal-embed[src="grandchild"]')`.

### Clicking a fold title / asserting fold state
```ts
await embed.locator(".markdown-embed-title").click();
await expectFolded(embed, true|false);   // e2e/foldAssertions.ts
```
`expectFolded` (verbatim, `foldAssertions.ts:27-35`):
```ts
export async function expectFolded(embed: Locator, folded: boolean): Promise<void> {
	if (folded) {
		await expect(embed).toHaveClass(FOLDED_RE);
		return;
	}
	await expect(embed).toBeAttached();
	await expect(embed).not.toHaveClass(FOLDED_RE);
}
```
where `FOLDED_RE = /\bfen-folded\b/` and `CLS_FOLDED = "fen-folded"`.

### RE-RENDER round trip — the "e2e-vacuity" concern, and `reRenderGuard.ts`

`ObsidianHarness.reopenThroughOtherFile(vaultPath, viaVaultPath)` (`obsidianHarness.ts:251-254`):
```ts
async reopenThroughOtherFile(vaultPath: string, viaVaultPath: string): Promise<void> {
	await this.openFile(viaVaultPath);
	await this.openFile(vaultPath);
}
```
Deliberately NOT a reading↔editing MODE round-trip — the doc comment explains Obsidian keeps the
reading-view DOM of a file that STAYS open across a mode switch, so a mode round-trip would prove
nothing about the fold STORE (the very "e2e-vacuity" failure mode the ticket's AC30 references).
A DETOUR through another file is what actually discards + rebuilds the target note's rendered DOM.

`e2e/reRenderGuard.ts` (full, quoted above in tool output) is the "prove this really was a
re-render" guard, two functions:
```ts
export async function captureElement(locator: Locator): Promise<LiveElement>
export async function expectFreshElement(previous: LiveElement, locator: Locator): Promise<void>
```
`captureElement` grabs an `ElementHandle` on the CURRENT live DOM node (throws if the locator
resolves to nothing — "an identity comparison would be vacuous"). `expectFreshElement` re-resolves
the SAME locator and asserts (via `page.evaluate(([a,b]) => a === b, ...)`) that it is now a
DIFFERENT DOM node than before — i.e. proves the element was actually torn down and rebuilt, not
merely re-used. Usage pattern (from `foldable-embeds.e2e.ts:129-143`):
```ts
const embedBeforeReopen = await captureElement(foldableEmbeds().nth(0));
await harness.reopenThroughOtherFile(PARENT_NOTE_PATH, SIBLING_NOTE_PATH);
await harness.setMarkdownViewMode("preview");
await expect(foldableEmbeds().nth(0)).toBeAttached();
await expectFreshElement(embedBeforeReopen, foldableEmbeds().nth(0));
await expectFolded(foldableEmbeds().nth(0), true);
```
This is the EXACT protocol a nested-embed spec must follow, applied to the NESTED locator instead
of the flat one, per the ticket's AC ("ACROSS a re-render (leave the note and come back — see the
round-trip note in the e2e-vacuity ticket)").

CROSS-NOTE assertion (second half of the ticket's repro — "folding the nested embed in host-a.md
makes host-b.md show it folded on its FIRST ever render") needs TWO separate host notes each
embedding the SAME child (so their nested embed's `sourcePath` — the child's path — collides
today), asserting the fold made via host-a's nested embed does NOT show up folded when host-b is
opened FOR THE FIRST TIME (no prior render of host-b in this session at all, so cross-note bleed
cannot be confused with any "reused DOM" false negative).

## 6. Commands: lint, build, e2e, OBSIDIAN_PATH

- `npm run lint` → `eslint .` (obsidianmd ruleset scoped to `src/`; `e2e/`, `.tmp/`, `.dev-vault/`
  are ignored by eslint config, per CLAUDE.md).
- `npm run build` → `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`.
- `npm run test:e2e` → `bash scripts/run-e2e.sh`:
  ```bash
  if [[ -z "${OBSIDIAN_PATH:-}" ]]; then
  	OBSIDIAN_PATH="$(bash scripts/setup-obsidian-bin.sh)"
  	export OBSIDIAN_PATH
  fi
  # headless flag auto-detection (no DISPLAY/WAYLAND_DISPLAY → --ozone-platform=headless --disable-gpu)
  npm run setup:dev-vault
  npx tsc -p e2e/tsconfig.json
  exec npx playwright test --config e2e/playwright.config.ts "$@"
  ```
  Pass a specific spec through: `npm run test:e2e -- e2e/foldable-embeds.e2e.ts`.
- `scripts/setup-obsidian-bin.sh`: downloads a PINNED Obsidian (currently `OBSIDIAN_VERSION="1.12.7"`)
  tarball build (Linux only; non-Linux must set `OBSIDIAN_PATH` manually — no auto-download), caches
  under `${OBSIDIAN_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/obsidian-e2e}`, and prints the
  resolved binary path on stdout for `$(...)` capture. `ObsidianHarness.resolveObsidianPath()`
  (`obsidianHarness.ts:85-100`) throws an actionable error if `OBSIDIAN_PATH` is unset/missing.
- `npm run setup:dev-vault` → `bash scripts/setup-dev-vault.sh` (builds the plugin into
  `.dev-vault/.obsidian/plugins/<id>/main.js` — `prepareVaultCopy` in `obsidianHarness.ts:467-485`
  throws if this hasn't been run first).
- No dedicated `e2e/README.md` exists; the above commands/behaviour are documented only in
  `scripts/run-e2e.sh`'s header comment and `obsidianHarness.ts`'s class/method doc comments.

## 7. `.tmp/probe/` — DOES exist, gitignored, has the ticket's evidence

`.tmp/probe/` contains 14 throwaway probe specs (`probe.e2e.ts` .. `probe14.e2e.ts`, 1389 lines
total), a dedicated `pw.config.ts`, and numbered `run*.log` output files — exactly matching the
ticket's own citation ("throwaway probe specs and logs are in the gitignored `.tmp/probe/`
(`probe*.e2e.ts`, `pw.config.ts`, `run*.log`)"). `probe2.e2e.ts`, `probe3.e2e.ts`,
`probe4.e2e.ts` contain the "twins"/cross-note repro shape (`probe-twins.md`, cross-note-style
fixtures). Read in full: `probe2.e2e.ts` (quoted above in tool output) is PROBE 7-11, testing
mode-round-trip vs file-round-trip fold survival, same-note-twin bleed, edits above an embed, and
embedded-content changes — this predates/overlaps the prior CLOSED ticket
(`nid_7qbtubxk89team9oadnl3hanr_e`) more than THIS one; it is evidence for the OCCURRENCE-key
design, not the nested-embed bug specifically.

`run14b.log` / `run14.log` (from `probe14.e2e.ts`) are the MOST DIRECTLY relevant to nested
identity: they instrument BOTH Live Preview and READING mode against a "child embeds a nested
sibling" fixture (`nested=true/false`, `fenEmbed`, `fenFolded`, `ownChevrons` diagnostics per
embed). `run14b.log`'s "READING mode with the editor extension deleted" test shows, in sequence:
`reading baseline: {src=sibling,nested=true,fenEmbed=true,fenFolded=true}` (a fold ALREADY present
before any click in this run — i.e. bled in from a prior test/session state) →
`reading nested click TOGGLES: before=[true] after=[false]`. `run14.log`'s FAILING run of the same
test times out waiting for `fen-folded` to be applied to `sibling` inside `probe14-child` after a
click, which is directly consistent with two occurrences of the SAME (child, nested-grandchild)
pair colliding on the SAME `S<hash>` store key: whichever occurrence's click landed LAST wins the
in-memory `Map` entry, and a fresh render's `get(key)` returns whatever that shared key currently
holds — sometimes `true`, sometimes stale from an unrelated occurrence/run, explaining the
FLAKY-looking pass/fail across `run14.log` vs `run14b.log`.

No probe file was found that isolates the EXACT `nested-twins.md` shape the ticket names
verbatim (two `![[child]]` in one host, `child.md` containing `![[grandchild]]`) — the probes use
`probe-twins.md` (same NOTE embedded twice, not nested) and `lp-nested.md`/`lp-nested-child.md`
(nested, but only ONE occurrence, so it does not exercise the SIBLING-bleed shape). **A
nested-embed spec written for this ticket should therefore build its OWN fixture matching the
ticket's exact repro** (two occurrences of a host that itself nests one more embed) rather than
reusing an existing probe or spec fixture as-is.

## 8. Unit/integration test setup for pure-logic modules — NONE

There is **no unit or integration test framework in this repo**. `package.json` has no
`test`/`test:unit` script, no `jest`/`vitest`/`mocha`/`ava` in `devDependencies`, and
`find . -name "*.test.ts"` (excluding `node_modules`) returns **zero results**. The ONLY test
surface is the Playwright e2e suite driving a real Obsidian (`npm run test:e2e`). This is
consistent with the project's explicit design intent (see `ReadEmbeds`'s doc comment: "the key
logic must not need an `App`, so it stays trivially testable" — narrow ports exist so a FUTURE
unit-test layer would be cheap to add, but nothing does so today). Any implementer wanting a fast
pure-logic test loop for `EmbedFoldKeys`/`FoldStateStore` changes would have to either (a) add a
test runner (out of scope unless the ticket calls for it — this ticket's AC only asks for e2e
coverage) or (b) rely entirely on the e2e suite, as every prior fold-identity ticket in this
repo's history has done.

## 9. Live Preview — immune by design, confirmed from code

CLAUDE.md states explicitly (and this was cross-checked against `src/livePreview/` usage and the
Live Preview e2e spec): **"Only TOP-LEVEL embeds are wired — a nested one resolves to its parent's
line, and it is the post-processor's business anyway."** (CLAUDE.md, "Live Preview constraints"
paragraph.)

Confirmed by `e2e/live-preview-foldable-embeds.e2e.ts:387-405`
(`test("clicking a NESTED embed's title never folds the embed it sits inside", ...)`):
```ts
const outer = page.locator(`.cm-content .internal-embed[src="${NESTED_CHILD_NAME}"]`);
const nested = outer.locator(`.internal-embed[src="${NESTED_GRANDCHILD_NAME}"]`);
await expect(nested.locator(".markdown-embed-title")).toBeAttached();
...
await nested.locator(".markdown-embed-title").click();
// `posAtDOM` on a nested embed resolves to the position of the OUTER embed's widget, ...
// The nested embed still folds: an embed BODY is rendered through the markdown
// post-processor regardless of which mode wraps it — ... exactly why Live Preview must
// leave nested embeds alone rather than wire them twice.
await expectFolded(nested, true);
```
i.e.: Live Preview's OWN CM6 extension (`src/livePreview/livePreviewFoldExtension.ts` +
`foldStateField.ts`) never wires a nested embed at all — `posAtDOM` on a nested widget's DOM node
resolves to the OUTER embed's document position (LINE-accurate only, per CLAUDE.md: "`posAtDOM` on
a widget is only LINE-accurate ... it THROWS ... for a node CM cannot map"), so Live Preview's own
fold mechanism structurally CANNOT target a nested embed individually and does not try. The nested
embed you SEE fold in that Live-Preview-mode test is folding via the READING-MODE post-processor
(`FoldableEmbedsPostProcessor`), because Obsidian renders an embed's BODY (even inside a Live
Preview CM6 widget) through the SAME markdown post-processor pipeline used in reading mode. **This
means Live Preview does NOT have an independent nested-fold-identity bug of its own to fix, but it
IS exposed to the READING-MODE bug this ticket is about**, via exactly that shared body-rendering
path — i.e. fixing `EmbedFoldKeys`/`foldableEmbedsPostProcessor.ts` for reading mode ALSO fixes
nested-embed identity for embeds nested inside Live Preview widgets, and any reading-mode e2e
regression coverage added for this ticket is worth cross-checking (not necessarily duplicating)
against `live-preview-foldable-embeds.e2e.ts`'s existing nested-embed tests
(lines 387-451, which include a teardown/re-enable test for nested marks — do not let a fix here
regress those).

## Summary of the confirmed mechanism (for the next agent)

1. Obsidian renders an embed's BODY through the same `MarkdownPostProcessor.process` callback,
   invoked with a `ctx` scoped to the CHILD file (`ctx.sourcePath` = child path).
2. `occurrenceOf` (`foldableEmbedsPostProcessor.ts:194-207`) calls `ctx.getSectionInfo(sectionEl)`
   — for a nested embed's section this returns `null` (not merely "a line inside the child" as
   the ticket's original text speculated; the doc-comment-turned-fact in `embedFoldKeys.ts:88-90`
   and the probe evidence in §7 are consistent with `null`, which is what routes it to the
   `S<hash>` fallback rather than the LINE fallback — worth a DIRECT re-measurement at
   implementation time via a probe spec, since this exploration did not itself run Obsidian).
3. `EmbedFoldKeys.keyFor` therefore always takes the `cachedOccurrenceOf === null` branch
   (`embedFoldKeys.ts:107-110`) for a nested embed → `positionalFallbackKey` → `S<hash>` branch
   (`section === null`) → key = `<childPath>::S<hash(childBodyText)>::<grandchildSrc>::#<indexWithinSection>`.
4. Every field of that key is identical for every occurrence of "the same child rendered as a
   nested embed inside identical surrounding markup" — including across DIFFERENT host notes that
   embed the same child the same way, and across DIFFERENT occurrences of the same host embed
   within one note (the ticket's `nested-twins.md`) — so `FoldStateStore`'s `Map<string,boolean>`
   collapses them onto ONE entry, and toggling one toggles the group.
5. `EmbedFoldKeys.readEmbeds`/`cachedOccurrenceOf` is scoped to ONE file's own embeds; there is no
   existing signal anywhere in `EmbedOccurrence`/`ReadEmbeds` that could disambiguate "which
   ancestor embed this render is nested inside" — a fix needs a NEW signal (the ticket's suggested
   host-key WeakMap, or the ancestry-DOM-walk alternative in §3), not a tweak to the existing
   fields.
