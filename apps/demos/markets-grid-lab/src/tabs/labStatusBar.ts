import type { MarketsGridProps } from '@wellsfargo-starui/grid';

/**
 * Default AG Grid status bar for lab feature grids (CSRM).
 * Under SSRM, MarketsGrid omits this prop so SSRMGrid's server-side
 * row-count panel is used instead (CSRM count components render blank).
 */
export const LAB_STATUS_BAR: NonNullable<MarketsGridProps['statusBar']> = {
  statusPanels: [
    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
    { statusPanel: 'agAggregationComponent', align: 'right' },
  ],
};
