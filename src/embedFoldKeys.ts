import type { EmbedCache, MarkdownSectionInformation } from "obsidian";

/**
 * Narrow port over `app.metadataCache`: every embed of one note, in DOCUMENT ORDER.
 * Narrow on purpose (like `SettingsPersistence` / `ReadSettings`) — the key logic must not
 * need an `App`, so it stays trivially testable.
 */
export type ReadEmbeds = (sourcePath: string) => readonly EmbedCache[];

/** Everything one wired embed occurrence is identified by, gathered at wiring time. */
export interface EmbedOccurrence {
	/** The note the embed is WRITTEN IN — for an embed body, that is the CHILD note. */
	readonly sourcePath: string;
	/** Raw-source line range of the rendered section; null when Obsidian cannot map it. */
	readonly section: MarkdownSectionInformation | null;
	/** 0-based ordinal of this embed span within its rendered section (media embeds counted). */
	readonly indexWithinSection: number;
	/** The embed span's `src` attribute — the link target as written. Fallback key only. */
	readonly src: string;
	/** RENDERED text of the section; hashed by the no-section-info fallback only. */
	readonly renderedSectionText: string;
}

/** One embed as the metadata cache sees it, reduced to what the key needs. */
interface CachedOccurrence {
	/** `EmbedCache.link`: the link target as parsed (`a`, `a#heading`, `a#^block`). */
	readonly link: string;
	/** How many embeds of the SAME link precede this one in the note. */
	readonly ordinal: number;
}

/**
 * Session identity of one reading-mode embed occurrence, for {@link FoldStateStore}.
 *
 * Reading mode has no equivalent of Live Preview's `RangeSet` (whose fold anchors are
 * document positions that MAP through every change), so identity has to be re-derived from
 * scratch on every render. The line the embed sits on is NOT that identity: any edit above it
 * renumbers the line, which loses the fold — or hands it to whichever embed moved onto the old
 * line (ticket nid_7qbtubxk89team9oadnl3hanr_e, MEASURED on Obsidian 1.12.7).
 *
 * So the identity is the OCCURRENCE: "the Nth `![[x]]` in this note", read from the metadata
 * cache, whose ordering survives insertions and deletions above (and elsewhere — an unrelated
 * embed added above shifts no ordinal, since only same-link embeds are counted).
 *
 * The cache entry is located by POSITION (the section's line window, then the ordinal within
 * it), never by joining the DOM `src` against `EmbedCache.link` — those two strings are not
 * measured to agree for aliased/subpath links, and the join is not needed.
 *
 * WHAT IT STILL DOES NOT SURVIVE, honestly:
 * - Deleting an embed makes the next embed of the SAME link inherit its ordinal, and its fold
 *   (ticket nid_z4jq8me8mhstojozeua8fufdr_e; the line key had the same flaw). Fixing that needs
 *   per-file invalidation, which the `sourcePath::` prefix leaves room for.
 * - A COLD cache. MEASURED on Obsidian 1.12.7: for the first render(s) after launch the vault
 *   index is not built yet and `getCache` answers nothing, so those embeds get the fallback key
 *   below — and a fold made in that window is dropped by the next render, which keys the same
 *   embed by occurrence. Narrow (app start only) and strictly less lossy than the line key it
 *   replaces, so it is documented rather than papered over with a wait.
 * - A STALE cache (it re-parses asynchronously after an edit) can make the line window select
 *   the wrong entry — misattributing exactly as the line key did — or none, which degrades to
 *   the fallback. NOT observed for edit-then-reopen: the e2e's reopen-through-another-file
 *   re-render keys both embeds by occurrence and both folds land on the right embed.
 * - Nested embeds still share ONE key per host (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e): the
 *   occurrence is computed in the CHILD note's coordinates, identically for every host.
 *
 * Key SHAPE: `sourcePath::<locator>::…`, an opaque string whose `sourcePath` prefix is
 * parseable (per-file invalidation later) and whose locator field says which derivation
 * produced it, so occurrence keys and fallback keys can never collide.
 */
export class EmbedFoldKeys {
	/** Locator field marking an occurrence-derived key; the fallbacks use `L…`/`S…`. */
	private static readonly OCCURRENCE_LOCATOR = "occ";

	constructor(private readonly readEmbeds: ReadEmbeds) {}

	keyFor(occurrence: EmbedOccurrence): string {
		const cached = this.cachedOccurrenceOf(occurrence);
		if (cached === null) {
			return this.positionalFallbackKey(occurrence);
		}
		return [
			occurrence.sourcePath,
			EmbedFoldKeys.OCCURRENCE_LOCATOR,
			cached.link,
			`#${cached.ordinal}`,
		].join("::");
	}

	/**
	 * The metadata-cache entry this embed span renders, and its ordinal among same-link
	 * embeds of the note. Null when the cache cannot be aligned with what was rendered —
	 * no section info, no cache yet, a stale cache, or an embed that renders a span without
	 * a cache entry (or vice versa).
	 */
	private cachedOccurrenceOf(occurrence: EmbedOccurrence): CachedOccurrence | null {
		const section = occurrence.section;
		if (section === null) {
			return null;
		}
		return this.scanForOccurrence(
			this.readEmbeds(occurrence.sourcePath),
			section,
			occurrence.indexWithinSection,
		);
	}

	/**
	 * One document-order pass: finds the `indexWithinSection`-th embed inside this section's
	 * line window and reports how many embeds of its link came before it.
	 *
	 * Both sequences (cache entries and rendered spans) are in document order and both include
	 * media embeds, so their ordinals line up; anything that breaks that — an embed rendering
	 * no span, a stale cache whose positions predate the current section lines — finds no
	 * entry rather than the wrong one.
	 */
	private scanForOccurrence(
		embeds: readonly EmbedCache[],
		section: MarkdownSectionInformation,
		indexWithinSection: number,
	): CachedOccurrence | null {
		const seenByLink = new Map<string, number>();
		let seenInSection = 0;
		for (const embed of embeds) {
			const link = embed.link;
			const ordinal = seenByLink.get(link) ?? 0;
			const line = embed.position.start.line;
			if (line >= section.lineStart && line <= section.lineEnd) {
				if (seenInSection === indexWithinSection) {
					return { link, ordinal };
				}
				seenInSection++;
			}
			seenByLink.set(link, ordinal + 1);
		}
		return null;
	}

	/**
	 * Pre-occurrence key, kept for the cases the metadata cache cannot answer.
	 *
	 * It is honestly WEAK and only ever better than nothing: `L<line>` is reassigned by any
	 * edit above (the very bug above), and `S<hash>` hashes the section's RENDERED text —
	 * which for a note embed contains the embedded child's whole body, so editing the CHILD
	 * silently drops the fold, and two identical sections collide.
	 */
	private positionalFallbackKey(occurrence: EmbedOccurrence): string {
		const lineStart = occurrence.section?.lineStart;
		const locator =
			lineStart !== undefined ? `L${lineStart}` : `S${this.hash(occurrence.renderedSectionText)}`;
		return `${occurrence.sourcePath}::${locator}::${occurrence.src}::#${occurrence.indexWithinSection}`;
	}

	/** djb2 — a cheap, stable discriminator, not a security hash. */
	private hash(text: string): number {
		let hash = 5381;
		for (let i = 0; i < text.length; i++) {
			hash = (hash * 33) ^ text.charCodeAt(i);
		}
		return hash >>> 0;
	}
}
