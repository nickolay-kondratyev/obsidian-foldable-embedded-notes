# IMPLEMENTATION_ITERATION — round 1 response to `IMPLEMENTATION_REVIEW__PUBLIC.md`

Reviewed verdict: ITERATION REQUIRED (0 BLOCKING, 3 MAJOR, 8 MINOR).

One commit: `bcd36b8` "Fix nested-embed folding and the posAtDOM contract in Live Preview".
Tree clean. `change_log` entry and ticket closure deliberately left to TOP_LEVEL_AGENT.

**IMPLEMENTATION: READY**

---

## 1. Disposition table

| ID | Sev | Disposition | What changed |
|---|---|---|---|
| F1 | MAJOR | **FIXED** | The view plugin now owns only TOP-LEVEL embeds (`topLevelEmbeds()` filters out any `.internal-embed` with an enclosing `.internal-embed`), used by both `sync()` and `destroy()`. Nested embeds are left to the markdown post-processor, which already renders every embed body — in the editor too. New e2e case; verified failing first (§2.1). |
| F2 | MAJOR | **FIXED** | Verified in `node_modules/@codemirror/view` that `posAtDOM` → `docView.posFromDOM` **throws** `RangeError` and never returns a sentinel: the `pos < 0` branch was dead and the JSDoc contract was false. Now `try/catch` → `null`, with a WHY naming the real blast radius (an escaping throw makes CM6 deactivate the ViewPlugin for the session). |
| F3 | MAJOR | **FIXED** | `ObsidianHarness.reloadPlugin()` → `setPluginEnabled(enabled)`; the teardown test now asserts `fen-embed`/`fen-collapse-icon` count `0` inside `.cm-content` **while the plugin is off**, before any view rebuild. Falsified by sabotage (§2.2). |
| F4 | MINOR | **FIXED** | Test 18 no longer re-folds the marked embed (explicit == marker default ⇒ vacuous). It now asserts the marked embed stays **UN**folded across the edit — only a surviving explicit anchor can satisfy that, since the marker default is "folded". Test 19 re-folds it explicitly as its own precondition. |
| F5 | MINOR | **FIXED** | `lineTextOfEmbed` throws when the embed has no `.cm-line` ancestor instead of returning `""`, so a DOM-shape change can no longer masquerade as "the dash is hidden". |
| F6 | MINOR | **FIXED** | Spec header corrected: one Obsidian instance and one fresh vault copy **per spec file**; `workers: 1` is load-bearing because two instances would fight over the same vault-copy/sandbox dirs, not because suites share a window. |
| F7 | MINOR | **FIXED** | `SEL_INTERNAL_EMBED` (and `CLS_MARKDOWN_EMBED`, needed for F10) moved into `EmbedFoldDom`; both modes now read the shared contract. |
| F8 | MINOR | **FIXED** | `findMarkedEmbedLines` iterates `doc.iterLines()` with a running offset instead of indexed `doc.line(n)` — one walk instead of a per-line tree descent, same line count. |
| F9 | MINOR | **FIXED** | `setLineFold` resolves `tr.changes.mapPos(effect.value.lineFrom)`. No-op today; removes the trap for any caller bundling a change with the effect. |
| F10 | MINOR | **FIXED** | Live Preview's readiness/media gate is now `noteEmbedTitle()` — reading mode's exact rule (`markdown-embed` class **then** title), so the two modes agree on what a foldable embed is. Confirmed non-regressive by the full suite. |
| F11 | MINOR | **FIXED** | README lead paragraph scoped per mode; a nested-embed bullet added (see §3 — the behaviour it documents is asserted, not assumed). |

**Fixed: 11. Rejected: 0.** Every finding survived scrutiny — F1 and F2 were independently
re-verified against the code/CM6 source before acceptance, and F3's claim was proven by
sabotage rather than taken on trust.

---

## 2. Failing-test-first evidence

### 2.1 F1 — nested embed folds its parent (`.tmp/e2e_failfirst.txt`)

New test `clicking a NESTED embed's title never folds the embed it sits inside`, added
BEFORE the source fix, against the unmodified extension:

```
✘  12 › clicking a NESTED embed's title never folds the embed it sits inside (15.1s)
   Error: expect(locator).not.toHaveClass(expected) failed
   Locator: locator('.cm-content .internal-embed[src="lp-nested-child"]')
   Expected pattern: not /\bfen-folded\b/
   Received string: "internal-embed markdown-embed inline-embed is-loaded fen-embed fen-folded"
1 failed, 11 passed
```

The outer embed folded when the NESTED title was clicked — exactly the reviewer's claim.
After the fix the same test passes, and it additionally asserts (a) the nested embed itself
still folds and (b) the outer embed is still foldable by its own title, so "fix by disabling
the feature" cannot pass it.

### 2.2 F3 — teardown assertion falsified (`.tmp/it_e2e_sabotage.txt`)

The rewritten test passes on the real code, so I proved it can fail: temporarily removed the
`unmark` loop from `destroy()` (a fully leaky teardown) and re-ran the spec:

```
✘  10 › disabling the plugin strips its injected DOM, and re-enabling rewires clicks (15.0s)
   Error: expect(locator).toHaveCount(expected) failed   Expected: 0
   > 232 | await expect(page.locator(`.cm-content .${CLS_FOLDABLE}`)).toHaveCount(0);
1 failed, 9 passed
```

The sabotage was reverted immediately; the final suite runs against the real `destroy()`.

### 2.3 F2 — evidence, not a test

`anchorLineStart`'s failure path is only reachable mid-render inside real Obsidian and I
could not force it deterministically without faking CM internals — so I did not write a test
that would only pretend to cover it. The claim itself is verified at the source:
`@codemirror/view/dist/index.js:8182` `posAtDOM` → `posFromDOM` at `:3113`, which does
`if (!view) throw new RangeError(...)`. No negative return exists anywhere on that path.
The dead branch is gone and the contract now matches the behaviour.

---

## 3. One correction to the review's framing (F1 consequence)

The review expected nested embeds to be a straight loss if Live Preview skips them. Probed
against real Obsidian 1.12.7: an embed BODY is rendered through the markdown post-processor
even inside the editor, so the nested embed is already `fen-embed` there and folds on click —
its own fold state, via `FoldStateStore`, not the editor's line anchors. The new test asserts
this (`await expect(nested).toHaveClass(FOLDED_RE)`), and the README bullet states it. So F1's
fix removes the double-wiring and the parent-folding bug without removing any capability.

---

## 4. Final results — honest counts

| Check | Result | Log |
|---|---|---|
| `npm run lint` | exit 0, no output | `.tmp/it_lint2.txt` |
| `npm run build` (`tsc -noEmit` + esbuild production) | exit 0 | `.tmp/it_build2.txt` |
| `npm run test:e2e` (full suite, real Obsidian 1.12.7 headless) | **23 passed**, 0 failed, 0 skipped, exit 0 | `.tmp/it_e2e_final.txt` |

23 = 8 reading-mode + 3 hello-world + 12 Live Preview (11 previous + 1 new nested case).
No test was removed, skipped or weakened. Three Live Preview tests were touched and all
three now assert strictly more: the teardown test (renamed to match what it now checks),
the position-mapping test (F4) and its follow-up (which gained an explicit precondition).
All 8 reading-mode tests remain byte-identical.
