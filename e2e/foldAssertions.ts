import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

/** The plugin's folded-state class — must match `styles.css` (and `src/embedFoldDom.ts`). */
export const CLS_FOLDED = "fen-folded";
export const FOLDED_RE = new RegExp(`\\b${CLS_FOLDED}\\b`);

/**
 * Asserts the fold state an embed is DISPLAYING, shared by every fold spec.
 *
 * The `folded: false` branch asserting PRESENCE first is the whole reason this lives in one
 * place. Playwright resolves a NEGATED matcher the moment the locator matches NOTHING, so a
 * bare `not.toHaveClass` cannot tell "expanded" from "gone" — and "gone" is a real regression
 * shape here: drop the `preventDefault()`/`stopPropagation()` in the title-click handler and
 * the click falls through to Obsidian's own "open the embed", detaching the very element
 * under assertion. Every unfolded expectation would then pass on the broken plugin.
 */
export async function expectFolded(embed: Locator, folded: boolean): Promise<void> {
	if (folded) {
		// Positive matchers retry until the element exists, so presence is already covered.
		await expect(embed).toHaveClass(FOLDED_RE);
		return;
	}
	await expect(embed).toBeAttached();
	await expect(embed).not.toHaveClass(FOLDED_RE);
}
