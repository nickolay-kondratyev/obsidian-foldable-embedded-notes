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

## Status

(kept up to date as work proceeds — see PUBLIC.md for the final story)
