# Foldable Embedded Notes

Make embedded notes (`![[ ]]`) foldable in reading mode.

Use the `![[ ]]-` syntax to fold an embedded note by default.

> Note: this repository currently contains a minimal, working plugin skeleton. The
> foldable-embedding feature described above is the plugin's intended purpose and is
> not implemented yet.

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
