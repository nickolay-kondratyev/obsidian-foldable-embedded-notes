# Follow-up tickets

File verbatim. Ordered by value.

## Cover (or correct) the title-click `preventDefault`/`stopPropagation`

`EmbedFoldDom.onTitleClick` suppresses two default behaviours and NOTHING asserts either.
Measured twice (implementer + reviewer): the full e2e suite stays green with both calls
deleted on Obsidian 1.12.7, so the code is currently defended only by its comment.
Approach: in READING mode, click a title and assert `app.workspace.getActiveFile().path` is
unchanged after the fold has visibly landed; in LIVE PREVIEW, click a title and assert the
CM6 cursor did not jump onto the embed's line. If neither can be made to fail with the calls
removed, the honest outcome is to delete the calls — but only on that evidence, never on a
green suite alone.

## `isFoldedNow` is a non-retrying read

`start-collapsed-setting.e2e.ts` reads `classList.contains` through a raw `evaluate` and
feeds the result to a retrying `expect` three lines later ("a title click is never dead after
the setting is flipped"). If the flip's re-render lands between the two, the test asserts the
wrong polarity and fails for a reason that has nothing to do with the bug it guards.
Approach: take the "before" reading behind a settled barrier (e.g. assert the pre-click state
with `expectFolded` first, then derive the expectation), or drive the whole thing off one
retried observation.

## Obsidian's post-boot stderr is silently dropped

The boot-time stderr listener is now correctly detached once CDP is up, which means an
Obsidian crash MID-SUITE produces no diagnostic at all — just a wall of assertion timeouts.
Approach: keep a bounded ring buffer of the last N KB of stderr for the process's whole life
and print it when a spec fails or the harness closes uncleanly. Turns a recurring "why did
everything time out" investigation into a one-line answer.

## e2e is not run in CI

`.github/workflows/lint.yml` runs build + lint only. Every guarantee produced by this ticket
is a LOCAL-only gate; a regression reaches `master` unchallenged. The harness already
downloads a pinned Obsidian and runs headless in Docker, so this is mostly workflow wiring
plus a cache. Worth an explicit decision even if the answer is "no" (runtime/flake budget).

## Symmetric cleanup on the harness launch-failure path

REJECTED this iteration as cosmetic, recorded so it is not lost. In
`ObsidianHarness.spawnAndConnect`'s `catch`, the CDP `browser` is not closed when
`connectOverCDP` succeeded but a later boot step threw; only the process is killed (which
drops the transport in practice). Doing it properly means hoisting a
`let browser: Browser | undefined` into the function scope — mutable state for no observable
behaviour, hence deferred. Revisit only if a failed launch is ever seen to hang.
