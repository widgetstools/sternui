/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useHost } from '@starui/host-wrapper-react';
import { dataServices } from '../dataServices.mainThread';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

function BlottersMarketsGrid(): ReactNode {
  // Runtime port (OpenFin or Browser) — used to open the data-provider
  // editor popout via the single transport-agnostic `openSurface()` API.
  // The previous `isOpenFin()` branching inside `dataProvidersPopout`
  // is gone; the helper delegates to whichever runtime is mounted.
  const { runtime } = useHost();
  const handleEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
    },
    [runtime],
  );

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
      onEditProvider={handleEditProvider}
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={DEFAULT_COL_DEF}
    />
  );
}

export default BlottersMarketsGrid;
