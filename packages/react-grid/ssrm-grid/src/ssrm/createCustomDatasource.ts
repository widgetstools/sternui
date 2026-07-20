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
    ...(result.totalRowCount != null
      ? { totalRowCount: result.totalRowCount }
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
  /** Row-id field — enables in-place patching after a stale-block revalidate. */
  idField?: string;
};

/**
 * AG Grid SSRM datasource backed by {@link SsrmEngine}. Engines exposing
 * `trySyncRows` (RowMirror) serve blocks synchronously so scroll does not
 * wait a microtask / paint stubs; async-only engines fall back to getRows.
 *
 * Anti-jank for async engines (Perspective pull path):
 *  - **Stale-while-revalidate** — a block flagged stale by the dirty router
 *    still serves SYNCHRONOUSLY (at worst one refresh interval behind, the
 *    same staleness the painted grid shows) and a background refetch then
 *    patches the painted rows in place. Without this, every live tick made
 *    the whole cache miss and every fling frame waited a worker round trip.
 *  - **Neighbor prefetch** — after an async block miss resolves, the
 *    adjacent blocks are fetched into the cache so directional scrolling
 *    mostly stays on the sync path.
 */
export function createCustomDatasource(
  getEngine: () => SsrmEngine | null,
  getDataset: () => DatasetId,
  getExtras?: () => CustomDatasourceExtras,
  onTotals?: (
    totals: Record<string, unknown>,
    filteredRowCount: number,
    aggregates?: Record<string, Record<string, unknown>>,
    totalRowCount?: number,
  ) => void,
  blockCache?: SsrmBlockCache,
): IServerSideDatasource {
  /** Blocks with a background refetch in flight (stale revalidation). */
  const revalidating = new Set<string>();

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
      // Flat leaf blocks can be revalidated/prefetched by range and patched
      // by row id; grouped/pivot shapes converge on the soft-refresh cycle.
      const isFlatLeaf =
        groupKeys.length === 0 &&
        (req.rowGroupCols ?? []).length === 0 &&
        !req.pivotMode;

      const keyPartsFor = (s: number, e: number): BlockCacheKeyParts => ({
        dataset: getDataset(),
        startRow: s,
        endRow: e,
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
      });
      const cacheKey = fingerprintBlockRequest(keyPartsFor(startRow, endRow));

      const buildRequestFor = (
        x: CustomDatasourceExtras,
        s: number,
        e: number,
      ): SsrmGetRowsRequest => ({
        dataset: getDataset(),
        startRow: s,
        endRow: e,
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
        sortModel: (req.sortModel ?? []).map((s2) => ({
          colId: s2.colId,
          sort: s2.sort as "asc" | "desc",
        })),
        quickFilterText: x.quickFilterText,
        quickFilterFields: x.quickFilterFields,
        treeData: x.treeData,
        absSort: x.absSort,
        rowKeepExpression: x.rowKeepExpression,
      });
      const buildRequest = (x: CustomDatasourceExtras): SsrmGetRowsRequest =>
        buildRequestFor(x, startRow, endRow);

      /**
       * Background refetch of a stale block: refresh the cache entry, then
       * patch the painted rows in place (no store reload, no stubs). Row
       * counts converge one cycle later — the next request for this range
       * serves the fresh entry.
       */
      const revalidate = (): void => {
        if (!blockCache || revalidating.has(cacheKey)) return;
        // Visibility gate: an off-screen stale block gains nothing from a
        // background refetch — it re-serves (stale) and revalidates when
        // it next scrolls into view. Without this, every loaded block
        // refetched every refresh cycle and the engine port drowned
        // during/after long scrollbar drags.
        const idFieldNow = (getExtras?.() ?? extras).idField;
        if (isFlatLeaf && idFieldNow) {
          const cached = blockCache.get(cacheKey);
          const anyRendered = cached?.rowData.some((r) => {
            const raw = r[idFieldNow];
            return raw != null && raw !== "" && params.api.getRowNode(String(raw)) != null;
          });
          if (cached && !anyRendered) return; // stays stale until visible
        }
        revalidating.add(cacheKey);
        void (async () => {
          try {
            const live = getExtras?.() ?? extras;
            const prev = blockCache.get(cacheKey);
            const result = await Promise.resolve(
              engine.getRows(buildRequest(live)),
            );
            const fresh = toCached(result);
            blockCache.set(cacheKey, fresh);
            const idField = live.idField;
            if (isFlatLeaf && idField) {
              // Patch ONLY rows that actually changed vs the stale copy —
              // re-applying unchanged rows re-rendered the whole viewport
              // every reconcile and re-triggered update-keyed styling
              // (field report: whole-grid flashing).
              const prevById = new Map<string, Record<string, unknown>>();
              for (const r of prev?.rowData ?? []) {
                const raw = r[idField];
                if (raw != null && raw !== "") prevById.set(String(raw), r);
              }
              const changed = (r: Record<string, unknown>): boolean => {
                const old = prevById.get(String(r[idField]));
                if (!old) return true;
                for (const k of Object.keys(r)) {
                  if (!Object.is(r[k], old[k])) return true;
                }
                return false;
              };
              const update = fresh.rowData.filter((r) => {
                const raw = r[idField];
                return (
                  raw != null &&
                  raw !== "" &&
                  params.api.getRowNode(String(raw)) != null &&
                  changed(r)
                );
              });
              if (update.length > 0) {
                params.api.applyServerSideTransactionAsync({ update });
              }
            }
            if (onTotals && groupKeys.length === 0) {
              onTotals(
                fresh.totals ?? {},
                fresh.filteredRowCount ?? fresh.rowCount,
                fresh.aggregates,
                fresh.totalRowCount,
              );
            }
          } catch {
            /* stale entry stays servable; the next cycle retries */
          } finally {
            revalidating.delete(cacheKey);
          }
        })();
      };

      /** Warm the adjacent blocks so directional fling stays sync-served. */
      const prefetchNeighbors = (rowCount: number): void => {
        if (!blockCache || !isFlatLeaf) return;
        const blockSize = endRow - startRow;
        if (blockSize <= 0) return;
        const ranges: Array<[number, number]> = [];
        if (startRow - blockSize >= 0) {
          ranges.push([startRow - blockSize, startRow]);
        }
        if (endRow < rowCount) ranges.push([endRow, endRow + blockSize]);
        for (const [s, e] of ranges) {
          const nKey = fingerprintBlockRequest(keyPartsFor(s, e));
          if (blockCache.get(nKey) !== undefined) continue;
          void blockCache
            .getOrLoad(nKey, async () =>
              toCached(
                await Promise.resolve(
                  engine.getRows(buildRequestFor(getExtras?.() ?? extras, s, e)),
                ),
              ),
            )
            .catch(() => undefined);
        }
      };

      const deliver = (result: CachedGetRows) => {
        // Counts only — avoid status-bar churn when totals are empty and unchanged.
        if (onTotals && groupKeys.length === 0) {
          onTotals(
            result.totals ?? {},
            result.filteredRowCount ?? result.rowCount,
            result.aggregates,
            result.totalRowCount,
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

      // Sync path: block cache hit. Stale hits still serve synchronously —
      // the fling never waits — and revalidate in the background.
      if (blockCache && extras.isConfigured) {
        const hit = blockCache.get(cacheKey);
        if (hit) {
          deliver(hit);
          if (blockCache.isStale(cacheKey)) revalidate();
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
          if (blockCache?.isStale(cacheKey)) revalidate();
          return;
        }

        try {
          const result = await Promise.resolve(engine.getRows(liveRequest));
          blockCache?.set(cacheKey, toCached(result));
          deliver(toCached(result));
          prefetchNeighbors(result.rowCount);
        } catch {
          params.fail();
        }
      };

      void run();
    },
  };
}
