import { expect } from "@playwright/test";
import type { ElementHandle, Locator } from "@playwright/test";

/** A handle on a node that is live in the page right now. */
type LiveElement = ElementHandle<SVGElement | HTMLElement>;

/**
 * Proof that a note was REALLY re-rendered, for the tests whose whole subject is fold state
 * surviving one (see `ObsidianHarness.reopenThroughOtherFile`).
 *
 * Without it such a test can silently regress to an in-place shape — e.g. a view-MODE
 * round-trip on the still-open file — where the same elements never go away, the fold store
 * is never consulted, and the assertion that follows proves nothing. Asserted on DOM-node
 * IDENTITY rather than on a stamp, so nothing about the subject is mutated to measure it.
 */
export async function captureElement(locator: Locator): Promise<LiveElement> {
	const handle = await locator.elementHandle();
	if (handle === null) {
		throw new Error("e2e: locator resolved to no element — an identity comparison would be vacuous");
	}
	return handle;
}

/**
 * Asserts the locator now resolves to a DIFFERENT live DOM node than {@link captureElement}
 * returned earlier (`===` evaluated in the page). Call it BEFORE the assertion it guards, so a
 * regression fails here, with this message, instead of accidentally passing there.
 */
export async function expectFreshElement(previous: LiveElement, locator: Locator): Promise<void> {
	const current = await captureElement(locator);
	const sameNode = await locator.page().evaluate(([a, b]) => a === b, [previous, current]);
	expect(sameNode, "expected a re-render, but the locator resolved to the SAME DOM node").toBe(false);
}
