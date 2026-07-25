# EXPLORATION — private working notes (nested-embed-fold-identity)

Kept separate from EXPLORATION_PUBLIC.md so the public file stays dense/citation-grade; this
file is scratch trail for how I got there, plus things I could NOT verify and should be
re-checked by IMPLEMENTATION (ideally via a probe spec, this repo's own convention).

## Sequence of reads
1. `.ai_out/nested-embed-fold-identity/settings-persistence-fix/TOP_LEVEL_AGENT.md` — confirmed
   the flow context and that the "ticket line refs are stale" note was already known upstream.
2. `git log --oneline -15` — showed this repo already closed a SIBLING ticket
   (`nid_7qbtubxk89team9oadnl3hanr_e`, "line-shift fold identity") via commits `83a79a6` .. `7c46989`.
   That prior work is WHY `foldableEmbedsPostProcessor.ts:120-130` no longer contains `buildKey` —
   it moved wholesale into the new `embedFoldKeys.ts` module during that work, and the doc comment
   in `embedFoldKeys.ts` was written by that same effort, already anticipating (not fixing) THIS
   ticket.
3. Read `embedFoldKeys.ts`, `foldableEmbedsPostProcessor.ts`, `foldStateStore.ts`,
   `wiredElements.ts`, `foldableEmbedMark.ts`, `embedFoldDom.ts` in full.
4. Read all e2e files requested, plus `live-preview-foldable-embeds.e2e.ts` (not explicitly
   requested but essential — it's the ONLY existing nested-embed e2e coverage in the whole repo,
   and gave the locator pattern (`.locator(...).locator(...)` chaining on `[src="..."]`) that a
   new reading-mode nested spec should reuse).
5. Read `CLAUDE.md` fully for the Live Preview nested-embed claim + architecture summary (this
   file is clearly kept meticulously up to date in this repo — treat it as near-primary-source).
6. Read the ticket file itself (`_tickets/reading-mode-nested-embeds-share-one-fold-state-...md`)
   — this is the actual ticket body; TOP_LEVEL_AGENT.md's task description in this prompt is a
   close paraphrase of it (word matches "MEASURED", "nested-twins.md" etc all trace back here).
7. Checked `.tmp/probe/` — 14 probe files + run logs, exactly matching the ticket's own citation.
   Read `probe2.e2e.ts` in full (PROBE 7-11, general fold-identity probing, more relevant to the
   PRIOR closed ticket than this one) and skimmed `run14.log`/`run14b.log` (from `probe14.e2e.ts`,
   NOT read in full — only tail'd) which are the ones actually touching nested + reading mode
   together. I did NOT read `probe14.e2e.ts`'s source itself, nor probe3/probe4 in full — time
   was better spent nailing the STATIC code mechanism, which is unambiguous, over re-verifying
   dynamic evidence that's already logged.
8. Checked `package.json`, `scripts/run-e2e.sh`, `scripts/setup-obsidian-bin.sh` (head only) for
   commands. Confirmed NO test runner via `find . -name "*.test.ts"` (zero hits) and no
   jest/vitest/mocha in devDependencies.
9. Confirmed via `src/main.ts` grep that `EmbedFoldKeys` is constructed with
   `(sourcePath) => this.app.metadataCache.getCache(sourcePath)?.embeds ?? []` — this IS the
   `ReadEmbeds` port's real implementation, only ever injected once, at `main.ts:29`.

## Things I did NOT directly measure (flagged so IMPLEMENTATION doesn't over-trust me either)

- **Whether `ctx.getSectionInfo` returns `null` or a non-null section "inside the child" for a
  nested embed's post-processor pass.** The ticket's ORIGINAL text asserts (as MEASURED) that it
  returns "the line INSIDE the child" — i.e. NON-null. The `embedFoldKeys.ts` doc comment (written
  by the PRIOR ticket's implementer, presumably without directly measuring this specific case)
  says the opposite: "UNMEASURED: `ctx.getSectionInfo` is expected to return null outside a
  top-level markdown view."
  These two claims are NOT necessarily contradictory in effect (see below), but they disagree on
  MECHANISM, and I could not run Obsidian myself in this read-only exploration to settle it
  directly. Here's my reasoning for why I believe the "null" version, which I asserted in the
  public doc, but this needs a probe to CONFIRM before implementation commits to a specific code
  path:
  - If `getSectionInfo` returned a genuinely valid, non-null section "inside the child" (i.e. some
    line range within the child's OWN raw markdown), then `cachedOccurrenceOf` would call
    `this.readEmbeds(occurrence.sourcePath)` = the CHILD's OWN embeds list (e.g. just the
    grandchild link) and `scanForOccurrence` would find a real ordinal for THAT child's
    single embed. That would actually SUCCEED and produce an `occ` key of shape
    `<childPath>::occ::<grandchildLink>::#0` — which is STILL collision-prone (same for both
    occurrences, since `sourcePath` = child path is identical, and ordinal is always 0 for a
    single grandchild embed) but via the OCCURRENCE branch, not the FALLBACK branch. Either branch
    produces the SAME OBSERVABLE BUG (collision across occurrences of the host), but the CODE PATH
    exercised — and therefore where a fix should intervene — differs:
    - If it's the fallback (`section === null`) branch: a host-identity fix should intervene in
      `positionalFallbackKey` (or upstream of it, prefixing sourcePath itself with a host key
      before the S<hash> is computed) OR make `occurrenceOf` gather host-ancestry BEFORE calling
      `keys.keyFor`, and pass it through as part of `EmbedOccurrence`.
    - If it's the occurrence branch: a host-identity fix should ALSO intervene in the `occ` key
      construction in `keyFor` (adding a host-key segment to the `sourcePath::occ::<link>::#<ord>`
      join), not just the fallback.
  - Either way, the STRUCTURAL fix (thread a host-embed identity signal through `EmbedOccurrence`
    and prefix/fold it into BOTH `keyFor`'s occurrence branch and `positionalFallbackKey`) is the
    same, so I don't think this ambiguity should block writing the self-plan — but IMPLEMENTATION
    should write a throwaway probe spec (repo convention: `.tmp/probe/`) FIRST, instrumenting
    `ctx.getSectionInfo(sectionEl)` in a patched build (or via a console.log/breakpoint approach —
    this repo's probes seem to just add extra fixtures/assertions and read the RESULTING classes,
    not console-log internals directly, so an easier route is probably to console.log from a
    LOCAL patched copy of `embedFoldKeys.ts`/`foldableEmbedsPostProcessor.ts`, run once, then
    revert — this repo's `.ai_out` logs (`e2e-*.log`, `foldkey-*.log`, `instr-run-*.log` in
    `.tmp/`) suggest EXACTLY this "instrument, run, revert" workflow was used repeatedly for the
    prior ticket, e.g. `embedFoldKeys.backup.ts` sitting in `.tmp/` right now is very likely a
    backup made during exactly that kind of instrumentation on the PRIOR ticket. Reuse the
    pattern.

- **Whether the outer host embed is ALREADY wired (in `WiredElements`) by the time the inner
  nested embed's post-processor pass runs**, i.e. the literal ordering question from the ticket.
  I could not measure this without running Obsidian; I reasoned about it structurally in the
  public doc (§3) and concluded it's UNGUARANTEED by the code, moot for a `getSectionInfo`-based
  root cause, but LOAD-BEARING if the fix is a WeakMap-based host-lookup as literally suggested by
  the ticket. My recommendation (also in the public doc) is to prefer an ANCESTRY-WALK-based
  discriminator that doesn't need the host to be wired first, over the literal WeakMap suggestion,
  specifically to sidestep needing to answer this ordering question empirically at all. If
  IMPLEMENTATION prefers the WeakMap shape anyway (e.g. because it's simpler/matches the ticket's
  literal wording, which the acceptance criteria do NOT prescribe as mandatory — the AC is about
  OUTCOMES: "make a nested embed's identity inherit its HOST's identity" is Design intent, not
  strictly mandatory API shape), it should MEASURE ordering via a probe first, and design a
  fallback if unwired (a natural one: recurse — if the WeakMap lookup at `embed`'s host ancestor
  finds nothing yet, don't skip discrimination; fall back to something like "walk to the OUTER
  MOST unwired-but-derivable-from-DOM ancestor and use ITS occurrenceOf() signals directly rather
  than a cached key", i.e. compute-not-lookup as the fallback for compute-or-lookup).

- I did NOT verify by executing anything that `.internal-embed` nesting is truly a plain DOM
  ancestor relationship in READING mode specifically (only confirmed it via the LIVE PREVIEW
  spec's locator-chaining, which uses `.cm-content` as root, not `.markdown-reading-view`). This
  is very likely true in reading mode too — Obsidian's embed-body rendering mechanism is shared —
  but flagging it as an inference, not a citation, in case reading-mode's wrapper DOM differs
  (e.g. an extra wrapper div that make `.closest('.internal-embed')` skip a level, or reading
  mode nests one level deeper/shallower than Live Preview's widget). Cheap to confirm with one
  probe spec assertion (`await expect(nested.locator('xpath=ancestor::*[contains(@class,
  "internal-embed")][1]')).toHaveAttribute('src', hostSrc)`-style check) before committing.

## Other loose ends / FYI for the next agent

- There are FOUR open tickets in `_tickets/` that are clearly siblings of this one (found via
  `find _tickets -iname "*nested*"`):
  - `reading-mode-nested-embeds-share-one-fold-state-...md` — THIS ticket.
  - `nested-embeds-inside-live-preview-widgets-are-never-unmarked-and-the-disabled-plugins-click-listener-keeps-handling-them.md`
  - `re-enabled-plugin-does-not-adopt-already-rendered-embeds-so-nested-embeds-stay-unfoldable-until-the-note-is-reopened.md`
  - `embedfolddomunmark-can-steal-a-nested-embeds-chevron-unscoped-subtree-query.md`
  None of these were read in full (out of scope per TOP_LEVEL_AGENT.md's task — only THIS ticket
  is assigned), but their EXISTENCE is worth knowing: whatever host-identity mechanism this
  ticket's fix introduces should not be designed in a way that makes those other tickets harder,
  and it's plausible the WeakMap-of-wired-embeds idea (or an ancestry walk) touches similar code
  to the "re-enabled plugin doesn't adopt already-rendered embeds" ticket. Flag for
  IMPLEMENTATION/REVIEW to at least skim those other 3 ticket titles before finalizing an approach,
  in case there's an obviously-compatible-or-incompatible shape.

- `.tmp/` has an enormous number of log files (`build*.log`, `e2e-*.log`, `lint*.log`,
  `probe-*.log`, `rev*.log`, `iter*.log`, etc — over 150 files) — evidence of MANY prior
  agent-driven iteration cycles on this repo (likely across several of the OTHER tickets in
  `.ai_out/`, e.g. `e2e-assertion-robustness`, `settings-persistence`, `default-collapsed-setting`,
  etc. — this repo has clearly been the subject of a long-running automated-agent workflow, this
  ticket is just the newest one). None of these logs were read in detail (not relevant to THIS
  ticket's mechanism), but `embedFoldKeys.backup.ts` and `store-fixed.ts` sitting directly in
  `.tmp/` (not `.tmp/probe/`) are suspicious enough to be worth a glance if IMPLEMENTATION wants
  a shortcut/reference — I did NOT open them, in case they represent an ABANDONED or WRONG
  approach from a previous attempt at exactly this ticket (the file names are generic enough this
  can't be ruled out) — treat as unverified scratch, not a source of truth.

- Confirmed (grep) there is exactly ONE call site constructing `EmbedFoldKeys`
  (`src/main.ts:29`), so the `ReadEmbeds` injection point for a future host-aware key derivation
  is unambiguous — no other wiring path to worry about missing.

## What I'm confident about (no caveats)
- The stale-line-reference correction (§0 of public doc) — 100% verified by direct `grep`+`Read`.
- The full `EmbedFoldKeys`/`FoldStateStore`/`WiredElements`/`FoldableEmbedMark` code (quoted
  verbatim in the public doc) — these are complete files, read in full, not excerpted guesses.
- The e2e harness API surface (`ObsidianHarness`, `foldAssertions`, `reRenderGuard`) — all read in
  full, signatures quoted verbatim.
- No unit test framework exists — verified by `find` + `package.json` inspection, unambiguous.
- Live Preview's "top-level only" claim — corroborated by BOTH the CLAUDE.md prose AND the actual
  e2e test that demonstrates the nested embed folding via the READING-MODE mechanism reused inside
  a CM6 widget, not via Live Preview's own `RangeSet`-based fold field.
