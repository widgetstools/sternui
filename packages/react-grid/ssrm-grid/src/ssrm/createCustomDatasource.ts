import type { IServerSideDatasource } from "ag-grid-community";
import type { SsrmEngine } from "../engine/types.js";
import type {
  DatasetId,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
} from "./types";
import {
  fingerprintBlockRequest,
  type BlockCacheKeyParts,
  type CachedGetRows,
  type SsrmBlockCache,
} from "./ssrmBlockCache";

function buildGrandTotalData(
  valueCols: { field: string; aggFunc: string }[],
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
      row[vc.field] = value;
      hasValue = true;
    }
  }
  return hasValue ? row : undefined;
}

function toCached(result: SsrmGetRowsResult): CachedGetRows {
  return {
    rowData: result.rowData,
    rowCount: result.rowCount,
    ...(result.totals ? { totals: result.totals } : {}),
    ...(result.aggregates ? { aggregates: result.aggregates } : {}),
    ...(result.filteredRowCount != null
      ? { filteredRowCount: result.filteredRowCount }
      : {}),
  };
}

export type CustomDatasourceExtras = {
  quickFilterText?: string;
  quickFilterFields?: string[];
  includeGrandTotal?: boolean;
  isConfigured?: boolean;
  waitUntilConfigured?: () => Promise<boolean>;
  treeData?: boolean;
  absSort?: boolean;
  rowKeepExpression?: string;
  /** Bumped on purge / data replace — stale async results must miss. */
  refreshGeneration?: number;
};

/**
 * AG Grid SSRM datasource backed by {@link SsrmEngine}. Engines exposing
 * `trySyncRows` (RowMirror) serve blocks synchronously so scroll does not
 * wait a microtask / paint stubs; async-only engines fall back to getRows.
 */
export function createCustomDatasource(
  getEngine: () => SsrmEngine | null,
  getDataset: () => DatasetId,
  getExtras?: () => CustomDatasourceExtras,
  onTotals?: (
    totals: Record<string, unknown>,
    filteredRowCount: number,
    aggregates?: Record<string, Record<string, unknown>>,
  ) => void,
  blockCache?: SsrmBlockCache,
): IServerSideDatasource {
  return {
    getRows(params) {
      const engine = getEngine();
      if (!engine) {
        params.fail();
        return;
      }
      const extras = getExtras?.() ?? {};
      const req = params.request;
      const valueCols = (req.valueCols ?? []).map((c) => ({
        id: c.id,
        field: c.field ?? "",
        aggFunc: String(c.aggFunc ?? "sum"),
      }));
      const startRow = req.startRow ?? 0;
      const endRow = req.endRow ?? 100;
      const groupKeys = (req.groupKeys ?? []).map(String);
      const generationAtStart = extras.refreshGeneration ?? 0;

      const keyParts: BlockCacheKeyParts = {
        dataset: getDataset(),
        startRow,
        endRow,
        rowGroupCols: (req.rowGroupCols ?? []).map((c) => ({
          id: c.id,
          field: c.field ?? "",
        })),
        valueCols,
        pivotCols: (req.pivotCols ?? []).map((c) => ({
          id: c.id,
          field: c.field ?? "",
        })),
        groupKeys,
        filterModel: (req.filterModel ?? {}) as Record<string, unknown>,
        sortModel: (req.sortModel ?? []) as {
          colId: string;
          sort: "asc" | "desc";
        }[],
        pivotMode: Boolean(req.pivotMode),
        quickFilterText: extras.quickFilterText ?? "",
        quickFilterFields: extras.quickFilterFields ?? [],
        treeData: extras.treeData,
        absSort: extras.absSort,
        rowKeepExpression: extras.rowKeepExpression,
        refreshGeneration: generationAtStart,
      };
      const cacheKey = fingerprintBlockRequest(keyParts);

      const buildRequest = (x: CustomDatasourceExtras): SsrmGetRowsRequest => ({
        dataset: getDataset(),
        startRow,
        endRow,
        rowGroupCols: (req.rowGroupCols ?? []).map((c) => ({
          id: c.id,
          field: c.field ?? "",
          displayName: c.displayName ?? c.field ?? c.id,
        })),
        valueCols,
        pivotCols: (req.pivotCols ?? []).map((c) => ({
          id: c.id,
          field: c.field ?? "",
          displayName: c.displayName ?? c.field ?? c.id,
        })),
        pivotMode: Boolean(req.pivotMode),
        groupKeys,
        filterModel: (req.filterModel ?? {}) as Record<string, unknown>,
        sortModel: (req.sortModel ?? []).map((s) => ({
          colId: s.colId,
          sort: s.sort as "asc" | "desc",
        })),
        quickFilterText: x.quickFilterText,
        quickFilterFields: x.quickFilterFields,
        treeData: x.treeData,
        absSort: x.absSort,
        rowKeepExpression: x.rowKeepExpression,
      });

      const deliver = (result: CachedGetRows) => {
        // Counts only — avoid status-bar churn when totals are empty and unchanged.
        if (onTotals && groupKeys.length === 0) {
          onTotals(
            result.totals ?? {},
            result.filteredRowCount ?? result.rowCount,
            result.aggregates,
          );
        }

        const includeGrandTotal =
          Boolean(extras.includeGrandTotal) &&
          groupKeys.length === 0 &&
          Boolean(result.aggregates || result.totals);

        params.success({
          rowData: result.rowData,
          rowCount: result.rowCount,
          ...(includeGrandTotal
            ? {
                grandTotalData: buildGrandTotalData(
                  valueCols,
                  result.aggregates,
                  result.totals,
                ),
              }
            : {}),
        });
      };

      // Sync path: engine fast path → no blank placeholder rows on fling.
      if (extras.isConfigured && engine.trySyncRows) {
        const synced = engine.trySyncRows(buildRequest(extras));
        if (synced) {
          const cached = toCached(synced);
          blockCache?.set(cacheKey, cached);
          deliver(cached);
          return;
        }
      }

      // Sync path: block cache hit.
      if (blockCache && extras.isConfigured) {
        const hit = blockCache.get(cacheKey);
        if (hit) {
          deliver(hit);
          return;
        }
      }

      const run = async () => {
        const live = getExtras?.() ?? extras;
        const ready = live.isConfigured
          ? true
          : live.waitUntilConfigured
            ? await live.waitUntilConfigured()
            : false;
        if (!ready && !getExtras?.().isConfigured) {
          params.fail();
          return;
        }

        // Re-check sync paths after the gate (configure may have filled the book).
        const liveRequest = buildRequest(live);
        if (engine.trySyncRows) {
          const synced = engine.trySyncRows(liveRequest);
          if (synced) {
            const cached = toCached(synced);
            blockCache?.set(cacheKey, cached);
            deliver(cached);
            return;
          }
        }
        const hit = blockCache?.get(cacheKey);
        if (hit) {
          deliver(hit);
          return;
        }

        try {
          const result = await Promise.resolve(engine.getRows(liveRequest));
          blockCache?.set(cacheKey, toCached(result));
          deliver(toCached(result));
        } catch {
          params.fail();
        }
      };

      void run();
    },
  };
}
