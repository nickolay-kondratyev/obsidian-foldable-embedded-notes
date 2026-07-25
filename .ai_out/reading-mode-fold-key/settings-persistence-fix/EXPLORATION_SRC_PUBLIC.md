# EXPLORATION_SRC — reading-mode fold key (nid_7qbtubxk89team9oadnl3hanr_e)

(Produced by a read-only Explore agent; persisted verbatim by TOP_LEVEL_AGENT.)

## 1. `buildKey` today: full call path

- Post-processor registered in `src/main.ts:27`; the store is constructed once per plugin load at
  `src/main.ts:25` and injected at `:26`.
- `FoldableEmbedsPostProcessor.process` (`src/foldableEmbedsPostProcessor.ts:65-72`):
  `el.querySelectorAll('.internal-embed')` (`:66`, selector const at `src/embedFoldDom.ts:29`), then
  `embeds.forEach((embed, indexWithinSection) => ...)`. So **`indexWithinSection` is purely the DOM
  ordinal of the embed span inside the section element `el`** (0-based, counts media embeds too —
  the media filter happens later at `:226`/`:252`). Captured eagerly and closed over into the async
  ready callback (`:68-70`).
- `makeFoldable` (`:74-120`): guard `wiredEmbeds.has(embed)` (`:82`), marker strip (`:85`),
  `const key = this.buildKey(...)` (`:86`), `const folded = this.store.get(key) ?? foldedByDefault(...)`
  (`:87`). The key is captured in the title-click closure and written back on every toggle:
  `this.store.set(key, nowFolded)` (`:108`).
- `buildKey` (`:188-198`):
  ```
  const src = embed.getAttribute("src") ?? "";
  const lineStart = ctx.getSectionInfo(sectionEl)?.lineStart;
  const locator = lineStart !== undefined ? `L${lineStart}` : `S${this.sectionHash(sectionEl)}`;
  return `${ctx.sourcePath}::${locator}::${src}::#${indexWithinSection}`;
  ```
  Doc comment `:180-187` claims the source line is "stable across re-renders" — true only if nothing
  above changed; this is the overstatement the ticket calls out.
- `sectionHash` (`:201-208`): djb2 over `sectionEl.textContent` — the **RENDERED** text, which for a
  section containing a note embed includes the whole embedded child's body, so the fallback key
  changes whenever the CHILD note changes. Purely content-based → two identical sections collide.
- Store (`src/foldStateStore.ts:9-23`): a bare `Map<string, boolean>`, `get` (`:16-18`) / `set`
  (`:20-22`). No delete, no iteration, no persistence, no pruning, no per-file grouping. Lifetime =
  one instance per `onload` (`main.ts:25`); `teardown()` (`postProcessor:50-63`) does not touch it,
  but disable→enable builds a new store so state is lost anyway. Scope = whole app session, all
  files, top-level AND nested (Live Preview embed BODIES render through this same post-processor —
  `src/foldableEmbedMark.ts:113-119`).

## 2. Identity available at post-process time

Per embed the code has: the `.internal-embed` span, its `src`/`alt`, the section element, `ctx`.

- MEASURED span shape (real Obsidian 1.12.7, gitignored probe logs): `.tmp/probe/run14.log:29` —
  `<span alt="sibling" src="sibling" class="internal-embed markdown-embed inline-embed is-loaded
  fen-embed">`; also `.tmp/proto-e2e.log:27`. In Live Preview the same node is a `div` with
  `contenteditable="false"` (`.tmp/proto-e2e-run3.log:35`). `src` = link target as written; `alt` =
  display text (equal to `src` in every measured sample; **`![[a#b|c]]` / heading-ref cases are NOT
  measured anywhere — assume nothing**).
- `MarkdownPostProcessorContext` (`node_modules/obsidian/obsidian.d.ts:3862-3891`): `docId` (`:3866`,
  undocumented semantics, nothing measures re-render stability — treat as per-render), `sourcePath`
  (`:3871`), `frontmatter` (`:3873`), `addChild` (`:3882`), `getSectionInfo(el)` (`:3889` —
  documented "may return null in many circumstances").
