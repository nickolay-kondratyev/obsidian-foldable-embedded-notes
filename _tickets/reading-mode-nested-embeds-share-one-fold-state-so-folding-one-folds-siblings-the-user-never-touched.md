---
id: nid_zqaxj18jbxwnazzz8aeggz91u_e
title: "Reading mode: nested embeds share ONE fold state, so folding one folds siblings the user never touched"
status: open
deps: []
links: [nid_7qbtubxk89team9oadnl3hanr_e]
created_iso: 2026-07-25T00:44:47Z
status_updated_iso: 2026-07-25T00:44:47Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
---

`buildKey` in `src/foldableEmbedsPostProcessor.ts:120-130` (called from `:62`) builds a per-embed key from `ctx.sourcePath` + section line + `src` + occurrence index. An embed BODY is rendered through this same post-processor but with the CHILD file's `ctx`, so for a nested embed `sourcePath` is the child note and `getSectionInfo` returns the line INSIDE the child. Every occurrence of the same parent embed therefore produces an IDENTICAL key, and neither `src` nor `indexWithinSection` can discriminate them.

MEASURED: `nested-twins.md` = `![[child]]` twice, `child.md` contains `![[grandchild]]`. In reading mode, fold ONLY the first nested grandchild -> `#0=true #1=false` (correct); reopen the note (fresh render) -> `#0=true #1=true` — the second nested embed folded itself.
Also crosses notes: folding the nested embed in `host-a.md` makes `host-b.md` show it folded on its first ever render.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Make a nested embed's identity inherit its HOST's identity. Suggested minimal shape: stash each wired embed's key in a `WeakMap<HTMLElement, string>`, and in `buildKey` prefix the key of `embed.parentElement?.closest('.internal-embed')` when there is one. That fixes both the same-note sibling bleed and the cross-note bleed.

Keep the reading-mode key a per-session identity only (`src/foldStateStore.ts` is in-memory by product decision) — this ticket is about identity, not persistence.

## Acceptance Criteria

- Folding one nested embed leaves a sibling occurrence of the same parent embed unfolded, ACROSS a re-render (leave the note and come back — see the round-trip note in the e2e-vacuity ticket).
- Folding a nested embed in one host note does not pre-fold it in another host note.
- e2e coverage in `e2e/foldable-embeds.e2e.ts`; lint, build and full e2e green.

