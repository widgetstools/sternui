# MarketsGrid SSRM Phase 4 — Full polish + OUT absorption

**Date:** 2026-07-15  
**Status:** Approved (Approach 2, step-by-step)  
**Repos:** starui + ssrmgrid  
**Parent:** [2026-07-14-marketsgrid-ssrm-dual-engine-design.md](./2026-07-14-marketsgrid-ssrm-dual-engine-design.md)

## Goal

Finish Phase 4 as **full OUT absorption (scope B)** using a **hybrid** engine strategy and **uncapped Perspective group-leaf fetch**, delivered in three slices so each is reviewable and shippable.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | **B** — absorb former OUT items + polish |
| Full-book alerts / `rowId` / exclusion | **Hybrid** — viewport-cheap day-to-day; whole-book via Perspective |
| Group leaves (`allLeafChildren`) | **Fetch everything** for that group from Perspective — **no cap** |
| Delivery | **Approach 2** — slices 4a → 4b → 4c |

## Non-goals

- Making SSRM the default engine.
- Changing CSRM behaviour when `useSSRM` / `rowModel: 'client'`.
- Auto-switching engines without user consent (suggest only).

## Slice 4a — Group leaf fetch (first)

**Problem (layman):** Under SSRM the browser only has on-screen rows. Expanding a group for link/publish via AG Grid `allLeafChildren` returns nothing useful. Traders expect “this whole group.”

**Solution:** When the selection includes a group node under SSRM, ask Perspective for **all leaf rows** matching that group path (plus the grid’s active filters), then build the same key-column criteria as CSRM.

**API sketch**

```ts
// ssrmgrid SSRMGridHandle
getGroupLeafRows(opts: {
  groupKeys: string[];
  /** Active filterModel / quick filter from the grid */
  filterModel?: Record<string, unknown>;
  quickFilterText?: string;
}): Promise<Record<string, unknown>[]>; // ALL matching leaves — no limit
```

Implementation: reuse `queryAll` / leaf-mode SSRM mapping with `groupKeys` equal to the full group path depth, **paging or unbounded** until Perspective returns no more rows (do not default-stop at 50k).

**Consumers**

- `buildSelectionContext` / `useGridContextLink` — async path under SSRM: resolve group leaves via handle, then emit criteria.
- Any other group “publish / act on leaves” entry points found during implement.

**CSRM:** unchanged (`allLeafChildren`).

## Slice 4b — Hybrid full-book alerts, `rowId` link, row-exclusion

**Day-to-day:** keep Phase 3 viewport / delta behaviour (cheap).

**Whole-book / explicit actions:**

| Feature | SSRM path |
|---------|-----------|
| Alerts that need full book | Perspective `countMatching` / `queryAll` over filter plans |
| Context link `mode: 'rowId'` | Publish ids from Perspective leaf fetch; receive via filterModel or Perspective id set filter (no CSRM `doesExternalFilterPass` over unloaded rows) |
| Row-exclusion DSL | Compile to Perspective filter (or materialize id set); remove “blocked under SSRM” gate when supported |

Document which alert rule shapes stay viewport-only vs full-book.

## Slice 4c — Polish + phase bump

- `rowModel?: 'client' | 'server'` alias for `useSSRM` (same switch).
- Optional “suggest SSRM” when row count ≥ threshold (banner / toast; user confirms).
- High-tick stress in Stress Test lab (live updates on under SSRM).
- Refresh Phase 4 feature matrix; set `CURRENT_SSRM_PHASE = 4`.

## Success criteria

1. Group link/publish under SSRM includes **all** leaves for selected groups (not only loaded nodes).  
2. CSRM group link behaviour unchanged.  
3. Hybrid full-book path exists for alerts / `rowId` / exclusion without forcing full-book work on every tick.  
4. `CURRENT_SSRM_PHASE === 4` with matrix updated.  
5. No silent no-ops — gates removed only when behaviour works.

## Delivery order

1. **4a** — plan + implement (this session starts here)  
2. **4b** — plan after 4a lands  
3. **4c** — plan after 4b lands  

## Spec self-review

- No TBD on locked decisions.  
- Uncapped fetch explicitly chosen (memory risk accepted).  
- Hybrid vs full-book day-to-day called out.  
- CSRM regression called out as non-goal.
