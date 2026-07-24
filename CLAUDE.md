# Obsidian foldable embedded notes

Plugin that makes embedded notes (`![[ ]]`) foldable in reading mode, plus a `![[ ]]-` syntax to fold by default.

## Project overview

- Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` → compiled to `main.js`.
- Release artifacts (top level of the plugin folder): `main.js`, `manifest.json`, optional `styles.css`.

## Tooling & commands

- npm + esbuild (`esbuild.config.mjs`); `obsidian` type definitions.
- `npm install` — deps.
- `npm run dev` — watch build.
- `npm run build` — production build.
- `npm run lint` — ESLint with `eslint-plugin-obsidianmd` (also runs in CI on every commit).

## Conventions

- Keep `main.ts` minimal: lifecycle only (`onload`/`onunload`, `addCommand`). Delegate feature logic to modules under `src/`.
- Split files past ~200-300 lines; one responsibility per module.
- TypeScript `"strict": true`. Prefer `async/await`.
- Bundle everything into `main.js` (no unbundled runtime deps). Keep deps small and browser-compatible.
- Register everything needing cleanup via `this.register*` helpers (`registerEvent`, `registerDomEvent`, `registerInterval`) so unload/reload never leaks.
- Stable command IDs — never rename once released.
- Avoid Node/Electron APIs for mobile compatibility; set `isDesktopOnly` accordingly.
- Do not commit build artifacts (`node_modules/`, `main.js`).

## Manifest (`manifest.json`)

- Required: `id`, `name`, `version` (SemVer `x.y.z`), `minAppVersion`, `description`, `isDesktopOnly`. Optional: `author`, `authorUrl`, `fundingUrl`.
- `id` is stable API — never change after release; for local dev it matches the folder name.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical rules: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Versioning & release

- Bump `version` in `manifest.json` (SemVer); map version → min app version in `versions.json`.
- GitHub release tag must match `version` exactly (no leading `v`); attach `manifest.json`, `main.js`, and `styles.css` (if present) as individual assets.

## Security & privacy

Follow Obsidian's Developer Policies and Plugin Guidelines:

- Local/offline by default; no hidden telemetry; explicit opt-in + disclosure for any external service.
- Never execute or fetch-and-eval remote code, or auto-update outside normal releases.
- Read/write only what's needed inside the vault; never access files outside it or transmit vault contents without consent.

## Settings & UI copy

- Persist settings via `this.loadData()` / `this.saveData()`; provide defaults and a settings tab.
- UI text: sentence case; **bold** for literal labels; arrow notation for navigation (**Settings → Community plugins**).

## Testing

- Manual: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/<plugin-id>/`, reload Obsidian, enable in **Settings → Community plugins**.

## References

- Sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API docs: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
