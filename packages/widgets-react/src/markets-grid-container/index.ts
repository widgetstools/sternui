/**
 * MarketsGridContainer — feeds a MarketsGrid from the data plane.
 *
 * Optional peer: requires `@marketsui/markets-grid` to be installed by
 * the consumer. Hosts that don't use MarketsGrid skip this barrel and
 * the dep stays out of their tree.
 */

export { MarketsGridContainer } from './MarketsGridContainer.js';
export type { MarketsGridContainerProps } from './MarketsGridContainer.js';
