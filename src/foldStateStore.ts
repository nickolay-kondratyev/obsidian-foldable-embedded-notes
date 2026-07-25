/**
 * Session-scoped fold state for reading-mode embeds.
 *
 * In-memory only (per product decision): survives re-renders and mode switches
 * within one app session, resets on app restart — no persistence. The `![[x]]-`
 * syntax provides the DEFAULT on first render; once the user toggles an embed,
 * the recorded state here wins over the syntax default.
 */
export class FoldStateStore {
	private readonly foldedByKey = new Map<string, boolean>();

	/**
	 * The user-recorded fold state for this embed, or `undefined` when the user
	 * has not toggled it this session (caller then falls back to the syntax default).
	 */
	get(key: string): boolean | undefined {
		return this.foldedByKey.get(key);
	}

	set(key: string, folded: boolean): void {
		this.foldedByKey.set(key, folded);
	}

	/**
	 * Re-files a recorded fold from a weaker key onto the key that now identifies the same
	 * embed. No-op unless only `fromKey` has a recording.
	 *
	 * WHY it exists: an embed rendered before the vault index answered can only be keyed by
	 * POSITION (see `EmbedFoldKey` in `embedFoldKeys.ts`), so a fold made in that window lands under a key no
	 * later render will ask for. The first render that can derive the stable occurrence key
	 * claims it. The old entry is REMOVED, not copied: leaving it would let a different embed
	 * that later occupies that position inherit the fold.
	 */
	adoptRecordingOf(fromKey: string, toKey: string): void {
		if (this.foldedByKey.has(toKey)) {
			return;
		}
		const folded = this.foldedByKey.get(fromKey);
		if (folded === undefined) {
			return;
		}
		this.foldedByKey.delete(fromKey);
		this.foldedByKey.set(toKey, folded);
	}
}
