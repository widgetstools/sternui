/**
 * SSRM engine entry — CustomSSRMGrid from @wellsfargo-starui/ssrm-grid.
 * MarketsGrid SSRM uses the main-thread RowMirror engine only (no Perspective).
 */
export {
  CustomSSRMGrid,
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from '@wellsfargo-starui/ssrm-grid';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
  SSRMColDef,
  SSRMTransaction,
} from '@wellsfargo-starui/ssrm-grid';
/** Handle type for MarketsGrid's SSRM path. */
export type { CustomSSRMGridHandle as SSRMGridHandle } from '@wellsfargo-starui/ssrm-grid';

export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
