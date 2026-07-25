# Implementation review: fold marker must sit at a real end of line (`39501ab`)

Verdict: **sound, approve with 2 SHOULD-FIX items. No BLOCKING findings.**

## Summary

`stripFoldMarker` treated `afterMarker === ""` as end-of-line, which is only end-of-TEXT-NODE.
The commit keeps the whitespace branch and gates the empty branch on a new
`isEndOfLine(sibling)` (`nextSibling === null || nextSibling instanceof HTMLBRElement`),
adds two reading-mode e2e cases and updates the `stripFoldMarker` doc comment + CLAUDE.md.
The restructured condition is equivalent for every previously-armed case except the exact
bug case (the two branches are disjoint on `afterMarker`), so no regression is possible by
construction — and that is confirmed by measurement below.

The fix also moves reading mode CLOSER to Live Preview, whose
`WHOLE_LINE_MARKED_EMBED = /^!\[\[[^\]\n]+\]\]-[ \t]*$/` (`src/livePreview/markedEmbedLines.ts:24`)
already refuses `![[x]]-**bold**`.

## Verification I actually ran (this review, not reported claims)

| Command | Result |
|---|---|
| `npm run lint` | **EXIT=0** — 0 errors, **2 warnings** (one is NEW, see SF-1) |
| `npm run build` | **EXIT=0** |
| `npm run test:e2e` (FULL suite) | **EXIT=0** — **45 passed** (`.tmp/rev-e2e-full.log`) |
| Failing-before proof | scratch worktree at `39501ab` with ONLY the `stripFoldMarker` line reverted → `npm run test:e2e -- e2e/foldable-embeds.e2e.ts` **EXIT=1**, `1 failed, 6 passed`; failure is the new bold test with `Received string: "... fen-embed fen-folded"` (`.tmp/rev-e2e-noFix.log`). Worktree removed. |

The implementer's evidence section is **honest** — every number reproduced.

## Edge cases probed against REAL Obsidian (throwaway spec in the scratch worktree)

`![[child]]-` in each context, reading mode; `folded` is the outcome after the fix:

| Case | parent | next sibling | folded | assessment |
|---|---|---|---|---|
| list item `- ![[child]]-` | `LI` | text `""`, then NONE | ✅ true | no regression |
| blockquote `> ![[child]]-` | `P` | NONE | ✅ true | no regression |
| callout `> [!note]` body | `P` | NONE | ✅ true | no regression |
| table cell | `TD` | NONE | ✅ true | no regression |
| soft line break `![[child]]-\nnext` | `P` | text, then **`BR`** | ✅ true | the `HTMLBRElement` branch is genuinely exercised in real usage |
| hard break (2 trailing spaces) | `P` | text, then `BR` | ✅ true | no regression |
| last line of the note | `P` | NONE | ✅ true | no regression |
| trailing spaces `![[child]]-   ` | `P` | text `"   "` | ✅ true | whitespace branch intact |
| `` ![[child]]-`code` `` | `P` | text `"-"`, then `CODE` | ✅ **false** | second bug from the ticket, also fixed |
| `**![[child]]-** tail` | `STRONG` | NONE | ⚠️ true | remaining hole, PRE-EXISTING (see N-1) |

So: paragraph/list/blockquote/callout/table/`<br>`/last-line are all **verified safe**, not
theoretical. The only structurally wrong answer left is the embed wrapped in inline markup.

## 🚨 CRITICAL Issues

None. No security surface, no resource/lifecycle change, no removed tests or anchor points
(diff is additive on `e2e/`, one line changed in `src/`).

## ⚠️ SHOULD-FIX

**SF-1 — the change introduces a NEW lint warning, and it is a real cross-window hazard.**
`src/foldableEmbedsPostProcessor.ts:170` — `next instanceof HTMLBRElement` trips the repo's own
rule: `obsidianmd/prefer-instanceof` — *"Use '.instanceOf(HTMLBRElement)' … for cross-window safe
type checking"*. `npm run lint` still exits 0 (warnings only), which is why the report said
"lint EXIT=0"; that is true but incomplete — please state new warnings.

Measured in a real popout window (`app.workspace.moveLeafToPopout`, Obsidian pinned build):
- `popoutDoc.createElement("br") instanceof HTMLBRElement` → **false**, and
  `popoutWindow.HTMLBRElement === HTMLBRElement` → **false**. The hazard is real.
- BUT for a note freshly rendered INSIDE the popout (verified: unique marker text present,
  `embed.ownerDocument === popoutDoc`), the rendered `<br>` **is** `instanceof HTMLBRElement`
  in the plugin's realm → the marker still armed and the dash was stripped.

So today it works, by an implementation detail of how Obsidian builds popout DOM. Fix is one
token and removes both the warning and the latent breakage:
`return next === null || next.instanceOf(HTMLBRElement);` (obsidian's `Node.instanceOf`,
`obsidian.d.ts:62`).

**SF-2 — the new `<br>` branch has ZERO test coverage.**
Delete `|| next instanceof HTMLBRElement` and the full 45-test suite stays green: no fixture
puts anything after the marker line inside the same paragraph. That is exactly the branch most
likely to be "simplified" away later. Cheap fix: one more fixture line
`![[child]]-\nnext line`, asserting folded + `nextSiblingText === ""` + a following `<br>`
(measured shape above). This is the same "pin the DOM shape" discipline the bold test already
applies — it just was not extended to the positive side of the new rule.

## 💡 Suggestions / NIT

**N-1 — doc overclaims for the wrapped case.** `isEndOfLine`'s comment says "last inline node of
its **block**", and CLAUDE.md says "`<br>` or **block end**". It is really "last among its
siblings": `**![[child]]-** tail` (embed inside `<strong>`) still arms the marker and eats the
dash. This is PRE-EXISTING (the old code did the same) and rare, so 80/20 says do not chase it —
but the wording should not claim more than the code does. Either say "nothing follows it in its
parent element" plus a KNOWN-LIMITATION line, or file a follow-up ticket.

**N-2 — implicit test coupling.** ``test("`![[child]]- tail` still folds…")`` relies on the
previous test having opened `marker-inline-markup.md`. The suite is `serial` so it works, but the
adjacent tests all open their own file; an explicit `openFile` (or a one-line "continues in the
same note" comment) keeps the failure mode readable.

**N-3 — cross-mode divergence now pinned.** Reading mode folds `![[x]]- tail`; Live Preview does
not (whole-line regex). Pre-existing, but the new `- tail` test makes it a pinned contract.
Worth a follow-up ticket to decide which mode is right rather than letting it calcify.

## Acceptance criteria

- AC1 `![[x]]-**bold**` literal + unfolded — **met**, proven failing-before/passing-after.
- AC2 `![[x]]-` alone / followed by whitespace still folds with the dash stripped — **met**
  (pre-existing tests + the new `- tail` test + my list/quote/callout/table/`<br>`/last-line probe).
- AC3 e2e alongside the existing negative case; lint, build, full e2e green — **met**
  (lint green with the new warning noted in SF-1).

## Documentation Updates Needed

Only N-1's wording. CLAUDE.md's reading-mode bullet is otherwise accurate and appropriately
succinct; no other doc drift found.
