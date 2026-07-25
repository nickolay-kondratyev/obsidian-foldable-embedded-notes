# IMPLEMENTATION REVIEW — `ExplicitFold.mapMode = TrackAfter` (commit `c52f646`)

Ticket `nid_hsjklsk99tgzq3y97tv0kwfr1_e`. Reviewer verdict: **READY**. No BLOCKING and no MAJOR
issues. Four MINOR items and one follow-up-ticket suggestion below.

## What I verified myself (not taken from the implementer's report)

| Check | Result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 1 warning (`prefer-setting-definitions` on `foldableEmbedsSettingTab.ts`, PRE-EXISTING, untouched) |
| `npm run build` | exit 0 |
| `npm run test:e2e` (full) | **38 passed**, incl. the new test and the pinned "typing at the START…" |
| **Non-vacuity, independently reproduced** | I patched ONLY the built artifact `.dev-vault/.obsidian/plugins/foldable-embedded-notes/main.js` (`this.mapMode=l.MapMode.TrackAfter` → `TrackDel`, no source touched) and ran the LP spec: **1 failed / 12 passed** — the failure is exactly the new test, `Received string: "… fen-embed fen-folded"` on `[src="sibling"]`. Dev vault re-seeded afterwards; `git status` clean. |

So the claim "fails without the fix, passes with it" is confirmed first-hand, not just from
`.tmp/e2e-before-fix.log`.

## 1. `mapMode` semantics — correct, verified against the shipped CM source

`node_modules/@codemirror/state/dist/index.js`:
- L3006 `RangeValue.prototype.mapMode = MapMode.TrackDel` — confirms the inherited default.
- L3078 `changes.mapPos(curFrom, val.startSide, val.mapMode)` — confirms `RangeSet.map` honours
  the per-value `mapMode` on the zero-length (`curFrom == curTo`) branch, which is the only
  branch this field ever hits.
- L744-750 is the decision:
  ```js
  if (mode != MapMode.Simple && endA >= pos &&
      (mode == MapMode.TrackDel && posA < pos && endA > pos ||
       mode == MapMode.TrackBefore && posA < pos ||
       mode == MapMode.TrackAfter && endA > pos))
      return null;
  ```

Edit-shape walkthrough (anchor at `pos = line.from`), each traced through the code above and
through `explicitFoldAt`'s line-RANGE `between(line.from, line.to, …)` read:

| Edit | Result | Expected by a user? |
|---|---|---|
| Delete the whole line **with** its newline (`[pos, pos+len+1)`) | `endA > pos` → **dropped**. The ticket's bug. | Yes — this is the fix. |
| Insert at the anchor (typing at line start) | `len == 0`, `endA == pos` → kept; maps to *after* the insert, still within the same line, so the line-range read finds it. | Yes — pinned e2e still green. |
| Delete the PREVIOUS line's newline (backspace at line start, join) | Deletion `[prevLine.to, pos)`, `endA == pos` → kept, remaps to the join point, which is on the merged line. Fold follows its embed. Same as before the change. | Yes. |
| Delete a selection ENDING exactly at the line start (e.g. the whole line above) | `endA == pos` → kept, remaps to the new line start. Fold follows its embed upward. Unchanged from before. | Yes. |
| Delete the line text **without** its newline | `endA > pos` → dropped; the line becomes empty and has no embed. | Yes (nothing left to fold). |
| Delete from mid-previous-line THROUGH into the folded line | `posA < pos && endA > pos` → dropped under BOTH TrackDel and TrackAfter. No change. | Yes. |
| Deletion strictly after the anchor (`endA > pos` on the keep-section path) | Early `return posB + (pos - posA)`; anchor survives. | Yes. |
| **Undo of a delete-line** | The anchor is gone for good — the restored embed comes back UNFOLDED (falls back to `foldedByDefault`). Under TrackDel the anchor *did* survive an undo, so this is a small regression in isolation. | Acceptable: the pre-fix "surviving" anchor was on the WRONG line, so the old undo restored a fold onto the wrong embed. RangeSet-mapped state is not undo-restorable in general; and losing a fold errs toward SHOWING content rather than silently hiding it. |
| **Delete the first character of a folded embed's line** (e.g. backspace over the leading `!`) | `endA > pos` → dropped; the embed survives but pops open. Under TrackDel it was kept. | See MINOR-1 — a real, small behaviour regression, in the safe direction. |

Net: TrackAfter is the right choice at this altitude. Every case it changes moves fold state
from "silently folded, user never asked" toward "visible", which is the correct direction for a
plugin whose failure mode is hidden content.

