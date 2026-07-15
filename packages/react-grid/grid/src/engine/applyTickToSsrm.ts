import { isSsrmCapabilityEnabled } from './ssrmCapabilities.js';
import { recordSsrmTickDiffs } from './ssrmRowDiff.js';
import type { SSRMGridHandle } from './ssrmgrid-entry.js';

export function applyTickToSsrm(
  handle: Pick<SSRMGridHandle, 'applyTransactionAsync'>,
  rows: Record<string, unknown>[],
  options?: { rowIdField?: string },
): void {
  if (rows.length === 0) return;
  if (isSsrmCapabilityEnabled('oldNewDiff')) {
    recordSsrmTickDiffs(rows, options?.rowIdField);
  }
  handle.applyTransactionAsync({ update: rows });
}
