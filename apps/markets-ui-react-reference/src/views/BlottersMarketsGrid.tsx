/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import type { ReactNode } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { dataServices } from '../dataServices.mainThread';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

function BlottersMarketsGrid(): ReactNode {
  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="markets-ui-reference-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      dataServices={dataServices}
      // Eager hydration: the grid resolves `{{positions.asOfDate}}`
      // before first attach, so the cfg never reaches the worker
      // with an unresolved template. The route's outer <Suspense>
      // (in main.tsx) renders the loading fallback for the ~50ms
      // mirror snapshot round-trip.
      dataServicesMode="eager"
      gridId="markets-ui-reference-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      onEditProvider={(providerId) => openProviderEditorPopout({ providerId })}
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={DEFAULT_COL_DEF}
    />
  );
}

export default BlottersMarketsGrid;
