import { forwardRef } from 'react';
import type { SSRMGridHandle } from './ssrmgrid-entry.js';
import {
  SsrmMarketsGridSurface,
  type SsrmMarketsGridSurfaceProps,
} from './SsrmMarketsGridSurface.js';
import { useSsrmRowKeepExpression } from './useSsrmRowKeepExpression.js';

/**
 * SsrmMarketsGridSurface + live row-exclusion keep expression from
 * toolbar-date-settings. Must render under GridProvider.
 */
export const SsrmMarketsGridSurfaceConnected = forwardRef<
  SSRMGridHandle,
  SsrmMarketsGridSurfaceProps
>(function SsrmMarketsGridSurfaceConnected(props, ref) {
  const rowKeepExpression = useSsrmRowKeepExpression();
  return (
    <SsrmMarketsGridSurface
      ref={ref}
      {...props}
      rowKeepExpression={rowKeepExpression ?? props.rowKeepExpression}
    />
  );
});
