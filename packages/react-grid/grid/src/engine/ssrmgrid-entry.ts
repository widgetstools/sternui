/**
 * SSRM engine entry — Custom from @starui/ssrm-grid; Perspective from ssrmgrid.
 * AG Grid: both require 36.x. MarketsGrid CSRM historically used 35.1.
 * Strategy: align @starui/grid to ag-grid-community/enterprise/react 36.0.0
 * so one ModuleRegistry serves both surfaces.
 *
 * MarketsGrid surface defaults to CustomSSRMGrid (RowMirror). Perspective
 * SSRMGrid remains exported for opt-in (`ssrmEngine="perspective"`).
 */
export {
  CustomSSRMGrid,
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from '@starui/ssrm-grid';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
  SSRMColDef,
  SSRMTransaction,
} from '@starui/ssrm-grid';
/** Handle type for MarketsGrid's SSRM path (either engine). */
export type { CustomSSRMGridHandle as SSRMGridHandle } from '@starui/ssrm-grid';

export { SSRMGrid } from 'ssrmgrid';
export type { SSRMGridProps } from 'ssrmgrid';

export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
