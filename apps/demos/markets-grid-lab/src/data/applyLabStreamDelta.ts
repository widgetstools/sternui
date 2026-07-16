import type { GridApi } from 'ag-grid-community';
import { applyDelta } from './applyDelta';
import { labRowsEqual } from './rowDiff';
import type { LabRow } from './types';

const ID_FIELD = 'id' as const;

export type LabStreamApplyTx = (tx: {
  add?: LabRow[];
  update?: LabRow[];
  remove?: LabRow[];
}) => void;

function isServerSideRowModel(api: GridApi): boolean {
  try {
    return api.getGridOption('rowModelType') === 'serverSide';
  } catch {
    return false;
  }
}

function splitTransaction(
  api: GridApi,
  rows: readonly LabRow[],
): { add: LabRow[]; update: LabRow[] } {
  // SSRM only materializes nodes for loaded blocks. Unloaded existing rows
  // must not be classified as adds — CustomSSRMGrid / leaf dirty handlers
  // treat add as insert-or-purge and that reloads the grid every tick.
  if (isServerSideRowModel(api)) {
    return { add: [], update: [...rows] };
  }
  const add: LabRow[] = [];
  const update: LabRow[] = [];
  for (const row of rows) {
    const id = String(row[ID_FIELD]);
    if (api.getRowNode(id)) {
      update.push(row);
    } else {
      add.push(row);
    }
  }
  return { add, update };
}

/**
 * Apply a mock-provider delta through AG-Grid transactions instead of
 * replacing `rowData` on every tick. Returns the updated lab snapshot
 * (for scenarios / demo-console bookkeeping).
 *
 * SSRM: never call `setGridOption('rowData')` (invalid under server-side
 * row model). Full snapshots rely on React `rowData` → SSRMGrid. Ticks
 * should prefer `applyTx` (MarketsGridHandle.applyDataTransactionAsync).
 */
export function applyLabStreamDelta(
  api: GridApi | null,
  snapshot: readonly LabRow[],
  incoming: readonly LabRow[],
  replace: boolean,
  applyTx?: LabStreamApplyTx | null,
): LabRow[] {
  if (incoming.length === 0 && !replace) return snapshot as LabRow[];

  if (replace) {
    const next = [...incoming];
    if (api && !isServerSideRowModel(api)) {
      try {
        api.setGridOption('rowData', next);
      } catch {
        /* grid tearing down */
      }
    }
    return next;
  }

  const nextSnapshot = applyDelta(snapshot, incoming, ID_FIELD);

  if (!api && !applyTx) return nextSnapshot;

  const { add, update } = api
    ? splitTransaction(api, incoming)
    : { add: [...incoming], update: [] as LabRow[] };
  if (add.length === 0 && update.length === 0) return nextSnapshot;

  try {
    if (applyTx) {
      applyTx({ add, update });
    } else if (api) {
      api.applyTransactionAsync({ add, update });
    }
  } catch {
    /* grid tearing down */
  }

  return nextSnapshot;
}

/** Push a one-shot scenario overlay as row updates. */
export function applyLabRowUpdates(
  api: GridApi | null,
  updates: readonly LabRow[],
  applyTx?: LabStreamApplyTx | null,
): void {
  if (updates.length === 0) return;
  try {
    if (applyTx) {
      applyTx({ update: [...updates] });
    } else if (api) {
      api.applyTransactionAsync({ update: [...updates] });
    }
  } catch {
    /* grid tearing down */
  }
}

export function diffRowUpdates(before: readonly LabRow[], after: readonly LabRow[]): LabRow[] {
  const beforeById = new Map(before.map((r) => [r[ID_FIELD], r]));
  const updates: LabRow[] = [];
  for (const row of after) {
    const prev = beforeById.get(row[ID_FIELD]);
    if (!prev) {
      updates.push(row);
      continue;
    }
    if (!labRowsEqual(prev, row)) {
      updates.push(row);
    }
  }
  return updates;
}
