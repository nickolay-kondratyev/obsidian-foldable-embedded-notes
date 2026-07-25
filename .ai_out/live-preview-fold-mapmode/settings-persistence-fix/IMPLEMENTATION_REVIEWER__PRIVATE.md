# PRIVATE — IMPLEMENTATION_REVIEWER, commit `c52f646`

State: **COMPLETE**. `IMPLEMENTATION_REVIEW__PUBLIC.md` written. Verdict READY (no BLOCKING,
no MAJOR; 4 MINOR + 1 follow-up ticket suggestion).

## What I actually ran (so a rehydrate does not redo it)

- `npm run lint` → 0 (1 pre-existing warning), `npm run build` → 0. Logs `.tmp/rev-lint.log`,
  `.tmp/rev-build.log`.
- `npm run test:e2e` → **38 passed** (`.tmp/rev-e2e.log`).
- **Independent non-vacuity proof** — the one thing worth not repeating blind: I did NOT edit
  source (role is read-only for src). Instead I patched the BUILD ARTIFACT
  `.dev-vault/.obsidian/plugins/foldable-embedded-notes/main.js`, replacing
  `this.mapMode=l.MapMode.TrackAfter` with `TrackDel`, then ran playwright DIRECTLY
  (`npx playwright test --config e2e/playwright.config.ts live-preview-foldable-embeds.e2e.ts`)
  to bypass `scripts/run-e2e.sh`'s `npm run setup:dev-vault`, which would have rebuilt over the
  patch. Needed `OBSIDIAN_PATH=$(bash scripts/setup-obsidian-bin.sh | tail -1)` and, with no
  display, `OBSIDIAN_E2E_EXTRA_ARGS="--ozone-platform=headless --disable-gpu"`.
  Result: 1 failed (exactly the new test) / 12 passed, `.tmp/rev-e2e-unfixed.log`.
  **Restored** with `npm run setup:dev-vault`; verified `grep -c TrackAfter` == 1 and
  `git status --porcelain` empty.

## Source facts I confirmed (line numbers in `node_modules/@codemirror/state/dist/index.js`)

- L3006 default `TrackDel`; L3078 `RangeSet.map` uses `val.mapMode` on the zero-length branch;
  L744-750 the `mapPos` drop condition. All as the implementer claimed.
- Emitted bundle shows the field as a constructor assignment after `super()` — no
  `useDefineForClassFields` hazard.

## Reasoning I did NOT put in PUBLIC (or compressed there)

- Pinned test's restore step (`replaceRange("", {line,ch:0}, {line,ch:1})`) is safe because after
  the `"x"` insert the anchor sits at `pos+1`, and the restoring deletion is `[pos, pos+1)` →
  `endA == pos+1`, not `> pos+1`. Traced by hand AND confirmed green.
- That same trace is what surfaced MINOR-1: an anchor sitting mid-line is now killed by deleting
  the character immediately after it. Real but marginal; deliberately did not ask for code.
- Considered and rejected asking for an explicit "was my line deleted?" filter inside
  `explicitFoldField.update` — more code, more state, marginal gain. 80/20.

## If asked to re-review after wording tweaks

Only comment/doc text is in question (MINOR-1/2/3). No re-run of e2e needed for those.
