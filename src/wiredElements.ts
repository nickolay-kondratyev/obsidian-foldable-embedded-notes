/**
 * The elements ONE plugin instance has already wired for clicks.
 *
 * Deliberately NOT inferred from the DOM ("it carries our class", "it has a chevron"): a
 * re-enabled plugin meets DOM its predecessor marked, whose listeners died with that
 * predecessor — a DOM-derived guard would make the new instance bail and the embed would
 * stay dead for the rest of the session. Membership is per-instance, so a fresh instance
 * starts with everything unwired.
 *
 * Weak by construction: an entry never keeps a detached element alive.
 */
export class WiredElements {
	private readonly wired = new WeakSet<HTMLElement>();

	has(element: HTMLElement): boolean {
		return this.wired.has(element);
	}

	add(element: HTMLElement): void {
		this.wired.add(element);
	}

	/** Forgets one element, so a later render of the SAME (reused) element wires it again. */
	remove(element: HTMLElement): void {
		this.wired.delete(element);
	}
}
