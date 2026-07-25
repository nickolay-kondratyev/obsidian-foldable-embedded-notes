# IMPLEMENTATION ITERATION — response to `IMPLEMENTATION_REVIEW__PUBLIC.md` (commit `c52f646`)

Ticket `nid_hsjklsk99tgzq3y97tv0kwfr1_e`. Reviewer signalled READY; this iteration is
**comment/doc wording only**. No runtime behaviour changed.

## Per-item disposition

### MINOR-1 — "which is exactly 'its line is gone'" over-claims — **INCORPORATED**

The reviewer is right and it matters: the comment stated a claim about `TrackAfter` that is
narrower than what the code does, and a future maintainer reading it would conclude the
first-character case is a bug. `src/livePreview/foldStateField.ts` now says `TrackAfter`
COVERS "its line is gone" and is deliberately a bit wider, naming the first-character
deletion explicitly, plus WHY we accept it (widening always errs toward SHOWING content;
narrowing costs materially more code than it buys).

No code change — I agree with the reviewer that an explicit "was my line deleted?" filter in
`explicitFoldField.update` is not worth it (80/20), and the task correctly forbids touching
the mapMode behaviour absent a genuine correctness problem. There is none: every widened case
un-folds, which is the safe direction for a plugin whose failure mode is hidden content.

### MINOR-2 — undo no longer restores the fold — **INCORPORATED** (one clause)

Folded into the same comment. This is exactly the kind of thing that gets re-filed as a
"regression" a year from now; recording it at the decision site is the cheap prevention. Also
honest: the pre-fix behaviour did survive undo, but survived it onto the WRONG line.

### MINOR-3 — CLAUDE.md over-precise and mis-placed — **INCORPORATED**

`CLAUDE.md` — the sentence is now its OWN bullet (it was appended to the `posAtDOM` /
widget-DOM-reuse bullet, a different concern; SRP applies to docs) and uses the reviewer's
phrasing: "any deletion consuming the character after the anchor drops it". One line, stable
knowledge, no measurement claim it cannot back.

### MINOR-4 — two anchors can land on one merged line — **NO ACTION, by agreement**

Pre-existing under `TrackDel`, unchanged by this commit, and the reviewer raised it only so it
is not mistaken for fallout. Not filing a ticket: the observable effect is that a line-join of
two folded embeds resolves to one of two folds, both of which the user chose. Low value, and a
ticket for it would be noise.

### Follow-up ticket (reading-mode key) — **FILED**

I checked `buildKey` in `src/foldableEmbedsPostProcessor.ts` myself before filing; the key is
`` `${ctx.sourcePath}::${locator}::${src}::#${indexWithinSection}` `` with
`locator = L${lineStart}` (`S<hash>` only in the null-section fallback), and `FoldStateStore`
is a plain `Map` with no mapping through edits. So the bug class is real: same `src` + same
index-within-section + a `lineStart` freed by a delete ⇒ a later embed inherits a fold nobody
asked for.

**`nid_z4jq8me8mhstojozeua8fufdr_e`** — bug, P3, linked to this ticket. Includes the key shape,
why it is narrower than the LP variant, the failing-first-e2e requirement, and the pointer to
`e2e/live-preview-foldable-embeds.e2e.ts` as the model. NOT fixed here.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 1 warning (`prefer-setting-definitions`, PRE-EXISTING, untouched) — `.tmp/lint-iter.log` |
| `npm run build` | exit 0 — `.tmp/build-iter.log` |
| `npm run test:e2e` | **NOT re-run this iteration, deliberately.** The only source edit is a JSDoc block; the only other edits are `CLAUDE.md` and a new ticket file. Nothing that can affect runtime. The prior full run on this exact code is **38/38 green** (`.tmp/e2e-after-fix.log`), independently reproduced by the reviewer, who also confirmed non-vacuity by patching the built artifact back to `TrackDel` (1 failed / 12 passed, the new test). |

## Files touched this iteration

- `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/src/livePreview/foldStateField.ts` — WHY comment on `ExplicitFold.mapMode` only.
- `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/CLAUDE.md` — anchor-lifetime sentence split into its own bullet, softened wording.
- `/home/nickolaykondratyev/git_repos/nickolay-kondratyev_obsidian-foldable-embedded-notes/_tickets/reading-mode-fold-state-key-can-be-inherited-by-a-later-embed-after-a-line-delete.md` — new; plus a link recorded in the original ticket file.

No commit, no `change_log` entry, ticket not closed — TOP_LEVEL_AGENT owns those.

## Signal

**READY.** All four MINOR items resolved (three incorporated, one no-action by agreement), the
suggested follow-up is filed, lint and build green.
