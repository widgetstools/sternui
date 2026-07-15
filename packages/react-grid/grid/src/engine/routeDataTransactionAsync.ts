import type { GridApi } from 'ag-grid-community';
import type { RowChangeSignal } from '@starui/engine';
import { isSsrmCapabilityEnabled } from './ssrmCapabilities.js';
import { materializeCalcFields, type SsrmCalcMaterializeContext } from './ssrmCalcColumns.js';
import { recordSsrmTickDiffs } from './ssrmRowDiff.js';
import { publishSsrmTransactionDelta } from './ssrmRowChangeBridge.js';
import type { SSRMGridHandle, SSRMTransaction } from './ssrmgrid-entry.js';

export type EngineDataTransaction = {
  add?: unknown[];
  update?: unknown[];
  remove?: unknown[];
};

function enrichTransactionRows(
  rows: unknown[] | undefined,
  materialize: SsrmCalcMaterializeContext | null | undefined,
): unknown[] | undefined {
  if (!rows?.length || !materialize?.materializePlans.length) return rows;
  return materializeCalcFields(
    rows as Record<string, unknown>[],
    materialize.materializePlans,
    materialize.evalRow,
  );
}

function enrichTransaction(
  tx: EngineDataTransaction,
  materialize: SsrmCalcMaterializeContext | null | undefined,
): EngineDataTransaction {
  if (!materialize?.materializePlans.length) return tx;
  const add = enrichTransactionRows(tx.add, materialize);
  const update = enrichTransactionRows(tx.update, materialize);
  if (add === tx.add && update === tx.update) return tx;
  return { ...tx, add, update };
}

/** Engine-neutral transaction apply — SSRM handle vs CSRM GridApi. */
export function routeDataTransactionAsync(
  useSSRM: boolean,
  tx: EngineDataTransaction,
  ssrmHandle: Pick<SSRMGridHandle, 'applyTransactionAsync'> | null | undefined,
  gridApi: Pick<GridApi, 'applyTransactionAsync'> | null | undefined,
  callback?: Parameters<GridApi['applyTransactionAsync']>[1],
  materialize?: SsrmCalcMaterializeContext | null,
  options?: {
    rowChangeBus?: RowChangeSignal | null;
    rowIdField?: string;
  },
): void {
  const enriched = useSSRM ? enrichTransaction(tx, materialize) : tx;
  if (useSSRM) {
    if (isSsrmCapabilityEnabled('oldNewDiff') && enriched.update?.length) {
      recordSsrmTickDiffs(enriched.update as Record<string, unknown>[]);
    }
    ssrmHandle?.applyTransactionAsync(enriched as SSRMTransaction);
    publishSsrmTransactionDelta(
      options?.rowChangeBus,
      enriched,
      options?.rowIdField ?? 'id',
    );
    return;
  }
  gridApi?.applyTransactionAsync(enriched, callback);
}

export function resolveSsrmHandle(
  useSSRM: boolean,
  ssrmHandle: SSRMGridHandle | null | undefined,
): SSRMGridHandle | null {
  return useSSRM ? (ssrmHandle ?? null) : null;
}
