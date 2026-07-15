# MarketsGrid SSRM Phase 4 — Worker `dirty` events

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** ssrmgrid worker emits `dirty` after mutating ops; `SSRMGrid` refreshes (and optionally applies surgical leaf txs). Hosts can observe via `onDirty`.

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (this plan only)

| # | Item | Status |
|---|------|--------|
| 1 | Worker emits `dirty` after `setRowData` / `updateRows` / `removeRows` / `applyTransaction` | **IN** |
| 2 | `SSRMGrid` wires `setDirtyHandler` → throttle/purge refresh (+ surgical `applyServerSideTransactionAsync` when leaf tx present) | **IN** |
| 3 | Optional `onDirty` prop on `SSRMGrid` for host observers | **IN** |
| 4 | Unit tests for dirty→grid apply helper | **IN** |
| 5 | Update Phase 4 parity doc (dirty → Done) | **IN** |
| 6 | Republish dirty txs into MarketsGrid `RowChangeBus` | **OUT** — host `applyDataTransactionAsync` already publishes; would double-fire alerts |
| 7 | Full-book unloaded-row correctness / route-aware group txs | **OUT** |
| 8 | Large-N perf campaign | **OUT** |

## Behaviour

- **Leaf `update`/`add` only:** `applyServerSideTransactionAsync` + throttled non-purge refresh (group stores stay coherent).
- **Replace / remove / no leaf payload:** purge refresh of all loaded stores.
- **Commit path:** UI refresh driven by `dirty` (not duplicated in RPC `.then`); totals still refreshed on dirty.

## Success criteria

1. Mutating worker ops post `{ type: "dirty", at, transaction? }`.
2. Lab Use SSRM + ticks still refresh; alerts still fire via existing host bridge (not via dirty).
3. Tests green for apply helper.
