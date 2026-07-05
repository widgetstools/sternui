/**
 * MarketsCgrid — MarketsGrid pre-bound to the cgrid rendering engine.
 *
 * Drop-in: identical props/handle contract to MarketsGrid; the whole
 * platform (customizer, profiles, toolbars, providers) runs unchanged
 * behind the CGridApiAdapter. `surface` is fixed to 'cgrid'.
 */
import { forwardRef, type ReactElement, type RefAttributes } from 'react';
import { MarketsGrid } from '../widget/MarketsGrid.js';
import type { MarketsGridHandle, MarketsGridProps } from '../widget/types';

function MarketsCgridInner<TData = unknown>(
  props: Omit<MarketsGridProps<TData>, 'surface'>,
  ref: React.ForwardedRef<MarketsGridHandle>,
) {
  const Grid = MarketsGrid as (
    p: MarketsGridProps<TData> & RefAttributes<MarketsGridHandle>,
  ) => ReactElement;
  return <Grid {...(props as MarketsGridProps<TData>)} surface="cgrid" ref={ref} />;
}

export const MarketsCgrid = forwardRef(MarketsCgridInner) as <TData = unknown>(
  props: Omit<MarketsGridProps<TData>, 'surface'> & RefAttributes<MarketsGridHandle>,
) => ReactElement;