- `MarkdownSectionInformation` (`:4017-4024`) gives **`text`, `lineStart`, `lineEnd`** — `text` is
  the section's RAW SOURCE: edit-above-stable identity material the current code ignores.
- `MetadataCache` (`:4266-4326`): `getFirstLinkpathDest` (`:4266`), `getFileCache(file)` (`:4272`),
  **`getCache(path)` (`:4277` — takes a path, so `ctx.sourcePath` needs no `TFile` lookup)**. Events
  `changed` (`:4308`), `deleted` (`:4314`), `resolve`/`resolved` (`:4321`/`:4326`).
- `CachedMetadata.embeds?: EmbedCache[]` (`:1396`); `EmbedCache extends ReferenceCache` (`:2670`) →
  `Reference` = `link`, `original`, `displayText?` (`:5151-5167`); `CacheItem.position: Pos`,
  `Loc = {line (0-based), col, offset}` (`:1455-1462`, `:3750-3766`). For `![[a#b|c]]`:
  `link="a#b"`, `displayText="c"`, `original="![[a#b|c]]"`.

**Deriving "Nth occurrence of `![[src]]` in this file":** `app.metadataCache.getCache(ctx.sourcePath)
?.embeds ?? []` (document order) → filter to `position.start.line` ∈ `[lineStart, lineEnd]` of
`ctx.getSectionInfo(sectionEl)` → index by `indexWithinSection` → this span's cache entry → its
global index, or its ordinal among entries with the same `link`.

What breaks that derivation:
- **Aliases / subpaths.** The join `span.src === cache.link` is UNMEASURED for `![[a#b|c]]`,
  `![[a#b]]`. `e2e/foldable-embeds.e2e.ts:203-217` exercises `![[ref-child#Section A]]` /
  `![[ref-child#^blockid]]` in the DOM but never reads `src`. Matching by *position within the
  section* rather than by string avoids the join entirely.
- **Ordinal alignment.** `indexWithinSection` counts every `.internal-embed` (media included, `:66`);
  the cache `embeds` array also includes image/pdf embeds, so alignment is plausible — but an embed
  that fails to render a span (or a plugin-injected embed) desynchronises it.
- **Code blocks / frontmatter.** A fenced/inline-code `![[x]]` renders no embed and (believed, not
  measured) is not in `embeds`. Frontmatter is its own section with no embed spans.
- **Cache staleness.** `getSectionInfo` is documented "call right before you need it" (`:3884-3886`);
  the metadata cache re-parses asynchronously on `changed` (`:4308`) and reflects the file on DISK,
  so a render right after an unsaved edit can see stale `embeds`. MUST be measured.
- **Per-SECTION invocation.** `getSectionInfo` returns null "in many circumstances" — the whole
  reason `S<hash>` exists (`:196`); in that branch there is no line range, so the cache-window
  derivation has no anchor and needs its own fallback.
- **Nested / child ctx.** For an embed BODY the post-processor runs with the CHILD file's `ctx`
  (`sourcePath` = child, `getSectionInfo` = lines inside the child) — `CLAUDE.md`, measured in
  ticket `nid_zqaxj18jbxwnazzz8aeggz91u_e`. A cache lookup resolves the CHILD's embeds: locally
  correct, but every host instance gets an identical key (that ticket's problem, not this one's).

## 3. Access to `app` from the post-processor

**None today.** Constructor takes only `(store, readSettings)` (`postProcessor:38-41`); `main.ts:26`
passes exactly that. `app` appears in `src/` only at `src/settings/foldableEmbedsSettingTab.ts:2,14`
and `src/main.ts:31`. Cost of reaching `metadataCache` = one constructor parameter in `main.ts:26` —
and the codebase idiom is a NARROW port, not the whole `App` (cf. `SettingsPersistence` in
`src/settings/foldableEmbedsSettingsStore.ts:8-11`, `ReadSettings`), so the natural shape is e.g.
`readEmbeds: (sourcePath: string) => EmbedCache[]` injected from `main.ts` — also unit-testable.

## 4. Live Preview keying — must the shapes be unified? NO.

