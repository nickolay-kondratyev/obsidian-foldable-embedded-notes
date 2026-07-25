# IMPLEMENTATION (self-plan) — PRIVATE working notes

Ticket: nid_zqaxj18jbxwnazzz8aeggz91u_e — nested embeds share ONE reading-mode fold key.

## Plan

**Goal**: a nested embed's fold identity INHERITS its host embed's identity, so sibling
occurrences of the same host — and the same child under different host notes — fold
independently, across re-renders.

**Steps**
1. e2e first (RED): add two tests + fixtures to `e2e/foldable-embeds.e2e.ts`
   (sibling-independence across a reopen; cross-note no-bleed). Run, watch fail.
2. `src/embedFoldKeys.ts`: add `nestedIn(host, own)` and `unseenHostKey(src)` — key SHAPE
   knowledge stays in ONE place. Update the module doc (the "still share ONE key" limitation).
3. New `src/embedFoldKeyRegistry.ts`: WeakMap<embed span, lazily derived key>, registered
   SYNCHRONOUSLY in `process()`, resolved on first use; a nested embed's key is qualified by
   its DOM host's key (recursively).
4. `src/foldableEmbedsPostProcessor.ts`: register in `process()`, resolve in `makeFoldable`.
5. Ordering probe (temporary instrumentation) to MEASURE that a reading-mode host is always
   registered before its nested embed's key is derived.
6. lint + build + full e2e; update CLAUDE.md.

## ORDERING — the critical risk and how it is resolved

The registry does NOT depend on the host having been WIRED (title loaded → `makeFoldable`).
It depends only on the host span having been SEEN by `process()`, which is structurally
guaranteed: an embed BODY is post-processed only after Obsidian resolved the embed, which can
only happen after the section containing the host span was post-processed. Registration is
synchronous inside `process()`, derivation is lazy (so `getSectionInfo` is still called right
before it is needed) and memoized per element (host and its children can never disagree).

Fallback for a host that was never registered: Live Preview TOP-LEVEL embed spans are built by
CM6, not by our post-processor, so they are never registered. Those get `host::<src>` — no
regression vs today (still shared between two LP occurrences of the same host note), and it
DOES fix the cross-note case there. Documented as a KNOWN LIMITATION.

Deliberately NOT reusing `adoptRecordingOf` for the host prefix: nothing degrades here, so
there is nothing to take over. `adoptRecordingOf` still runs for the nested embed's OWN
cold-cache window; the host prefix used for `superseded` is the host's own `superseded ?? current`,
so a takeover across a cold host still lands.

## Status: DONE

All six steps executed. lint 0 (1 pre-existing warning), build 0, e2e 51/51.
Commits: `ce2e132` failing specs, `afc21eb` fix, `cc4d59a` measured ordering + CLAUDE.md.
NOT done by design (owned by TOP_LEVEL_AGENT): `change_log` entry, closing the ticket.

## Files touched

- `e2e/foldable-embeds.e2e.ts` — 5 fixtures (`nested-grandchild.md`, `nested-child.md`,
  `nested-twins.md`, `nested-host-a.md`, `nested-host-b.md`), `nestedEmbeds()` /
  `waitForNestedEmbedsWired()` / `openWithNestedEmbeds()` helpers, 2 tests placed BEFORE the
  plugin-disable test (which must stay last in the serial file).
- `src/embedFoldKeys.ts` — `nestedIn`, `unseenHostKey`, private `qualify`, 2 new constants
  (`NESTING_SEPARATOR = "in"`, `UNSEEN_HOST_LOCATOR = "host"`), module doc rewritten.
- `src/embedFoldKeyRegistry.ts` — NEW.
- `src/foldableEmbedsPostProcessor.ts` — registry field + constructor body, `process()`
  registers, `makeFoldable(embed, title, ctx, pendingKey)`.
- `CLAUDE.md` — key bullet + new registry bullet.

## How to reproduce the runs

```bash
export OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh)   # /home/node/.cache/obsidian-e2e/obsidian-1.12.7/obsidian
npm run test:e2e -- e2e/foldable-embeds.e2e.ts
npm run test:e2e                                             # full suite
```

Probe (needs the headless flags run-e2e.sh normally injects):

```bash
export OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"
npm run setup:dev-vault                                      # rebuild the instrumented plugin
npx playwright test --config .tmp/probe/pw.config.ts .tmp/probe/probe15.e2e.ts
```

`.tmp/probe/probe15.e2e.ts` is kept (gitignored). It only prints; re-instrument
`EmbedFoldKeyRegistry.hostKeyOf` with a `console.info` before re-running it.

## Traps hit (worth knowing)

- The serial suite SKIPS the rest of the file after a failure, so the second red had to be
  observed with `-g "ANOTHER host note"`.
- A probe run outside `scripts/run-e2e.sh` dies with a dbus error unless
  `OBSIDIAN_E2E_EXTRA_ARGS` carries the headless flags.
- A first probe version logged `unseen` twice in "reading mode" and looked like a real ordering
  miss; adding the CONTAINER to the log showed both came from the hidden Live Preview editor in
  the same leaf. Never conclude from a host `src` alone — always log where the node lives.
- `expectFolded(x, false)` retries until it passes, so it is green merely for being EARLY.
  Every new assertion of that shape is gated behind `waitForNestedEmbedsWired`, whose chevron
  check is the settled barrier (same trick as `reading-mode-fold-key.e2e.ts`).

## Ideas deliberately NOT taken

- Eager key derivation inside `process()` — simpler, but it moves `getSectionInfo` earlier and
  would make more embeds take the cold-cache fallback at app start. Lazy + memoised keeps the
  existing timing.
- A per-ELEMENT synthetic id for unseen (Live Preview) hosts — would make LP nested embeds fold
  independently, but their fold would no longer survive a rebuild of that DOM. `host::<src>` is
  a strict improvement over today with no regression; the synthetic id is a trade.
- Reusing `adoptRecordingOf` to take over a "host not yet known" key — no such window exists
  once registration is synchronous, so it would be dead machinery.
