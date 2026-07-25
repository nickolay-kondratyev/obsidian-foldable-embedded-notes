---
id: nid_wjjrfc4a48g1yvc8s949xhklo_e
title: "Live Preview: the marker dash re-hides under a selection, so the displayed source misrepresents the file"
status: open
deps: []
links: []
created_iso: 2026-07-25T00:44:49Z
status_updated_iso: 2026-07-25T00:44:49Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [live-preview]
---

`src/livePreview/markedEmbedLines.ts:80` builds `cursorLines` from `range.head` only, so a non-empty selection reveals raw syntax on just the line the head landed on.

MEASURED `.cm-line` text of the `![[child]]-` line:
- cursor on another line -> dash hidden (correct)
- cursor ON the marked line -> `![[child]]...-` revealed (correct)
- selection from the marked line down one line -> `![[child]]...` with the dash HIDDEN
- select-all -> dash HIDDEN

Worse than cosmetic: Obsidian keeps revealing its OWN raw `![[child]]` for a selection touching the line, so the line displays raw source `![[child]]` while the file actually holds `![[child]]-` — the visible text misrepresents the document, and the invisible dash sits inside the selection the user is about to type over.

Reproduced against real Obsidian 1.12.7 during the review; throwaway probe specs and logs are in the gitignored `.tmp/probe/` (`probe*.e2e.ts`, `pw.config.ts`, `run*.log`), runnable with:
`OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh) npx playwright test --config .tmp/probe/pw.config.ts`

## Design

Reveal on every line the selection TOUCHES, not just the head's line:

```ts
const cursorLines = new Set<number>();
for (const range of state.selection.ranges) {
  const first = state.doc.lineAt(range.from).number, last = state.doc.lineAt(range.to).number;
  for (let n = first; n <= last; n++) cursorLines.add(n);
}
```


## Acceptance Criteria

- With a selection spanning the marked line, the dash is VISIBLE (matching how Obsidian reveals its own raw syntax under selection).
- The existing cursor-on-line reveal and the plain Source-mode literal-dash tests still pass.
- e2e coverage added; lint, build and full e2e green.

