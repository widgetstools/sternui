/**
 * MarketsCgrid — shared lazy binding for the cgrid surface.
 *
 * Both render paths (MarketsGridHost for the full-chrome widget,
 * MarketsGridCore for the chromeless one) branch to this element so the
 * cgrid engine ships as ONE lazy chunk that AG-only consumers never load.
 */
import { lazy, type ComponentType } from 'react';
import type { MarketsCgridSurfaceProps } from './MarketsCgridSurface';

export const MarketsCgridSurfaceLazy = lazy(() =>
  import('./MarketsCgridSurface').then((m) => ({
    default: m.MarketsCgridSurface as ComponentType<MarketsCgridSurfaceProps<Record<string, unknown>>>,
  })),
);
