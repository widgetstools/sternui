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
  /** Rows skipped because an add for the same id is already queued. */
  droppedPending: number;
}

export interface ApplyProviderTickResult {
  droppedPending: number;
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
): SplitProviderRowsResult<TData> {
  const adds: TData[] = [];
  const updates: TData[] = [];
  let droppedPending = 0;

  for (const row of rows) {
    const id = composeRowId(row as Record<string, unknown>, rowIdField);
    if (id === null) continue;

    if (gridApi.getRowNode(id)) {
      updates.push(row);
      continue;
    }
    if (pendingAddIds.has(id)) {
      droppedPending += 1;
      continue;
    }
    adds.push(row);
    pendingAddIds.add(id);
  }

  return { adds, updates, droppedPending };
}

export function createApplyProviderToGridState(): ApplyProviderToGridState {
  const pendingAddIds = new Set<string>();

  return {
    clearPendingAdds() {
      pendingAddIds.clear();
    },
    getPendingAddCount() {
      return pendingAddIds.size;
    },
    splitRows(rows, rowIdField, gridApi) {
      return splitProviderRowsForGrid(rows, rowIdField, gridApi, pendingAddIds);
    },
    applyTick(gridApi, rows, rowIdField) {
      if (rows.length === 0) return { droppedPending: 0, addCount: 0, updateCount: 0 };

      if (!rowIdField) {
        gridApi.applyTransactionAsync({ update: rows.slice() });
        return { droppedPending: 0, addCount: 0, updateCount: rows.length };
      }

      const { adds, updates, droppedPending } = splitProviderRowsForGrid(
        rows,
        rowIdField,
        gridApi,
        pendingAddIds,
      );

      gridApi.applyTransactionAsync({ add: adds, update: updates }, (result) => {
        clearPendingAddsFromTransaction(pendingAddIds, result);
      });

      return { droppedPending, addCount: adds.length, updateCount: updates.length };
    },
  };
}
