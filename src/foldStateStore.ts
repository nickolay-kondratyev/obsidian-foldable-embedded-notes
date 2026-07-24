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
}
