/**
 * SSRM engine entry — re-exports ssrmgrid.
 * AG Grid: ssrmgrid requires 36.x. MarketsGrid CSRM historically used 35.1.
 * Strategy: align @starui/grid to ag-grid-community/enterprise/react 36.0.0
 * so one ModuleRegistry serves both surfaces.
 */
export { SSRMGrid } from 'ssrmgrid';
export type { SSRMGridHandle, SSRMGridProps, SSRMColDef, SSRMTransaction } from 'ssrmgrid';
export {
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from 'ssrmgrid';
export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
