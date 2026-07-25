import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

/** The plugin's folded-state class — must match `styles.css` (and `src/embedFoldDom.ts`). */
export const CLS_FOLDED = "fen-folded";
export const FOLDED_RE = new RegExp(`\\b${CLS_FOLDED}\\b`);

/**
 * Asserts the fold state an embed is DISPLAYING, shared by every fold spec.
 *
 * "Unfolded" is a claim about an embed the reader can SEE, so the `folded: false` branch says
 * both halves out loud instead of leaving presence implicit in a negated matcher.
 *
 * BE HONEST about what this does and does not fix. MEASURED against Playwright 1.61.1: a bare
 * `expect(missing).not.toHaveClass(re)` does NOT pass vacuously — it retries and fails with
 * "element(s) not found", so no assertion here was silently green on a vanished embed. What
 * the explicit `toBeAttached()` buys is a failure that NAMES the disappearance (instead of a
 * 15s "element(s) not found" timeout on a class assertion) and independence from a negated
 * matcher's empty-locator behaviour, which differs per matcher — `not.toBeVisible()`, the
 * neighbouring shape, DOES pass on an element that is gone.
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
