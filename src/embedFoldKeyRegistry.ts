import { EmbedFoldDom } from "./embedFoldDom";
import { EmbedFoldKeys } from "./embedFoldKeys";
import type { EmbedFoldKey } from "./embedFoldKeys";

/** How one embed span states its OWN identity, ignoring anything it is nested inside. */
export type DeriveEmbedFoldKey = () => EmbedFoldKey;

/** A registered embed's key, derived on first use. */
export interface PendingEmbedFoldKey {
	resolve(): EmbedFoldKey;
}

/** One registered embed span: how to derive its key, and the key once derived. */
interface KeySlot {
	readonly derive: DeriveEmbedFoldKey;
	key: EmbedFoldKey | null;
}

/**
 * Every embed span the reading-mode post-processor has seen this session, and the fold key it
 * is known by — the lookup that lets a NESTED embed inherit its HOST's identity
 * (ticket nid_zqaxj18jbxwnazzz8aeggz91u_e; see `EmbedFoldKeys` for why a nested embed has no
 * usable identity of its own).
 *
 * WHY registration is separate from derivation — this is the whole design:
 * - {@link register} runs SYNCHRONOUSLY inside the post-processor, for every embed span of the
 *   section being processed. That is what makes the host lookup ordering-free: Obsidian
 *   post-processes an embed BODY only after resolving the embed, which can only happen after
 *   the section holding the host span was itself post-processed. So by the time a nested
 *   embed exists at all, its host is registered — no dependency on the host having been WIRED
 *   (title loaded), which is a race between two independent MutationObservers.
 * - {@link PendingEmbedFoldKey.resolve} derives lazily, so `getSectionInfo` is still called
 *   right before it is needed, and memoises: one element has ONE key for as long as it lives,
 *   so a host and the embeds nested in it can never disagree about the prefix.
 *
 * A `WeakMap` keyed on the live span, like `WiredElements`: per plugin INSTANCE (a re-enabled
 * plugin re-derives everything) and never keeping detached DOM alive.
 */
export class EmbedFoldKeyRegistry {
	private readonly slots = new WeakMap<HTMLElement, KeySlot>();

	constructor(private readonly keys: EmbedFoldKeys) {}

	/**
	 * Remembers how to key this embed span, and hands back its (not yet derived) key.
	 * An already-registered span keeps its FIRST registration — see the memoisation note above.
	 */
	register(embed: HTMLElement, derive: DeriveEmbedFoldKey): PendingEmbedFoldKey {
		const existing = this.slots.get(embed);
		const slot = existing ?? { derive, key: null };
		if (existing === undefined) {
			this.slots.set(embed, slot);
		}
		return { resolve: () => this.resolve(embed, slot) };
	}

	private resolve(embed: HTMLElement, slot: KeySlot): EmbedFoldKey {
		if (slot.key !== null) {
			return slot.key;
		}
		const own = slot.derive();
		const host = this.hostKeyOf(embed);
		slot.key = host === null ? own : this.keys.nestedIn(host, own);
		return slot.key;
	}

	/**
	 * The key of the embed this one is rendered INSIDE, or null when it is top-level.
	 *
	 * The search starts at the parent so it cannot re-find `embed` itself, and recurses through
	 * every nesting level: an embed three deep is qualified by the whole chain above it.
	 */
	private hostKeyOf(embed: HTMLElement): EmbedFoldKey | null {
		const host = embed.parentElement?.closest<HTMLElement>(EmbedFoldDom.SEL_INTERNAL_EMBED) ?? null;
		if (host === null) {
			return null;
		}
		const slot = this.slots.get(host);
		if (slot === undefined) {
			return this.keys.unseenHostKey(host.getAttribute("src") ?? "");
		}
		return this.resolve(host, slot);
	}
}
