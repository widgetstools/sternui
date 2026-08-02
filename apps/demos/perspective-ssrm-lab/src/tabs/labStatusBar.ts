import type { MarketsGridProps } from '@starui/grid';

/**
 * Default AG Grid status bar for lab feature grids.
 *
 * Named with AG's stock components on purpose. On the Perspective surface those
 * names are rewritten to panels that read the worker-held Table
 * (`withPerspectiveStatusPanels`), because AG's own row-count components render
 * NOTHING under a server row model and select-all answers `?`. So the same
 * config means the same thing on both surfaces, which is what status-bar parity
 * has to mean. `agAggregationComponent` is left as AG's: it aggregates the
 * selected cell RANGE, which the window holds.
 */
export const LAB_STATUS_BAR: NonNullable<MarketsGridProps['statusBar']> = {
  statusPanels: [
    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
    { statusPanel: 'agAggregationComponent', align: 'right' },
  ],
};
