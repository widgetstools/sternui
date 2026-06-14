/**
 * applyProviderToGrid — split live provider ticks into AG Grid add vs
 * update transactions with pending-add deduplication.
 *
 * Extracted from MarketsGridContainer so Task 5.2 can wire
 * `IDataProvider.onTick` without duplicating the classifier.
 */

import type { GridApi, IRowNode } from 'ag-grid-community';
import { composeRowId } from '@starui/shared-types';

export interface SplitProviderRowsResult<TData> {
  adds: TData[];
  updates: TData[];
  /**
   * Rows coalesced because an add for the same id is already queued.
   * Latest payload is retained and applied once the add transaction lands.
   */
  coalescedPending: number;
}

export interface ApplyProviderTickResult {
  coalescedPending: number;
  addCount: number;
  updateCount: number;
}

export interface ApplyProviderToGridState {
  clearPendingAdds(): void;
  getPendingAddCount(): number;
  splitRows<TData>(
    rows: readonly TData[],
    rowIdField: string | readonly string[] | undefined,
    gridApi: GridApi<TData>,
  ): SplitProviderRowsResult<TData>;
  applyTick<TData>(
    gridApi: GridApi<TData>,
    rows: readonly TData[],
    rowIdField: string | readonly string[] | undefined,
  ): ApplyProviderTickResult;
  applyTickWithResolver<TData>(
    gridApi: GridApi<TData>,
    rows: readonly TData[],
    resolveId: (row: TData) => string | null,
  ): ApplyProviderTickResult;
}

/** Clear pending-add bookkeeping after AG Grid applies an add transaction. */
export function clearPendingAddsFromTransaction(
  pendingAddIds: Set<string>,
  result: { add: IRowNode[] },
): void {
  for (const node of result.add) {
    const nodeId = node.id;
    if (typeof nodeId === 'string') pendingAddIds.delete(nodeId);
  }
}

/**
 * Classify provider rows into add vs update buckets.
 *
 * Order matters: `getRowNode` is checked before `pendingAddIds` so rows
 * that AG Grid already holds (but whose add callback has not fired yet)
 * route to `updates`, not duplicate `add`s.
 */
export function splitProviderRowsForGrid<TData>(
  rows: readonly TData[],
  rowIdField: string | readonly string[] | undefined,
  gridApi: GridApi<TData>,
  pendingAddIds: Set<string>,
  pendingAddLatest?: Map<string, unknown>,
): SplitProviderRowsResult<TData> {
  const adds: TData[] = [];
  const updates: TData[] = [];
  let coalescedPending = 0;

  for (const row of rows) {
    const id = composeRowId(row as Record<string, unknown>, rowIdField);
    if (id === null) continue;

    if (gridApi.getRowNode(id)) {
      updates.push(row);
      continue;
    }
    if (pendingAddIds.has(id)) {
      pendingAddLatest?.set(id, row);
      coalescedPending += 1;
      continue;
    }
    adds.push(row);
    pendingAddIds.add(id);
  }

  return { adds, updates, coalescedPending };
}

export function splitProviderRowsWithResolver<TData>(
  rows: readonly TData[],
  resolveId: (row: TData) => string | null,
  gridApi: GridApi<TData>,
  pendingAddIds: Set<string>,
  pendingAddLatest?: Map<string, unknown>,
): SplitProviderRowsResult<TData> {
  const adds: TData[] = [];
  const updates: TData[] = [];
  let coalescedPending = 0;

  for (const row of rows) {
    const id = resolveId(row);
    if (id === null) continue;

    if (gridApi.getRowNode(id)) {
      updates.push(row);
      continue;
    }
    if (pendingAddIds.has(id)) {
      pendingAddLatest?.set(id, row);
      coalescedPending += 1;
      continue;
    }
    adds.push(row);
    pendingAddIds.add(id);
  }

  return { adds, updates, coalescedPending };
}

export function createApplyProviderToGridState(): ApplyProviderToGridState {
  const pendingAddIds = new Set<string>();
  const pendingAddLatest = new Map<string, unknown>();

  const applyCoalescedAfterAdds = <TData>(gridApi: GridApi<TData>, added: IRowNode[]) => {
    if (pendingAddLatest.size === 0) return;
    const updates: TData[] = [];
    for (const node of added) {
      const nodeId = node.id;
      if (typeof nodeId !== 'string') continue;
      const latest = pendingAddLatest.get(nodeId);
      if (latest === undefined) continue;
      updates.push(latest as TData);
      pendingAddLatest.delete(nodeId);
    }
    if (updates.length > 0) {
      gridApi.applyTransactionAsync({ update: updates });
    }
  };

  return {
    clearPendingAdds() {
      pendingAddIds.clear();
      pendingAddLatest.clear();
    },
    getPendingAddCount() {
      return pendingAddIds.size;
    },
    splitRows(rows, rowIdField, gridApi) {
      return splitProviderRowsForGrid(rows, rowIdField, gridApi, pendingAddIds, pendingAddLatest);
    },
    applyTick(gridApi, rows, rowIdField) {
      if (rows.length === 0) return { coalescedPending: 0, addCount: 0, updateCount: 0 };

      if (!rowIdField) {
        gridApi.applyTransactionAsync({ update: rows.slice() });
        return { coalescedPending: 0, addCount: 0, updateCount: rows.length };
      }

      const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
        rows,
        rowIdField,
        gridApi,
        pendingAddIds,
        pendingAddLatest,
      );

      if (adds.length === 0 && updates.length === 0) {
        return { coalescedPending, addCount: 0, updateCount: 0 };
      }

      gridApi.applyTransactionAsync({ add: adds, update: updates }, (result) => {
        clearPendingAddsFromTransaction(pendingAddIds, result);
        applyCoalescedAfterAdds(gridApi, result.add);
      });

      return { coalescedPending, addCount: adds.length, updateCount: updates.length };
    },
    applyTickWithResolver(gridApi, rows, resolveId) {
      if (rows.length === 0) return { coalescedPending: 0, addCount: 0, updateCount: 0 };

      const { adds, updates, coalescedPending } = splitProviderRowsWithResolver(
        rows,
        resolveId,
        gridApi,
        pendingAddIds,
        pendingAddLatest,
      );

      if (adds.length === 0 && updates.length === 0) {
        return { coalescedPending, addCount: 0, updateCount: 0 };
      }

      gridApi.applyTransactionAsync({ add: adds, update: updates }, (result) => {
        clearPendingAddsFromTransaction(pendingAddIds, result);
        applyCoalescedAfterAdds(gridApi, result.add);
      });

      return { coalescedPending, addCount: adds.length, updateCount: updates.length };
    },
  };
}
