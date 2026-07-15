import type { GridApi } from 'ag-grid-community';
import { isSsrmCapabilityEnabled } from './ssrmCapabilities.js';
import { recordSsrmTickDiffs } from './ssrmRowDiff.js';
import type { SSRMGridHandle, SSRMTransaction } from './ssrmgrid-entry.js';

export type EngineDataTransaction = {
  add?: unknown[];
  update?: unknown[];
  remove?: unknown[];
};

/** Engine-neutral transaction apply — SSRM handle vs CSRM GridApi. */
export function routeDataTransactionAsync(
  useSSRM: boolean,
  tx: EngineDataTransaction,
  ssrmHandle: Pick<SSRMGridHandle, 'applyTransactionAsync'> | null | undefined,
  gridApi: Pick<GridApi, 'applyTransactionAsync'> | null | undefined,
  callback?: Parameters<GridApi['applyTransactionAsync']>[1],
): void {
  if (useSSRM) {
    if (isSsrmCapabilityEnabled('oldNewDiff') && tx.update?.length) {
      recordSsrmTickDiffs(tx.update as Record<string, unknown>[]);
    }
    ssrmHandle?.applyTransactionAsync(tx as SSRMTransaction);
    return;
  }
  gridApi?.applyTransactionAsync(tx, callback);
}

export function resolveSsrmHandle(
  useSSRM: boolean,
  ssrmHandle: SSRMGridHandle | null | undefined,
): SSRMGridHandle | null {
  return useSSRM ? (ssrmHandle ?? null) : null;
}
