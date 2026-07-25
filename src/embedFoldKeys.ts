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

/**
 * How one embed is identified this render, and what it may have been identified by before.
 *
 * Two fields because the identity is only as good as the metadata cache behind it: until the
 * vault index answers, an embed can only be keyed by POSITION, and the fold the user made in
 * that window is recorded under that weaker key. {@link supersededKeys} is how the first
 * render that CAN derive the occurrence key reclaims it.
 */
export interface EmbedFoldKey {
	/** The key this embed is recorded under from now on. */
	readonly current: string;
	/**
	 * Every key an EARLIER, COLDER render of this same embed could have recorded a fold under,
	 * excluding {@link current} — empty when this render is itself the coldest possible one.
	 *
	 * A LIST, not one key, because a NESTED embed has two independently cache-dependent halves
	 * (its host's key and its own, see {@link EmbedFoldKeys.nestedIn}) and MEASURED on Obsidian
	 * 1.12.7 they warm up SEPARATELY — a render can have a cold host and a warm own key. Only
	 * one of the combinations can hold a recording, so the caller simply tries them all.
	 */
	readonly supersededKeys: readonly string[];
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
 * A COLD cache (MEASURED on Obsidian 1.12.7: for the first render(s) after launch the vault
 * index is not built yet and `getCache` answers nothing) therefore cannot produce this key at
 * all, and those embeds fall back to the positional key below. So that a fold made in that
 * window is not simply LOST — it would be, and the line key this replaces kept it — every
 * occurrence key also reports the positional key it supersedes
 * ({@link EmbedFoldKey.supersededKeys}), and the first render that can derive an occurrence
 * key takes that recording over.
 *
 * WHAT IT STILL DOES NOT SURVIVE, honestly:
 * - Deleting an embed makes the next embed of the SAME link inherit its ordinal, and its fold
 *   (ticket nid_z4jq8me8mhstojozeua8fufdr_e). The line key had the same FLAW but not the same
 *   frequency: it handed the fold over only when the survivor happened to land on the deleted
 *   embed's line, whereas an ordinal is inherited after a deletion ANYWHERE in the note.
 *   Fixing it needs per-file invalidation, which the `sourcePath::` prefix leaves room for.
 * - An edit made DURING the cold window, before the takeover above has run: the positional key
 *   then denotes whatever embed now sits on that line, so the fold can land on the wrong one —
 *   exactly what the line key did unconditionally, now confined to app start.
 * - A STALE cache (it re-parses asynchronously after an edit) can make the line window select
 *   the wrong entry — misattributing exactly as the line key did — or none, which degrades to
 *   the fallback. NOT observed for edit-then-reopen: the e2e's reopen-through-another-file
 *   re-render keys both embeds by occurrence and both folds land on the right embed.
 * NESTED embeds (an embed inside an embed BODY) get none of the above on their own: their
 * occurrence is stated in the CHILD note, so every occurrence of the same host renders the
 * identical `sourcePath`, `src`, section text and index — one shared key, and folding one
 * folded them all (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e). That holds whichever derivation
 * the own key takes: MEASURED on 1.12.7, `ctx.getSectionInfo` answers null for some embed
 * bodies (`S<hash>` fallback) and a real section for others (occurrence key) — identical
 * across the host's occurrences either way. What tells them apart is the HOST they are
 * rendered inside, so a nested embed's key is its own key QUALIFIED by its host's — see
 * {@link nestedIn} and `EmbedFoldKeyRegistry`.
 *
 * Key SHAPE: `sourcePath::<locator>::…`, an opaque string whose `sourcePath` prefix is
 * parseable (per-file invalidation later) and whose locator field says which derivation
 * produced it, so occurrence keys and fallback keys can never collide. A nested key is
 * `<hostKey>::in::<ownKey>`, so its parseable prefix is the HOST's — per-file invalidation of
 * a note would sweep the embeds nested inside its embeds too, which is what one wants.
 */
export class EmbedFoldKeys {
	/** Locator field of an occurrence-derived key. */
	private static readonly OCCURRENCE_LOCATOR = "occ";
	/** Locator prefix of a fallback key placed by SOURCE LINE. */
	private static readonly LINE_LOCATOR = "L";
	/** Locator prefix of a fallback key placed by hashed section text (no line known). */
	private static readonly SECTION_HASH_LOCATOR = "S";
	/** Field joining a host embed's key to the key of an embed nested INSIDE it. */
	private static readonly NESTING_SEPARATOR = "in";
	/** Locator of a host embed whose own key was never derived — see {@link unseenHostKey}. */
	private static readonly UNSEEN_HOST_LOCATOR = "host";

