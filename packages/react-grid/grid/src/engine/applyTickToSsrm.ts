import type { RowChangeSignal } from '@starui/engine';
import { isSsrmCapabilityEnabled } from './ssrmCapabilities.js';
import {
  materializeCalcFields,
  type SsrmCalcMaterializeContext,
} from './ssrmCalcColumns.js';
import { recordSsrmTickDiffs } from './ssrmRowDiff.js';
import { publishSsrmTransactionDelta } from './ssrmRowChangeBridge.js';
import type { SSRMGridHandle } from './ssrmgrid-entry.js';

export function applyTickToSsrm(
  handle: Pick<SSRMGridHandle, 'applyTransactionAsync'>,
  rows: Record<string, unknown>[],
  options?: {
    rowIdField?: string;
    materialize?: SsrmCalcMaterializeContext | null;
    rowChangeBus?: RowChangeSignal | null;
  },
): void {
  if (rows.length === 0) return;
  const enriched =
    options?.materialize?.materializePlans.length && options.materialize.evalRow
      ? materializeCalcFields(rows, options.materialize.materializePlans, options.materialize.evalRow)
      : rows;
  if (isSsrmCapabilityEnabled('oldNewDiff')) {
    recordSsrmTickDiffs(enriched, options?.rowIdField);
  }
  handle.applyTransactionAsync({ update: enriched });
  publishSsrmTransactionDelta(
    options?.rowChangeBus,
    { update: enriched },
    options?.rowIdField ?? 'id',
  );
}