`override readonly mapMode` compiles to a constructor assignment (`target: ES2021`, no
`useDefineForClassFields`) — confirmed in the emitted bundle: `super(); this.folded=t;
this.mapMode=l.MapMode.TrackAfter`. `RangeSet.map` reads it at map time, so the ordering is
fine.

## 2. The new e2e — sound

- Fails without the fix (reproduced above), and the failure was NOT transient (15.1s of the bad
  class).
- `expectFolded` is used in the shared scalar-regex + `toBeAttached()` form documented in
  `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/e2e/foldAssertions.ts`
  — no array-form vacuity.
- `expect(first).toHaveCount(0)` correctly gates on the deletion having landed before the
  `not.toHaveClass` retry loop can pass for the wrong reason.
- Fixture isolation is real, not asserted: `ObsidianHarness.prepareVaultCopy` does an
  `fs.rmSync` + fresh copy of `.dev-vault` per `launch()`, and `openFile` reuses the ACTIVE leaf,
  so the mutated `lp-delete-line.md` cannot leak into the next run or the next spec. The test
  runs last and never touches `lp-embeds.md`, so nothing downstream is disturbed.
- Locator ambiguity checked, not assumed: `.dev-vault/child.md` and `.dev-vault/sibling.md`
  contain no embeds of their own, so `[src="child"]` / `[src="sibling"]` each match exactly one
  widget and `toHaveCount(0)` is honest.

## 3. Findings

### MINOR-1 — TrackAfter also drops the fold when the line's FIRST character is deleted

`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/src/livePreview/foldStateField.ts:21`

`TrackAfter` is "the character after the anchor was consumed", which is broader than "the line
is gone". Deleting the leading `!` of `![[child]]-` (or replacing a selection that starts at
ch 0) now forgets the fold, where TrackDel kept it. The embed pops open mid-edit; the user can
re-click. I would NOT add machinery for this (an explicit "was my line deleted?" filter in
`explicitFoldField.update` is materially more code for a marginal case — 80/20 says no).

**Suggested fix:** none in code; instead soften the WHY comment so a future maintainer is not
surprised. Today it says TrackAfter drops it "which is exactly 'its line is gone'" — that is an
over-claim. Suggest: "…which covers 'its line is gone' and, as an accepted over-approximation,
any deletion that eats the line's first character (the fold is forgotten and the embed shows —
the safe direction)."

### MINOR-2 — undo no longer restores the fold; worth one sentence

Same file/line. Called out in the table above. Not worth code, but it is the kind of thing that
gets re-litigated as a "regression" later. One clause in the same comment settles it.

### MINOR-3 — CLAUDE.md sentence is slightly over-precise and slightly mis-placed

`/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/CLAUDE.md:59-62`

"deleting the line drops the anchor" inherits the same over-claim as MINOR-1. It is also
appended to the bullet about `posAtDOM` line-accuracy / widget DOM reuse / `destroy()`, which is
a different concern (SRP applies to docs too). Content-wise it is stable knowledge and succinct —
fine to keep. **Suggested fix:** make it its own bullet and phrase it as "a fold anchor lives and
dies with its LINE (`ExplicitFold.mapMode = TrackAfter`): any deletion consuming the character
after the anchor drops it, so a deleted line cannot hand its fold to the embed that moves up;
insertions at the line start leave it."

### MINOR-4 (pre-existing, unchanged by this commit) — two anchors can land on one line

When a backspace joins two lines that each carried an anchor, both survive on the merged line and
`explicitFoldAt`'s `between(…)` takes whichever it visits first. Pre-existing under TrackDel too;
not introduced here. Noting it so it is not mistaken for fallout of this change.

## 4. Reading mode / `foldedByDefault` interaction

No interaction with this change: `foldedByDefault` is a pure truth table, and reading mode uses
`FoldStateStore`'s own string keys, not CM positions.

**Follow-up ticket suggested (not part of this change):** the reading-mode key is
`` `${sourcePath}::L${lineStart}::${src}::#${index}` `` (`src/foldableEmbedsPostProcessor.ts`,
`buildKey`). Delete a folded embed's line and a LATER embed with the SAME `src` shifts onto that
`lineStart` and inherits the fold — the same bug class this ticket fixed for Live Preview,
narrower because `src` must also match. Out of scope here; deserves its own ticket rather than
scope creep.

## Signal

**READY.** Ship it. MINOR-1/2/3 are comment/doc wording only and can ride along or follow.
