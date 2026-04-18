import type { ColDef, GridApi, ValueGetterParams, ValueFormatterParams, CellClassParams } from 'ag-grid-community';
import type { ExpressionNode } from '@grid-customizer/core';
import { ExpressionEngine } from '@grid-customizer/core';
import { valueFormatterFromTemplate } from '../column-customization/adapters/valueFormatterFromTemplate';
import { excelFormatColorResolver } from '../column-customization/adapters/excelFormatter';
import type { VirtualColumnDef } from './state';

// ─── `allRows` cache — one snapshot per GridApi, invalidated on rowData change ─
//
// Column-wide aggregations (`SUM([price])`, `AVG([yield])`, …) need the full
// set of rowData, but a naive `api.forEachNode(...)` inside every valueGetter
// call turns the compute into O(rows × cols). Cache one flat snapshot per
// GridApi and flush it when AG-Grid signals rowData mutation. A WeakMap
// means grids we've torn down (hot-reload, strict-mode double-mount) get GC'd
// without us leaking listeners.
const _allRowsCache = new WeakMap<
  GridApi,
  { rows: Record<string, unknown>[]; wired: boolean }
>();

function getAllRowsSnapshot(api: GridApi | null | undefined): Record<string, unknown>[] {
  if (!api) return [];
  let entry = _allRowsCache.get(api);
  if (entry && entry.rows.length) return entry.rows;
  if (!entry) {
    entry = { rows: [], wired: false };
    _allRowsCache.set(api, entry);
  }
  // Lazy subscription — only the first aggregation expression triggers
  // this. Idempotent: we check `wired` before re-subscribing.
  if (!entry.wired) {
    const invalidate = () => {
      const e = _allRowsCache.get(api);
      if (e) e.rows = [];
    };
    const events = ['rowDataUpdated', 'modelUpdated', 'cellValueChanged'] as const;
    for (const evt of events) {
      try {
        api.addEventListener(evt, invalidate);
      } catch {
        /* api may be mid-teardown */
      }
    }
    entry.wired = true;
  }
  // Populate the snapshot.
  try {
    const rows: Record<string, unknown>[] = [];
    api.forEachNode((node) => {
      if (node.data) rows.push(node.data as Record<string, unknown>);
    });
    entry.rows = rows;
  } catch {
    entry.rows = [];
  }
  return entry.rows;
}

/**
 * Translate a `VirtualColumnDef` into a ready-to-register AG-Grid `ColDef`.
 *
 * Parses the expression ONCE here — the resulting AST is closed over by the
 * returned `valueGetter`, so per-cell evaluation is just an AST walk. Errors
 * at parse time silently fall back to a `null` AST, which evaluates to null
 * for every row; this avoids crashing the whole grid when one column has a
 * typo. A runtime evaluation failure per row is similarly caught and returned
 * as `null`.
 *
 * Virtual columns are always `editable: false` — the cell's value is derived,
 * so direct edits would be immediately overwritten by the next render.
 *
 * Value formatting dispatches through the shared
 * `valueFormatterFromTemplate` resolver, so every `ValueFormatterTemplate`
 * kind (preset / excelFormat / expression / tick) works uniformly with
 * virtual columns. That's also what the regular
 * column-customization pipeline uses, so a virtual column can carry the
 * same formats a data column can.
 */
export function buildVirtualColDef(v: VirtualColumnDef, engine: ExpressionEngine): ColDef {
  let ast: ExpressionNode | null;
  try {
    ast = engine.parse(v.expression);
  } catch {
    ast = null;
  }

  const formatFn = v.valueFormatterTemplate
    ? valueFormatterFromTemplate(v.valueFormatterTemplate)
    : null;

  // Excel color tags — `[Red]`, `[Green]`, etc. — are parsed by SSF but only
  // affect the returned text, not its color (SSF returns plain strings).
  // Mirror what `column-customization` does for regular columns: when the
  // template is `kind: 'excelFormat'` and contains a color tag, attach a
  // `cellStyle` function that paints the per-value color so formats like
  // `[Green]$#,##0.00;[Red]-$#,##0.00` actually render with colour on the
  // calculated column (e.g. Gross P&L).
  const colorResolver =
    v.valueFormatterTemplate?.kind === 'excelFormat'
      ? excelFormatColorResolver(v.valueFormatterTemplate.format)
      : undefined;

  return {
    colId: v.colId,
    headerName: v.headerName,
    initialWidth: v.initialWidth,
    initialHide: v.initialHide,
    initialPinned: v.initialPinned,
    editable: false,
    sortable: true,
    filter: true,
    valueGetter: (params: ValueGetterParams) => {
      // Group-row rendering: when a group row is drawn and this column has
      // an `aggFunc` set, AG-Grid stores the aggregated result on
      // `params.node.aggData[colId]`. Return that here so the group row
      // shows the aggregate instead of falling through to null.
      //
      // Without this branch AG-Grid would display an empty cell at the
      // group row for every virtual column (calculated columns only read
      // `params.data`, which is undefined on group nodes).
      if (!params.data) {
        const group = params.node?.group === true;
        const colId = v.colId;
        const agg = (params.node as { aggData?: Record<string, unknown> } | null | undefined)
          ?.aggData?.[colId];
        if (group && agg !== undefined) return agg;
        return null;
      }
      if (!ast) return null;
      try {
        return engine.evaluate(ast, {
          x: null,
          value: null,
          data: params.data,
          columns: params.data,
          // Column-wide aggregation support: every call gets a lazy
          // getter onto the cached `allRows` snapshot. Expressions that
          // don't use `aggregateColumnRefs` functions never touch this
          // field, so the cache is only built on first aggregate access.
          get allRows() {
            return getAllRowsSnapshot(params.api as GridApi);
          },
        });
      } catch {
        return null;
      }
    },
    valueFormatter: formatFn
      ? (params: ValueFormatterParams) => formatFn({ value: params.value, data: params.data })
      : undefined,
    cellStyle: colorResolver
      ? (params: CellClassParams) => {
          const color = colorResolver(params.value);
          return color ? { color } : null;
        }
      : undefined,
  };
}