	constructor(private readonly readEmbeds: ReadEmbeds) {}

	keyFor(occurrence: EmbedOccurrence): EmbedFoldKey {
		const cached = this.cachedOccurrenceOf(occurrence);
		if (cached === null) {
			return { current: this.positionalFallbackKey(occurrence), supersededKeys: [] };
		}
		const current = [
			occurrence.sourcePath,
			EmbedFoldKeys.OCCURRENCE_LOCATOR,
			cached.link,
			`#${cached.ordinal}`,
		].join("::");
		return { current, supersededKeys: [this.positionalFallbackKey(occurrence)] };
	}

	/**
	 * `own`, qualified by the key of the HOST embed it is rendered inside — the identity a
	 * nested embed has no way to state itself (see the note on nesting above).
	 *
	 * The superseded keys are every COMBINATION of the two levels' weaker keys, because the two
	 * halves warm up independently (MEASURED on Obsidian 1.12.7: a render whose host note is
	 * not yet indexed can still key the nested embed's own half by occurrence, since that half
	 * is read from the CHILD note's cache). So the colder render whose recording is to be
	 * reclaimed may have used a weak host with a strong own key, or the reverse, or both weak —
	 * one superseded key would silently cover only one of those, and MEASURABLY did not cover
	 * the one that happens in practice.
	 */
	nestedIn(host: EmbedFoldKey, own: EmbedFoldKey): EmbedFoldKey {
		const current = this.qualify(host.current, own.current);
		const hostKeys = [host.current, ...host.supersededKeys];
		const ownKeys = [own.current, ...own.supersededKeys];
		const combinations = hostKeys.flatMap((hostKey) =>
			ownKeys.map((ownKey) => this.qualify(hostKey, ownKey)),
		);
		return { current, supersededKeys: combinations.filter((key) => key !== current) };
	}

	/**
	 * The key standing in for a host embed whose own key was never derived, identifying it by
	 * its link alone.
	 *
	 * Reached only for a host that the reading-mode post-processor never saw — in practice a
	 * TOP-LEVEL Live Preview embed, whose span CM6 builds while only its BODY goes through the
	 * post-processor.
	 *
	 * KNOWN LIMITATION, MEASURED on Obsidian 1.12.7: this key identifies a host by its LINK
	 * alone, which is identical for every occurrence of it anywhere — and a nested embed's own
	 * key is identical too (same child note, same section text, same index). So in Live Preview
	 * nested embeds STILL share one fold state ENTIRELY: between two embeds of the same host
	 * note AND between different host notes embedding it. That is unchanged, pre-existing
	 * behaviour, not something this key made worse. Fixing it needs a stable identity for a CM6
	 * widget span, which is Live Preview's business — ticket nid_jdpdpu7w0nfda3y4decz7f6xy_e.
	 */
	unseenHostKey(hostSrc: string): EmbedFoldKey {
		return { current: `${EmbedFoldKeys.UNSEEN_HOST_LOCATOR}::${hostSrc}`, supersededKeys: [] };
	}

	private qualify(hostKey: string, ownKey: string): string {
		return [hostKey, EmbedFoldKeys.NESTING_SEPARATOR, ownKey].join("::");
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
	 * Pre-occurrence key: where an embed is recorded when the metadata cache cannot answer,
	 * and — for an embed that HAS an occurrence key — where an earlier cold-cache render of
	 * the very same embed would have recorded it. It is a pure function of what this render
	 * sees, so those two uses agree exactly as long as nothing was edited in between.
	 *
	 * It is honestly WEAK and only ever better than nothing: `L<line>` is reassigned by any
	 * edit above (the very bug above), and `S<hash>` hashes the section's RENDERED text —
	 * which for a note embed contains the embedded child's whole body, so editing the CHILD
	 * silently drops the fold, and two identical sections collide.
	 */
	private positionalFallbackKey(occurrence: EmbedOccurrence): string {
		const lineStart = occurrence.section?.lineStart;
		const locator =
			lineStart !== undefined
				? `${EmbedFoldKeys.LINE_LOCATOR}${lineStart}`
				: `${EmbedFoldKeys.SECTION_HASH_LOCATOR}${this.hash(occurrence.renderedSectionText)}`;
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
