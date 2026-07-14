# MarketsGrid dual engine (CSRM + SSRM) — Design

**Date:** 2026-07-14  
**Status:** Draft for review  
**Repos:** starui (`MarketsGrid`) + ssrmgrid (`SSRMGrid`)  
**AG Grid:** 36.x

## Goal

Keep **both** row models on MarketsGrid:

- **CSRM (default)** — current behaviour; best for typical books and full client tooling.
- **SSRM (`useSSRM`)** — large datasets via `SSRMGrid` (AG Grid 36 Server-Side Row Model + Perspective worker).

Users pick the engine for scale; tooling (formatters, Excel formats, column groups, settings, profiles) stays one product surface. SSRM path targets **full feature parity** over time; ship in phases with an explicit capability matrix (no silent breakage).

## Non-goals (v1)

- Deleting the CSRM path.
- Making SSRM the default.
- Rewriting OpenFin hosting / provider hub from scratch (reuse Container wiring with an engine adapter).
- Claiming CSRM and SSRM are identical without an adapter for node-walking runtimes.

## Public API

```tsx
<MarketsGrid
  useSSRM={false}   // default — CSRM (today)
  useSSRM={true}    // large datasets — SSRMGrid + Perspective
  rowData={rows}
  columnDefs={defs}
  gridId="…"
  …
/>
```

Optional later alias (same switch): `rowModel?: 'client' | 'server'`.

`MarketsGridHandle` / Container APIs remain stable. When `useSSRM` is true, escape hatches that assume CSRM (`api.forEachNode` over the full book) are documented as viewport/server-scoped; prefer engine-neutral helpers on the handle where needed.

## Architecture

```text
MarketsGrid
├── GridPlatform (shared)
│   ├── Settings / profiles / module UI
│   ├── ColDef transforms (formatters, Excel formats, styles, groups)
│   └── Capability matrix (which modules enabled per engine)
├── CsrnEngine (existing)
│   ├── <AgGridReact rowModelType=clientSide>
│   ├── rowData + applyTransactionAsync
│   └── RowChangeBus (asyncTransactionsFlushed) + forEachNode runtimes
└── SsrmEngine (new)
    ├── <SSRMGrid> (ssrmgrid package)
    ├── snapshot → setRowData; ticks → SSRMGrid.applyTransactionAsync
    └── SSRM-adapted runtimes (viewport + Perspective queryAll / stamps)
```

### Dependency

- starui depends on **ssrmgrid** (workspace / published package).
- ssrmgrid remains the AG Grid 36 SSRM + Perspective façade; MarketsGrid does not re-implement SSRM.

### Shared vs split

| Layer | Shared? | Notes |
|-------|---------|--------|
| SettingsSheet, FormatterPicker, Excel format templates, column groups UI, profiles | Yes | Presentation / config only |
| ColDef `valueFormatter` / `cellStyle` / renderers | Yes | Pass through to both engines |
| Data ingest (hub snapshot + ticks) | Adapter | CSRM → GridApi transactions; SSRM → SSRMGrid handle |
| Calculated columns (per-row expr) | Adapt | CSRM `valueGetter` → SSRM `perspectiveExpression` (transpile or materialize) |
| Calculated columns (`SUM([x])` etc.) | Adapt | Perspective aggregates / `__ssrm_aggs` + helpers |
| Custom JS `aggFunc` | Gate → redesign | Named Perspective aggs only on SSRM until equivalent exists |
| Conditional styling (static) | Yes | `cellClassRules` on loaded cells |
| Conditional styling (`.old` / `.new`) | Adapt | See § Old vs new below |
| Alerts / filter counts / header painters | Adapt | Viewport + dirty deltas; no full-book `forEachNode` |
| Editing / smart-edit | Adapt | Patches via SSRMGrid transactions |
| Export / charts | Adapt | Use SSRMGrid export-all / chartFilteredData |
| External filter (context link) | Adapt | Encode as filterModel / quick filter |

## Data flow (SSRM)

1. Container/provider snapshot → `SSRMGrid` `rowData` (or imperative `setRowData` via configure path).
2. Live ticks → `gridRef.applyTransactionAsync({ update })` (Perspective upsert + throttled SSRM refresh).
3. Filters / group / pivot / sort → AG Grid SSRM request → Perspective query engine.
4. Totals / % of book → worker aggregates stamped on context / `__ssrm_aggs`.

CSRM path unchanged.

## Excel formatting

Supported on SSRM without special cases:

- Excel-style format strings → AG `valueFormatter` / cell colour helpers (client presentation).
- Visual Excel style registry → export options.
- Full filtered Excel export → SSRMGrid `queryAll` + temporary CSRM export grid (already in ssrmgrid).