`src/livePreview/foldStateField.ts` keys by **CM6 document position**: `ExplicitFold extends
RangeValue` with `mapMode = TrackAfter` (`:8-30`), in a `StateField<RangeSet<ExplicitFold>>`
(`:47-68`) mapped through every change (`set.map(tr.changes)`, `:49`); lookup is a line-RANGE scan
(`explicitFoldAt`, `:80-88`); rule is `explicitFoldAt(...) ?? foldedByDefault(...)` (`:99-101`).
Per editor VIEW, per session; `main.ts:30` gives the extension only `readSettings` — it never sees
`FoldStateStore`. Structurally incommensurable (positions-that-map vs session Map keys), and
`CLAUDE.md` states the two modes deliberately share NO fold-state identity. Only the shared
invariants must match: `undefined` = "never toggled" (`foldStateStore.ts:12-15` vs
`foldStateField.ts:70-79`) and the toggle inverts the DISPLAYED state (`postProcessor:104-107` vs
`foldStateField.ts:93-98`).

## 5. Linked tickets — what the key shape must satisfy

- `nid_zqaxj18jbxwnazzz8aeggz91u_e` (nested embeds share ONE key): design = `WeakMap<HTMLElement,
  string>` of wired embed → key, `buildKey` prefixing the key of
  `embed.parentElement?.closest('.internal-embed')`. Constraint: the key must be an **opaque
  composable STRING with an unambiguous delimiter**, computed for EVERY wired embed (nested
  included) and recorded at wiring time so a descendant can look it up; must not assume
  `ctx.sourcePath` is the file the user is looking at.
- `nid_z4jq8me8mhstojozeua8fufdr_e` (later embed inherits a deleted embed's key): **CAUTION — an
  occurrence-ordinal key does NOT fix this by itself.** With two `![[child]]` embeds, deleting the
  first makes the second occurrence #0 and it inherits the stored fold, exactly as the line key
  does. Live Preview solved it structurally (`mapMode = TrackAfter`); the reading-mode `Map` has no
  analogue. So leave room for a later **per-file invalidation/remap**: keys groupable by
  `sourcePath` (parseable prefix) and a store that can grow `delete`/iterate/`clearFile` — none of
  which exist today (`foldStateStore.ts:9-23`).
- Combined target shape: `sourcePath::<hostKey?>::<occurrence-identity>` — stable delimiter,
  file-prefix parseable, one key per wired embed, no raw line number.

## 6. Existing tests and unit harness

- Reading-mode fold-identity e2e, all `e2e/foldable-embeds.e2e.ts`: "fold state survives leaving the
  note and coming back" (`:129-143`, uses `harness.reopenThroughOtherFile`
  `e2e/obsidianHarness.ts:225-228` + `captureElement`/`expectFreshElement` `e2e/reRenderGuard.ts:16,29`;
  WHY-NOT-a-mode-round-trip rationale `obsidianHarness.ts:216-224`); "two embeds of the SAME note
  fold independently" (`:192-201`, fixture `twins.md` `:55` = two identical `![[child]]` sections —
  **the trap for any pure section-TEXT-hash key: both sections hash identically**); heading/block-ref
  fixtures `:56-61`, test `:203-217`.
- Live Preview templates named by the ticket: `e2e/live-preview-foldable-embeds.e2e.ts:455`
  (delete-line) and `:305` (edit shifts everything below).
- Edit helpers: `harness.replaceRange` (`obsidianHarness.ts:325`), `setCursor` (`:288`),
  `setMarkdownViewMode` (`:250`), `setPluginEnabled` (`:341`), `launch({extraFixtures})` (`:107`).
- **No unit-test runner exists.** `package.json:7-15` has only `dev`/`build`/`version`/`lint`/
  `setup:*`/`test:e2e`; devDeps (`:18-29`) have `@playwright/test`, no vitest/jest. Ticket
  `nid_lcehddb2tdcq6qxztmhvhpgga_e` is open to add one. A pure `buildKey` behind an injected
  `readEmbeds` port would be a natural item there, but there is nothing to run it on today.
