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
		// Playwright/Node e2e harness: the obsidianmd plugin ruleset (mobile-safety,
		// no `node:` imports, no `window.app as any` bridge) targets shipped plugin
		// source, not Node-side test tooling that legitimately needs all three.
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
