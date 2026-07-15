import type { SSRMGridHandle } from './ssrmgrid-entry.js';

export function applyTickToSsrm(
  handle: Pick<SSRMGridHandle, 'applyTransactionAsync'>,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) return;
  handle.applyTransactionAsync({ update: rows });
}
