# Private working notes

- Read full `src/foldableEmbedsPostProcessor.ts` (265 lines) and `src/foldableEmbedMark.ts` (53 lines) directly.
- `git status` on entry: worktree already has an untracked `.ai_out/unresolved-embed-observer-leak/` and a modified ticket markdown file under `_tickets/` — did not touch either.
- `.tmp/` is gitignored (confirmed via `.gitignore`) but present in this working tree; it's full of many past investigation logs (fold-key/adopt-recording ticket, unrelated) plus the `.tmp/probe/` dir that IS relevant to this ticket.
- Found the reviewer's exact reproduction at `.tmp/probe/probe6.e2e.ts` + `.tmp/probe/run6.log` — this is a strong, directly-citable source, quoted verbatim numbers match the ticket's "2 -> 4 -> 6".
- `.tmp/probe/probe15.e2e.ts` is for a DIFFERENT ticket (nid_zqaxj18jbxwnazzz8aeggz91u_e, nested embed host registration ordering) — included only to demonstrate the general probe/console-log technique used across this repo's exploration, not directly relevant content-wise.
- No unit test framework found: package.json has no jest/vitest/mocha, no "test" script, only "test:e2e".
- `main.ts:17` `postProcessor` field is TS-`private` but that's erased at runtime — confirmed this is literally how `.tmp/probe/probe6.e2e.ts`'s `observerCount()` helper reads it (`plugin?.postProcessor?.liveObservers?.size`). This IS the "test hook" — not a deliberate one, just JS having no real privacy.
- Did not find any repo evidence about whether a media file's `file-embed` class is ever transiently present before the media-specific class arrives (i.e. whether design point 1's classification could misfire on a media embed mid-resolution) — flagged as open risk in the public doc rather than asserted either way.
- Did not deeply audit `embedFoldDom.ts` / `embedFoldKeys.ts` / `embedFoldKeyRegistry.ts` / `wiredElements.ts` beyond grepping the few constants needed (CLS_MARKDOWN_EMBED, SEL_INTERNAL_EMBED, SEL_EMBED_TITLE) — out of scope per the ticket's ask (focused on the two named files + e2e/test tooling + teardown interaction).
- Did not run `npm run lint`/`npm run build`/e2e myself (task is read-only exploration; also main goal was to document what the commands DO and where npm scripts point, not verify current green/red status).
- eslint scope note (e2e ignored, src/ scoped to obsidianmd ruleset) taken directly from CLAUDE.md text, not independently reread from eslint.config — CLAUDE.md is treated as authoritative project doc per repo convention.
