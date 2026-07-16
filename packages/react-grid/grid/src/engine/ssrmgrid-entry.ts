/**
 * SSRM engine entry — re-exports ssrmgrid.
 * AG Grid: ssrmgrid requires 36.x. MarketsGrid CSRM historically used 35.1.
 * Strategy: align @starui/grid to ag-grid-community/enterprise/react 36.0.0
 * so one ModuleRegistry serves both surfaces.
 *
 * Default SSRM surface uses CustomSSRMGrid (RowMirror, no Perspective).
 * Perspective SSRMGrid remains exported for opt-in / large-book / pivot use.
 */
export { CustomSSRMGrid, SSRMGrid } from 'ssrmgrid';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
  SSRMGridProps,
  SSRMColDef,
  SSRMTransaction,
} from 'ssrmgrid';
/** Handle type for MarketsGrid's SSRM path (CustomSSRMGrid). */
export type { CustomSSRMGridHandle as SSRMGridHandle } from 'ssrmgrid';
export {
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from 'ssrmgrid';
export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