## Old vs new in conditional styling (`[price.old] < [price.new]`)

### How CSRM MarketsGrid does it today

Not a server feature. `timedActivations` / conditional-styling runtime keeps a **previous-value snapshot per row id** (and uses `cellValueChanged` `oldValue`/`newValue`). The expression engine resolves `[field.old]` / `[field.new]` from that **diff context** (`evalOps` `oldValue` / `newValue`). See:

- `packages/react-grid/grid/src/customizer/modules/conditional-styling/runtime/timedActivations.ts`
- `packages/shared/engine/src/expression/evalOps.ts`

### Can SSRM do this?

**Yes — for rows the client can observe**, with the same pattern:

1. On tick/update for a row id, record previous field values before applying the new payload (from last known viewport row or a `previousValues` map keyed by `getRowId`).
2. When evaluating conditional rules for that row (viewport refresh / flash), inject the same diff context into the expression engine.
3. Evict previous values when rows leave the cache / are purged.

**Limits (same product honesty as SSRM generally):**

- Rules only evaluate for **loaded / recently updated** rows, not the entire unloaded book.
- A full SSRM `purge` refresh without a prior snapshot may leave `.old` empty until the next tick.
- Do **not** require Perspective to store `.old` columns for v1 (optional later optimization).

**SSRM v1 requirement:** port the previous-values store to `SsrmEngine` so expressions like `[price.old] < [price.new]` keep working for ticking visible rows.

## Phased delivery

### Phase 0 — Scaffold

- Add `useSSRM?: boolean` to `MarketsGridProps`.
- `SsrmEngine` mounts `<SSRMGrid>`; wire snapshot + ticks.
- Capability matrix: enable presentation modules; disable or warn on unported runtimes.
- Lab toggle: MarketsGrid lab “SSRM large dataset” scenario.

### Phase 1 — Blotter core on SSRM

- Formatters, Excel formats, styles, column groups, set/text/number filters, named aggs, grouping, live ticks, export-all, status row counts.
- `.old`/`.new` previous-values store for conditional styling on viewport ticks.

### Phase 2 — Expressions & calcs

- Transpile StarUI per-row expressions → `perspectiveExpression` where possible; otherwise materialize on ingest.
- Dataset aggregates (`SUM`/`AVG`) via Perspective / `__ssrm_aggs` / `shareOfTotal`.
- Gate custom JS `aggFunc` with UI message; map common cases to named aggs.

### Phase 3 — Alerts, editing, linking

- Alerts on delta bus (SSRM dirty / transaction results), not full-grid scan.
- Smart-edit / bulk update via SSRM transactions.
- Context link without `doesExternalFilterPass` (filterModel / quick filter).

### Phase 4 — Parity checklist & polish

- Feature matrix green for SSRM; docs; performance under large N + high tick rate.
- Optional: `rowModel` alias; auto-suggest SSRM above a row-count threshold (not auto-switch without user consent).

## Capability matrix (product rule)

When `useSSRM` and a module is not ready:

- Prefer **disable control + tooltip** (“Requires client row model” / “Coming in SSRM phase N”).
- Never silently no-op a user-configured rule that would fire under CSRM without documenting the SSRM limitation (e.g. `.old` only on loaded rows is documented, not hidden).

## Testing

- Unit: expression `.old`/`.new` with SSRM previous-values store; ColDef transform → `SSRMColDef` / `perspectiveExpression`.
- Integration: lab grid `useSSRM` with 50k+ synthetic rows, ticks, Excel format column, conditional `[price.old] < [price.new]`.
- Regression: `useSSRM={false}` — existing MarketsGrid tests unchanged.

## Risks

| Risk | Mitigation |
|------|------------|
| Dual-path complexity in every module | Engine adapter + capability matrix; avoid `if (useSSRM)` deep in UI |
| Expression DSL ≠ Perspective | Explicit transpile layer; fallback materialize; gate unsupported ops |
| Users expect full-book `.old` rules | Document viewport semantics; match CSRM flash behaviour for visible rows |
| Package coupling starui ↔ ssrmgrid | Semver + workspace link; ssrmgrid stays framework-agnostic |

## Success criteria

1. `useSSRM={false}` — zero regression vs today.  
2. `useSSRM={true}` — large book loads/filters/groups without holding all rows in AG Grid memory.  
3. Excel formatting works on SSRM.  
4. `[field.old]` / `[field.new]` conditional styling works for ticking viewport rows.  
5. Phased path to full tooling parity without deleting CSRM.
