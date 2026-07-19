import {
  GRAND_TOTAL_ROW_ID,
  type ColDef,
  type Column,
  type GridApi,
} from "ag-grid-community";

import type { MirrorValueCol } from "./mirrorGroupAgg";
import type { SsrmEngine } from "../engine/types";
import type { DatasetId, SsrmGetRowsRequest } from "./types";
import { resolveAggFuncName } from "./compileColExpression";

function readValueCols(api: GridApi): MirrorValueCol[] {
  const cols = api.getValueColumns?.() ?? [];
  return cols.map((col: Column) => {
    const def = col.getColDef() as ColDef;
    return {
      id: col.getColId(),
      field: def.field ?? col.getColId(),
      aggFunc: resolveAggFuncName(col.getAggFunc?.() ?? def.aggFunc ?? "sum"),
    };
  });
}

function readRowGroupCols(
  api: GridApi,
): { id: string; field: string; displayName: string }[] {
  return (api.getRowGroupColumns?.() ?? []).map((col) => {
    const def = col.getColDef() as ColDef;
    const field = def.field ?? col.getColId();
    return {
      id: col.getColId(),
      field,
      displayName: def.headerName ?? field,
    };
  });
}

function measureFieldsEqual(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
  fields: string[],
): boolean {
  if (!prev) return false;
  for (const field of fields) {
    if (prev[field] !== next[field]) return false;
  }
  return true;
}

function buildGrandTotalData(
  valueCols: MirrorValueCol[],
  aggregates?: Record<string, Record<string, unknown>>,
  totals?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if ((!aggregates || Object.keys(aggregates).length === 0) && !totals) {
    return undefined;
  }
  const row: Record<string, unknown> = {};
  let hasValue = false;
  for (const vc of valueCols) {
    if (!vc.field) continue;
    const fromAgg = aggregates?.[vc.field]?.[vc.aggFunc];
    const value = fromAgg !== undefined ? fromAgg : totals?.[vc.field];
    if (value !== undefined) {
      // Keep full precision — rounding avgs hid grand-total flashes when a few
      // leaf prices moved inside a large book (portfolio avg barely moves at 2dp).
      row[vc.field] = value;
      hasValue = true;
    }
  }
  return hasValue ? row : undefined;
}

export type SsrmAggPatchExtras = {
  dataset?: DatasetId;
  quickFilterText?: string;
  quickFilterFields?: string[];
  absSort?: boolean;
  rowKeepExpression?: string;
  /** Primary key field — stamped with GRAND_TOTAL_ROW_ID for getRowId. */
  idField?: string;
};

function buildRequest(
  api: GridApi,
  valueCols: MirrorValueCol[],
  groupKeys: string[],
  endRow: number,
  extras?: SsrmAggPatchExtras,
): SsrmGetRowsRequest {
  return {
    dataset: extras?.dataset ?? "main",
    startRow: 0,
    endRow,
    rowGroupCols: readRowGroupCols(api),
    valueCols,
    pivotCols: [],
    pivotMode: Boolean(api.isPivotMode?.()),
    groupKeys,
    filterModel:
      (api.getFilterModel?.() as Record<string, unknown> | null) ?? {},
    sortModel: [],
    quickFilterText: extras?.quickFilterText,
    quickFilterFields: extras?.quickFilterFields,
    absSort: extras?.absSort,
    rowKeepExpression: extras?.rowKeepExpression,
  };
}

/**
 * Patch the native AG Grid `grandTotalRow` from the engine's sync read path.
 * SSRM only refreshes grand totals via getRows / transactions with
 * `getRowId === GRAND_TOTAL_ROW_ID` — leaf txs alone leave the footer stale.
 * No-op on engines without `trySyncRows` (their views aggregate server-side).
 */
export function patchGrandTotalFromEngine(
  api: GridApi,
  engine: SsrmEngine,
  extras?: SsrmAggPatchExtras,
): void {
  if (!engine.trySyncRows) return;
  const valueCols = readValueCols(api);
  if (valueCols.length === 0) return;

  const slice = engine.trySyncRows(buildRequest(api, valueCols, [], 0, extras));
  if (!slice?.totals && !slice?.aggregates) return;

  const grandTotalData = buildGrandTotalData(
    valueCols,
    slice.aggregates,
    slice.totals,
  );
  if (!grandTotalData) return;

  const idField = extras?.idField ?? "id";
  grandTotalData[idField] = GRAND_TOTAL_ROW_ID;

  const fields = valueCols.map((vc) => vc.field).filter(Boolean);
  const prev = api.getRowNode?.(GRAND_TOTAL_ROW_ID)?.data as
    | Record<string, unknown>
    | undefined;
  if (measureFieldsEqual(prev, grandTotalData, fields)) return;

  api.applyServerSideTransactionAsync({
    update: [grandTotalData],
  });
}

/**
 * Recompute group-header aggregates from the engine's sync read path and patch
 * every loaded group store in place (keeps ticks live under row grouping).
 */
export function patchLoadedGroupAggregatesFromEngine(
  api: GridApi,
  engine: SsrmEngine,
  extras?: SsrmAggPatchExtras,
): void {
  if (!engine.trySyncRows) return;
  const rowGroupCols = readRowGroupCols(api);
  if (rowGroupCols.length === 0) return;

  const valueCols = readValueCols(api);
  const measureFields = valueCols.map((vc) => vc.field).filter(Boolean);
  const levels = api.getServerSideGroupLevelState?.() ?? [];

  for (const level of levels) {
    const route = [...(level.route ?? [])].map(String);
    // Leaf stores have route length === rowGroupCols.length — skip.
    if (route.length >= rowGroupCols.length) continue;

    const slice = engine.trySyncRows(
      buildRequest(api, valueCols, route, Number.MAX_SAFE_INTEGER, extras),
    );
    const groups = slice?.rowData;
    if (!groups?.length) continue;

    const changed: Record<string, unknown>[] = [];
    for (const next of groups) {
      const key = String(next.__ssrmGroupKey ?? "");
      const nodeId = `g:${[...route, key].join("|")}`;
      const prev = api.getRowNode?.(nodeId)?.data as
        | Record<string, unknown>
        | undefined;
      if (measureFieldsEqual(prev, next, measureFields)) continue;
      changed.push(next);
    }
    if (changed.length === 0) continue;

    api.applyServerSideTransactionAsync({
      route,
      update: changed,
    });
  }
}
