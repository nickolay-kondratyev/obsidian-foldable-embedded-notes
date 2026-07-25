# EXPLORATION — PUBLIC (index)

Ticket `nid_ocmytlb996sexgks0wagew41s_e`: "e2e: assertions that can pass vacuously, plus harness
robustness gaps" (priority 1, bug). Branch `settings-persistence-fix`.

Two exploration passes ran. Read both:

- [`EXPLORATION_HARNESS__PUBLIC.md`](./EXPLORATION_HARNESS__PUBLIC.md) — the e2e layer as it is:
  process lifecycle, `expectFolded` + every call site, the round-trip test's mechanics, fixtures,
  seriality conventions, and the traps.
- [`EXPLORATION_RUNTIME__PUBLIC.md`](./EXPLORATION_RUNTIME__PUBLIC.md) — the suite DOES run here
  (cached Obsidian 1.12.7, headless Ozone, no X needed), the exact commands, and a minimal
  one-line sabotage per guarded behaviour for proving each assertion non-vacuous.

## Drift between the ticket and the tree — READ THIS FIRST

The ticket was authored before the settings-persistence commits landed, so its line numbers are
stale. Confirm each defect against the current tree before editing. Status as explored:

| # | Defect | Still present? |
|---|--------|----------------|
| 1 | Round-trip test does not re-render (mode switch in place, same element) | YES, unchanged |
| 2 | `expectFolded(x, false)` is a bare negated matcher → green on a DETACHED element | YES, unchanged |
| 3 | `readPersistedPluginData` throws under `expect.poll` | **PARTIALLY** mitigated — a 5×50ms parse-retry now exists, but it RETHROWS on the last attempt, which `expect.poll` still cannot absorb. Fix is smaller than the ticket implies. |
| 4 | stdout never drained; stderr listener leaks; bare `kill()` on launch failure | YES, all three |

## Constraints the fixes must respect

- `workers: 1`, `fullyParallel: false`, serial within each file, one Obsidian per spec FILE.
- The negated-matcher fix must not weaken the strict `toEqual` contract in
  `settings-persistence.e2e.ts` (that suite proves no `data.json` key is dropped).
- Defect 1's fix needs a genuine file round-trip; `.dev-vault/sibling.md` already exists and is a
  natural "other file". `openFile` reuses the active leaf and tracks no history — navigate both ways
  explicitly.
- Acceptance requires proving each fixed assertion FAILS under a deliberate break, then reverting.
  `git status` must be clean at the end.
