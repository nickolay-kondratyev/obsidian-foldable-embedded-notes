# Implementation review — nested-embed teardown + wiring-guard fix (`622a483`)

## Verdict: **SHIP WITH FIXES**

The fix is correct. I could not find a path where a marked embed escapes teardown, the
double ownership does not double-unmark or leak, the WeakSet guard is genuinely
per-instance, and the new e2e test proves all three acceptance criteria (the click
assertion is the strong, non-vacuous kind). Every MUST-FIX below is documentation /
ticketing honesty, not code correctness.

Verification I ran myself: `npm run lint` (exit 0, the one pre-existing ticketed
`prefer-setting-definitions` warning) and `npm run build` (exit 0), logs in
`.tmp/rev-lint.log` / `.tmp/rev-build.log`. I did **not** re-run the e2e suite — I trust
the reported 43/43 and nothing below hinges on re-running it.

---

## Answers to the four load-bearing questions

### 1. Rejecting ticket part 3 (`destroy()` should unmark ALL embeds) — **ACCEPT the rejection**

Both halves of the implementer's argument hold up against the code.

**Redundancy is real.** The invariant "an embed carries this instance's marks ⟺ a live
`FoldableEmbedMark` for it sits in `liveMarks`" is airtight:
- The only place that marks a nested embed is
  `src/foldableEmbedsPostProcessor.ts:88-98` — `liveMarks.add` and `wiredEmbeds.add`
  happen *before* `EmbedFoldDom.markFoldable`, so there is no window where DOM is marked
  and the registry is not.
- The only way out of the registry is `FoldableEmbedMark.onunload`
  (`src/foldableEmbedMark.ts:41-45`), which unmarks the DOM in the same call. So a
  released entry always means unmarked DOM.
- Live Preview never marks a nested embed (`topLevelEmbeds()` filters them,
  `src/livePreview/livePreviewFoldExtension.ts:109-117`), so there is no second marker.
- A view recreated while marks persist changes nothing: the post-processor's registry is
  owned by the plugin instance, not by the view, and survives view churn.

**The "orphan a live listener" risk is concrete, not hand-waving.** `destroy()` also runs
while the plugin is alive (view recreation, extension reconfiguration). Unmarking a nested
embed there would remove `fen-embed` and the chevron while the post-processor's listener
is still attached — and `styles.css:21-23` collapses on `.fen-folded > .markdown-embed-content`
**without** requiring `.fen-embed`. So the embed would still collapse on click, but with
`.fen-embed > .markdown-embed-title` gone the forced-visible/clickable title styling
disappears with it: a half-broken embed. Live Preview must not undo marks it did not make.

Deviation from a written ticket step still deserves the human's explicit nod — the
implementer flagged it clearly, which is the right behaviour. My recommendation to the
human: accept, and record the reason in the ticket so part 3 is not "re-fixed" later.

### 2. Double ownership (render child + processor registry) — **correct, no double-unmark, no stale-entry stomping**

