/**
 * SSRM engine entry — SsrmGrid from @wellsfargo-starui/ssrm-grid.
 * MarketsGrid SSRM uses the main-thread RowMirror engine only (no Perspective).
 */
export {
  SsrmGrid,
  createPerspectiveEngine,
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from '@wellsfargo-starui/ssrm-grid';
export type {
  SsrmGridHandle,
  SsrmGridProps,
  SsrmEngine,
  PerspectiveClient,
  SSRMColDef,
  SSRMTransaction,
} from '@wellsfargo-starui/ssrm-grid';
/** Handle type for MarketsGrid's SSRM path. */
export type { SsrmGridHandle as SSRMGridHandle } from '@wellsfargo-starui/ssrm-grid';

export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
