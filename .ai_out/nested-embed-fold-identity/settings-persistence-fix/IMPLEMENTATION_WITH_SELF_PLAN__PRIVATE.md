# IMPLEMENTATION (self-plan) — PRIVATE working notes

Ticket: nid_zqaxj18jbxwnazzz8aeggz91u_e — nested embeds share ONE reading-mode fold key.

## Status: DONE (review iteration 1 incorporated)

Commits: `ce2e132` specs → `afc21eb` fix → `cc4d59a` ordering+docs → `7418749` F1/F3/F4 +
first F2 attempt → `21e1e75` F2 done properly (`supersededKeys` list).
lint 0 errors / 1 pre-existing warning, build 0, e2e **52 passed**.
NOT done by design (TOP_LEVEL_AGENT owns): `change_log`, closing the ticket.

## Files touched THIS iteration

- `src/embedFoldKeys.ts` — `EmbedFoldKey.superseded: string|null` → `supersededKeys:
  readonly string[]`; `nestedIn` returns the weak/strong CROSS PRODUCT minus `current`;
  `unseenHostKey` doc rewritten (F1); module doc's "getSectionInfo is always null for an embed
  body" corrected.
- `src/foldableEmbedsPostProcessor.ts` — adopts from each superseded key in a loop.
- `src/embedFoldKeyRegistry.ts` — doc only (F3 fallback re-collides, F4 slot lifetime).
- `e2e/nested-fold-cold-start.e2e.ts` — NEW, own Obsidian instance.
- `e2e/obsidianHarness.ts` — `withUnindexedNote(path, body)`; `e2e/obsidianAppApi.ts` —
  `__fenOriginalGetCache` stash field.
- `CLAUDE.md`, `eslint.config.mts`, `.gitignore`.

## The lesson of this iteration (worth remembering)

**Both the original code AND the review's suggested fix were wrong, and only a probe showed
it.** I nearly shipped attempt 1 (`7418749`) on reasoning alone. The e2e caught it because the
e2e was made non-vacuous FIRST.

Sequence that worked, in order — do it in this order next time:
1. Write the spec. 2. Revert the product fix and check it goes RED. 3. It did NOT (6/6 green)
→ the spec was vacuous. 4. Probe WHY (`cacheAtOpen=[WARM]` 3/3) instead of guessing.
5. Make the precondition deterministic (fault injection at the narrowest possible seam).
6. Spec now RED even WITH the fix → the fix itself was wrong. 7. Probe the actual keys.
8. Fix for real; re-check RED for both rejected variants.

Concretely: `cold-host.md::L2::…::in::cold-child.md::occ::…` — a WEAK host half with a STRONG
own half in ONE key. That combination is the whole finding.

## Traps hit

- A scratch worktree under `.worktree/` makes `npm run lint` fail (eslint lints the copy).
  Fixed in `eslint.config.mts` + `.gitignore` — but if a future worktree is placed elsewhere,
  expect the same.
- The harness does NOT forward the page console. To see values from inside the plugin, push
  them onto a `window.__fen…` array from the product code (temporarily) and read it with
  `page.evaluate` from the spec. Revert both halves afterwards.
- `npm run test:e2e` rebuilds and re-seeds the dev vault, so a worktree run needs only a
  `node_modules` symlink and `OBSIDIAN_PATH`.
- `OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh)` →
  `/home/node/.cache/obsidian-e2e/obsidian-1.12.7/obsidian`.

## Ideas deliberately NOT taken

- Reaching the cold window by TIMING (open a note "early"). Measured: the cache is already
  warm at the first open, so such a spec cannot fail.
- Patching `getFileCache` instead of `getCache` — wider blast radius; Obsidian's own rendering
  uses it. `getCache(path)` is exactly the one call the plugin makes.
- Making `FoldStateStore` take a list of source keys. The post-processor loop plus the store's
  existing "already recorded" guard is simpler and leaves the store's contract alone.
- Per-element identity for unseen (Live Preview) hosts — trades "survives a rebuild" for
  "never collides"; recorded as a trade-off in the registry doc, deferred to
  `nid_jdpdpu7w0nfda3y4decz7f6xy_e`.
