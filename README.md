# Foldable Embedded Notes

Make embedded notes (`![[ ]]`) foldable in **reading mode and Live Preview**: each note
embed gets a clickable title bar with a rotating collapse chevron. Click the title to
fold/unfold.

Use the `![[ ]]-` syntax to fold an embedded note **by default**. In reading mode the
trailing `-` is a fold marker only when it comes immediately after `]]` and is followed by
whitespace or the end of the line, so `![[note]]-like` keeps its literal dash. The marker
itself is never rendered.

Fold state is remembered for the current session and resets when Obsidian restarts; once
you toggle an embed, your choice overrides the `-` default. Each mode keeps its own state
(see the limitations below): in reading mode it survives re-renders and reading↔editing
round-trips, in Live Preview it follows the embed as you edit the note around it.

> Limitations:
>
> - **The `-` marker in Live Preview applies only to whole-line embeds** — the line must be
>   nothing but `![[note]]-`. A mid-paragraph `text ![[note]]- text` keeps its literal dash
>   there and is not folded by default (reading mode still handles it). In the editor the
>   plugin only sees raw text, which cannot tell a real embed from one written inside a
>   code span; a whole-line match can't be inside one, so that is the rule it can apply
>   safely. Such embeds are still click-foldable.
> - **Fold state is per mode and per session.** Folding in Live Preview does not carry over
>   to reading mode or vice versa, and both reset when Obsidian restarts. In Live Preview it
>   is tracked per LINE, so two embeds written on the same line fold together.
> - Only note embeds are foldable — image/PDF/media embeds are untouched.
> - An embed nested inside another embed's body is foldable in both modes, but it is always
>   handled by the reading-mode path — in Live Preview its fold state is not tracked per
>   editor line, and folding it never folds the embed it sits in.
> - Plain **Source mode** is left completely alone: raw markdown, dash included.

## Development

This project uses TypeScript to provide type checking and documentation. It depends on
the latest plugin API (`obsidian.d.ts`) in TypeScript Definition format.

- Make sure your NodeJS is at least v18 (`node --version`).
- `npm install` to install dependencies.
- `npm run dev` to compile `src/main.ts` to `main.js` in watch mode.
- `npm run build` to produce a production build.
- Reload Obsidian to load the new version of the plugin.

## E2E testing

The e2e suite drives a **real Obsidian (Electron)** under Playwright: it boots a
throwaway copy of a seeded dev vault with the built plugin installed and asserts
the plugin actually loads. It runs headless in Docker/CI (auto-downloading a
pinned Obsidian) and on a real machine.

```bash
npm run test:e2e                              # run the whole suite
npm run test:e2e -- hello-world.e2e.ts        # run a single spec
OBSIDIAN_PATH='/Applications/Obsidian.app/Contents/MacOS/Obsidian' npm run test:e2e   # use an already-installed Obsidian
```

On Linux the runner auto-downloads and caches a pinned Obsidian build the first
time; you can also pre-provision it with `npm run setup:obsidian`. On a
display-less machine it automatically switches Obsidian to headless flags.

Environment variables:

- `OBSIDIAN_PATH` — path to an Obsidian binary. When set, it is used as-is (no
  download). Required on macOS/Windows (no auto-download there).
- `OBSIDIAN_E2E_EXTRA_ARGS` — extra space-separated Chromium/Electron flags. An
  explicit value always wins over the auto headless default.
- `OBSIDIAN_CACHE_DIR` — where the downloaded Obsidian is cached (default
  `~/.cache/obsidian-e2e`); share it across checkouts / mount it in Docker.

The e2e suite is intentionally NOT part of `npm test`; it is a release gate.

## Improve code quality with eslint

- [ESLint](https://eslint.org/) analyzes your code to quickly find problems.
- This project has eslint preconfigured, together with a custom eslint
  [plugin](https://github.com/obsidianmd/eslint-plugin) for Obsidian-specific guidelines.
- Run a check with `npm run lint`.
- A GitHub action is preconfigured to automatically lint every commit on all branches.

## Releasing new releases

- Update `manifest.json` with your new version number and the minimum Obsidian version
  required for the release.
- Update `versions.json` with `"new-plugin-version": "minimum-obsidian-version"` so older
  versions of Obsidian can download a compatible version of the plugin.
- Create a new GitHub release using your new version number as the "Tag version". Use the
  exact version number, without a leading `v`.
- Upload `manifest.json`, `main.js`, and `styles.css` (if present) as binary attachments.
  The `manifest.json` must be both at the root of the repository and in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version
> minor`, or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command bumps the version in `manifest.json` and `package.json`, and adds the entry
> for the new version to `versions.json`.

## Manually installing the plugin

- Copy `main.js`, `styles.css` (if present), and `manifest.json` to your vault at
  `VaultFolder/.obsidian/plugins/foldable-embedded-notes/`.

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## API Documentation

See https://docs.obsidian.md