- `mark.load()` before `ctx.addChild(mark)` is load-bearing and right: per
  `obsidian.d.ts` (`addChild`: *"Adds a child component, loading it if this component is
  loaded"*), a child added to an unloaded parent is never loaded, and
  `Component.unload()` is a no-op on an unloaded component — `teardown()` would silently
  do nothing. Loading manually fixes exactly that.
- No double-unload: `Component.unload()` is guarded by `_loaded`, so the parent renderer
  unloading a mark that `teardown()` already unloaded is a no-op.
- **No stale-entry stomping.** The hazard "an old mark unmarks DOM a new mark just
  re-marked" is unreachable *within* an instance: `makeFoldable` bails while
  `wiredEmbeds.has(embed)`, and `embed` leaves `wiredEmbeds` only in the same call that
  unmarks it. Across instances it is unreachable too — instance A's `teardown()` runs
  before instance B exists.
- Registry growth is bounded by *live* DOM: the renderer unloads a child when its
  `containerEl` is removed (documented in `obsidian.d.ts`, `MarkdownPostProcessorContext.addChild`),
  and the `containerEl` here is the embed span itself. See MUST-FIX #1 — the *stated*
  reason in the comments is not the documented mechanism.

### 3. WeakSet guard — **yes, per-instance, and both class guards are gone**

`src/foldableEmbedsPostProcessor.ts:81` and `:187` are the two former class checks, both
now `this.wiredEmbeds.has(...)`; `wiredEmbeds` is an instance field (`:35`) on an object
constructed per `onload` (`src/main.ts:25`), and Live Preview's is a per-view field
(`livePreviewFoldExtension.ts:23`). No module-level singleton. Remaining DOM reads are
*not* wiring state: `EmbedFoldDom.isFolded` reads displayed fold state (by design), and
`ensureChevron` is idempotency over Obsidian's reused title, not a "did we wire this"
decision — adopting a predecessor's leftover chevron is harmless and desirable.

Honest caveat the implementer already stated: with teardown in place there is no leftover
class left to poison the guard, so the WeakSet is not independently proven by a test. That
is fine — it is defence, and it is documented as such.

### 4. Do the e2e assertions prove the acceptance criteria? — **yes, and the click assertion is the strong form**

- Fixture really nests: `lp-nested.md` → `![[lp-nested-child]]` → `![[sibling]]`
  (`e2e/live-preview-foldable-embeds.e2e.ts:56-63`), and the locator requires the
  `sibling` embed to be a descendant of the `lp-nested-child` embed.
- AC1: counts asserted over `.cm-content`, before any view rebuild.
- AC2 is the best part of this change: `clickNestedTitleInPage()`
  (`e2e/live-preview-foldable-embeds.e2e.ts:512-537`) dispatches inside the page and reads
  `folded` + `defaultPrevented` **synchronously in the same dispatch turn**, so a zombie
  listener cannot hide in a polling window; it throws if the nested embed or its title is
  missing, so it cannot pass vacuously. This would have failed loudly with the bug present.
- AC3: unfolded → one click → folded, after a genuine reopen. Proves rewiring. See
  MUST-FIX #2 for the "reopen" part.

---

## MUST-FIX

### 1. Two WHY comments state an unverified mechanism, and one contradicts the documented API

`src/foldableEmbedsPostProcessor.ts:114-115`:

> `// LAST: adding the child can unload it right away (the rendering component may already be gone)`

`obsidian.d.ts` documents `Component.addChild` as *"Adds a child component, **loading** it
if this component is loaded"* — it never unloads. An already-unloaded parent simply leaves
the child unloaded (which is why the manual `load()` above matters). The ordering is
harmless either way, but the stated reason is wrong, and a wrong WHY is worse than none:
the next maintainer will reason from it.

Related, same class: `src/foldableEmbedMark.ts:23-25` and
`src/foldableEmbedsPostProcessor.ts:30-33` justify boundedness with *"Obsidian unloads it
with whatever rendered the embed (section re-render, widget rebuild)"*. The documented
trigger is different and actually **stronger**: `MarkdownPostProcessorContext.addChild` —
*"if the containerEl of the child is ever removed, the component's unload will be called"* —
and `containerEl` here is the embed span. This repo's own standard is to say what was
measured (see `embedFoldDom.ts:77-80`, `foldAssertions.ts`), and the very same family of
assumption was already MEASURED FALSE for plugin disable.

**Fix (docs only):** restate both comments in terms of the documented trigger (child
unloads when its `containerEl` is removed from the DOM; plugin disable does not remove it,
hence `teardown()`), and drop or measure the "addChild can unload it right away" claim.

### 2. AC3 is met only after reopening the note — record it as a limitation, and file the follow-up

`e2e/live-preview-foldable-embeds.e2e.ts:441-447` re-enables the plugin and then navigates
away and back before asserting foldability, because a preview↔source round trip reuses the
already-rendered embed body. That is measured and honestly documented — but a
**disable+enable is exactly what a plugin update does**, so after every update a user's
open notes have nested embeds that are silently not foldable until the note is reopened.
Live Preview's top-level embeds do not have this problem (`registerEditorExtension`
rebuilds open editors), which makes the inconsistency user-visible.

**Fix:** no code change required in this commit, but (a) add this to the ticket's Notes so
it is not lost, and (b) file the follow-up the implementer already proposed — "adopt
already-rendered embeds on plugin load (one sweep)" — rather than leaving it in the
`.ai_out` doc only. Human should confirm this is an acceptable ship-state for AC3.

