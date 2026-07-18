import type { RowChangeSignal } from '@wellsfargo-starui/engine';
import type { EngineDataTransaction } from './routeDataTransactionAsync.js';

function rowIdOf(row: unknown, rowIdField: string): string | null {
  if (row == null) return null;
  if (typeof row === 'string' || typeof row === 'number') return String(row);
  if (typeof row === 'object' && rowIdField in (row as object)) {
    const id = (row as Record<string, unknown>)[rowIdField];
    if (id == null) return null;
    return String(id);
  }
  return null;
}

function mapRows(
  rows: unknown[] | undefined,
  rowIdField: string,
): Array<{ id: string; data?: Record<string, unknown> }> {
  if (!rows?.length) return [];
  const out: Array<{ id: string; data?: Record<string, unknown> }> = [];
  for (const row of rows) {
    const id = rowIdOf(row, rowIdField);
    if (!id) continue;
    out.push({
      id,
      data:
        typeof row === 'object' && row !== null
          ? (row as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
}

/**
 * Publish an SSRM transaction onto the shared RowChangeBus so alerts (and
 * other delta subscribers) see the same hot path as CSRM
 * `asyncTransactionsFlushed`.
 */
export function publishSsrmTransactionDelta(
  rows: RowChangeSignal | null | undefined,
  tx: EngineDataTransaction,
  rowIdField = 'id',
): void {
  // Must call as a method — extracting the function drops `this` on RowChangeBus.
  if (!rows?.publishExternalDelta) return;

  const updated = mapRows(tx.update, rowIdField);
  const added = mapRows(tx.add, rowIdField);
  const removed = mapRows(tx.remove, rowIdField);
  if (updated.length === 0 && added.length === 0 && removed.length === 0) {
    return;
  }
  rows.publishExternalDelta({ updated, added, removed });
}
