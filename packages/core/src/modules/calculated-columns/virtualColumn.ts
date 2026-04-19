/**
 * Translate a `VirtualColumnDef` → AG-Grid `ColDef`.
 *
 * The expression is parsed ONCE and the resulting AST is closed over by
 * the returned `valueGetter` — per-cell work is a pure AST walk. Parse
 * errors silently produce a null AST (every row becomes null); runtime
 * errors per row are similarly swallowed, so one broken expression never
 * crashes the grid.
 *
 * Column-wide aggregates (`SUM([price])`, `AVG([yield])`) need the full
 * row snapshot. Each GridApi gets ONE cached snapshot via
 * `ResourceScope.cache`; the module's `activate()` wires invalidation
 * through the ApiHub's rowDataUpdated / modelUpdated / cellValueChanged
 * events.
 */
import type {
  CellClassParams,
  ColDef,
  GridApi,
  ValueFormatterParams,
  ValueGetterParams,
} from 'ag-grid-community';
import type { ExpressionEngineLike } from '../../platform/types';
import {
  excelFormatColorResolver,
  valueFormatterFromTemplate,
} from '../../colDef';
import type { VirtualColumnDef } from './state';

/** Shape stored in ResourceScope.cache<GridApi, AllRowsEntry>. */
export interface AllRowsEntry {
  rows: Record<string, unknown>[];
}

export function getAllRowsSnapshot(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): Record<string, unknown>[] {
  if (!api) return [];
  let entry = cache.get(api);
  if (entry && entry.rows.length) return entry.rows;
  if (!entry) {
    entry = { rows: [] };
    cache.set(api, entry);
  }
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

export function invalidateAllRowsCache(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): void {
  if (!api) return;
  const entry = cache.get(api);
  if (entry) entry.rows = [];
}

export function buildVirtualColDef(
  v: VirtualColumnDef,
  engine: ExpressionEngineLike,
  cache: WeakMap<GridApi, AllRowsEntry>,
): ColDef {
  let ast: unknown;
  try { ast = engine.parse(v.expression); }
  catch { ast = null; }

  const formatFn = v.valueFormatterTemplate
    ? valueFormatterFromTemplate(v.valueFormatterTemplate)
    : null;

  // Excel color tags — `[Red]`, `[Green]` — parsed by SSF but only affect
  // the returned text's semantics. Mirror column-customization: emit a
  // `cellStyle` fn that paints the per-value color when the format
  // carries a color tag.
  const colorResolver = v.valueFormatterTemplate?.kind === 'excelFormat'
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
      // Group rows store the agg result on `node.aggData[colId]`. Return
      // that here so the group row shows the aggregate instead of an
      // empty cell. Calculated columns only read `params.data`, which is
      // undefined on group nodes — without this branch every group row
      // would render blank for every virtual column.
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
          // Lazy column-wide snapshot — only the first aggregate expression
          // inside a row touches this. Expressions that don't use the
          // aggregateColumnRefs functions never pay the cache cost.
          get allRows() {
            return getAllRowsSnapshot(params.api as GridApi, cache);
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