---

## OPTIONAL (worth a ticket, not worth blocking)

### 3. The removed class guard was also the only thing stopping cross-mode double-wiring

Previously `if (embed.classList.contains(CLS_FOLDABLE)) return;` made the post-processor
defer to an embed Live Preview had already marked. That net is gone. It only matters for an
embed that is simultaneously (a) inside DOM the post-processor renders and (b) not
`isNested` by Live Preview's definition (`livePreviewFoldExtension.ts:114-117`, which looks
only for an enclosing `.internal-embed`). I could not construct such a case against
Obsidian 1.12.7 and did not measure one, so treat it as a latent risk, not a regression.
Symptom would be two listeners on one title, each inverting the other → a dead click.

**Suggested fix if you want the net back without the cross-instance poisoning:** hoist one
per-plugin-instance `WiredElements` keyed on the **embed** and inject it into both modes;
first mode to wire wins. Cheap, and it keeps the "never infer from the DOM" property.

### 4. `EmbedFoldDom.unmark` can steal a nested embed's chevron

`src/embedFoldDom.ts:106`:

```ts
embed.querySelector(`.${EmbedFoldDom.CLS_CHEVRON}`)?.remove();
```

That is an unscoped subtree query. It happens to be safe today because an embed's own title
bar precedes its content in document order — but if the outer embed's chevron is ever
absent while a nested one is present, `unmark(outer)` deletes the **nested** embed's
chevron and leaves that nested mark half-undone. Now that nested embeds are first-class
marked elements, scope it: `embed.querySelector(':scope > .markdown-embed-title > .fen-collapse-icon')`
(mirroring `styles.css`, which already scopes with `>`).

### 5. DRY: `liveMarks` and `wiredEmbeds` are one fact stored twice

`src/foldableEmbedsPostProcessor.ts:34-35` — the two are added together (`:89-90`) and
removed together (`:121-122`), and any future edit must keep them in lockstep by hand. A
single `Map<HTMLElement, FoldableEmbedMark>` gives `has`, iteration for `teardown()` and
`forget` from one structure, with identical retention (the marks already hold their
`containerEl` strongly). `WiredElements` stays for Live Preview, which keys on the title.

### 6. e2e: make the count-0 assertions non-vacuous at the point they are made

`e2e/live-preview-foldable-embeds.e2e.ts:425-429` — `toHaveCount(0)` also passes if the
editor was rebuilt pristine (the very thing the comment says must not happen) or if the
nested embed vanished. The following `clickNestedTitleInPage()` throws in that case, so the
test as a whole is not vacuous, but the failure would point at the wrong line. Add
`await expect(nestedEmbed()).toBeAttached();` immediately after `setPluginEnabled(false)`.

### 7. Watch: an embed span removed and re-added without a re-render now loses its marks

New behaviour introduced by tying the mark to the embed span: if Obsidian ever detaches and
re-attaches an `.internal-embed` without re-running post-processors, `onunload` fires,
`unmark` + `forget` run, and nothing rewires until the next real render. Not observed;
noting it because it is a behaviour the old (no-teardown) code did not have.

### 8. Pre-existing, out of scope: disable during `onload`'s `await settings.load()`

`src/main.ts:20-31` — `onunload` can run with `postProcessor` still `undefined`, after which
`onload` resumes and registers the post-processor on an unloaded plugin. Marks made after
that would never be torn down. Pre-existing; worth a ticket, not this commit.

---

## Documentation

- `CLAUDE.md` — the new `wiredElements.ts` / `foldableEmbedMark.ts` bullets and the
  `teardown()` rewrite are accurate. The `embedFoldDom.ts:82-84` and `:101-102` doc updates
  correctly retract the old "reading mode needs no removal path" claim, which was the bug.
- Fix the two comments in MUST-FIX #1.
- `_tickets/reading-mode-post-processor-leaves-chevrons-behind-on-plugin-unload.md` was
  closed on the finding that reading-view DOM is discarded wholesale. That conclusion is
  still true, but this commit now *does* give reading mode a real unmark path — add a
  cross-reference note there so the closed ticket does not read as contradicting the code.
- Record the AC3 caveat (MUST-FIX #2) in the open ticket's Notes before closing it.
