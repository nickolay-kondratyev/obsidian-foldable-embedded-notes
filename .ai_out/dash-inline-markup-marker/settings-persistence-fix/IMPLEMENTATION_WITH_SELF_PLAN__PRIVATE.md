# Private notes (rehydration)

State: DONE — implementation + REVIEW ITERATION both committed on branch
`settings-persistence-fix`. Ticket left `in_progress`, no change_log entry (both owned by
TOP_LEVEL_AGENT). Nothing outstanding.

## Exact code shape now (post-iteration)

`src/foldableEmbedsPostProcessor.ts`:
```ts
const followedByWhitespaceOrEol = /^\s/.test(afterMarker) || (afterMarker === "" && this.isEndOfLine(sibling));
...
private isEndOfLine(node: Node): boolean {
	const next = node.nextSibling;
	return next === null || next.instanceOf(HTMLBRElement);
}
```
Order matters only for readability; the two branches are disjoint.
`instanceOf` (obsidian's `Node` augmentation) NOT `instanceof`: repo lint rule
`obsidianmd/prefer-instanceof` + real cross-realm popout hazard the reviewer measured.

## Iteration facts

- e2e count 45 → 46 (new soft-break test). Suite still ~7s.
- MUTATION-PROVEN: delete `|| next.instanceOf(HTMLBRElement)` → the soft-break test fails
  (embed unfolded). Redo with `cp src/foldableEmbedsPostProcessor.ts .tmp/pp.bak` first.
- Rejected N-3 (reading-mode vs LP `![[x]]- tail` divergence) as out of scope; 3 follow-up
  candidates listed in `IMPLEMENTATION_ITERATION__PUBLIC.md`.
- Lint baseline for this repo: 1 warning (`prefer-setting-definitions`). Any second warning
  is NEW and must be called out.

## Facts measured in this session (real Obsidian 1.12.7, e2e)

- Pre-fix, `![[child]]-**bold** tail` rendered with class
  `internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded` — folded, dash
  stripped. Post-fix it is unfolded and `embed.nextSibling.textContent === "-"` exactly, with
  a `<strong>` as the following ELEMENT sibling. Both are asserted.
- `![[child]]- tail` in reading mode: folded, `nextSibling.textContent === " tail"`.
- `![[child]]-` alone: `nextSibling` text node exists and is empty after stripping; its
  `nextSibling` is null (that is why the end-of-line check does not regress it).
- Full suite: 44 tests before, 45 after (the two new tests replace nothing; count went 44→45
  because one of the two new tests was added in the first pass and the other in the second).
  Runtime ~7s wall for the whole suite on this machine.

## Harness gotchas worth remembering

- `npm run test:e2e -- e2e/foldable-embeds.e2e.ts` scopes to one spec; it auto-downloads the
  pinned Obsidian on first use and auto-sets headless ozone flags.
- `foldableEmbeds()` is index-based and SERIAL-ordered; adding a second embed to an existing
  fixture note shifts `nth()` indices within THAT note only. The inline-markup fixture has two
  embeds: nth(0) = `-**bold**` case, nth(1) = `- tail` case. The `- tail` test relies on the
  preceding test having opened `marker-inline-markup.md` (serial mode) — if it is ever
  reordered, add its own `openFile` + `setMarkdownViewMode`.
- `expectFolded` must be used instead of hand-rolled class assertions (vacuous-pass footguns
  documented in `e2e/foldAssertions.ts`).

## Deliberate non-changes

- No lookbehind regex anywhere (mobile/iOS Safari constraint, enforced by
  `eslint-plugin-obsidianmd`'s `regexLookbehind`).
- Live Preview parser untouched (whole-line regex cannot hit this bug class).
- No new unit-test framework.

## If a follow-up is wanted

`` ![[x]]-`code` `` was measured in the ticket as the same bug; it is fixed by the same code
path but is NOT separately covered by e2e (the `<strong>` case exercises the identical DOM
shape). Adding it would be a cheap extra fixture line if a reviewer asks.
