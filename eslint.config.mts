import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'**/main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		// Throwaway working dirs + generated dev vault (mirror .gitignore); they
		// hold build artifacts, not lint targets.
		'.tmp',
		'.dev-vault',
		// Scratch git worktrees (CLAUDE.md puts them here): a full second copy of the repo,
		// which eslint would otherwise lint — and fail on, since it sits outside tsconfig.
		'.worktree',
		// Exploration artifacts (throwaway prototypes kept for reference), not shipped source.
		'.ai_out',
		// Playwright/Node e2e harness: the obsidianmd plugin ruleset (mobile-safety,
		// no `node:` imports, `window.setTimeout` over `setTimeout`, no hardcoded
		// `.obsidian` path) targets shipped plugin source running INSIDE Obsidian —
		// none of it applies to Node-side test tooling that drives Obsidian from
		// outside and legitimately needs all three.
		'e2e',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
);
