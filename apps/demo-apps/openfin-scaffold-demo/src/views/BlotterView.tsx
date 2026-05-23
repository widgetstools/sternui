/**
 * Hosted MarketsGrid blotter — the primary grid integration sample.
 *
 * Registered in manifest `customSettings.apps` as "Markets Blotter".
 * OpenFin view URL: `/views/blotter` (see `public/views/blotter.fin.json`).
 *
 * First-time setup (optional — or import starter config):
 *   Import `public/config/star-spg-starter.appConfig.json` via Config Browser
 *   (see README). That seeds `positions.dp` (STOMP) and binds this instance.
 *   Otherwise: Dock → Tools → Data Providers → create a provider, then pick it
 *   in the grid toolbar.
 */
import { useCallback, useEffect } from 'react';
import type { MarketsGridHandle } from '@starui/grid';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useStarGridApp } from '@starui/app';
import { dataServices } from '../dataServices.mainThread';
import {
  applyFiBlotterOnGridReady,
  ensureFiBlotterProfileRow,
} from '../fiBlotterProfile.js';
import { openProviderEditorPopout } from '../openProviderEditorPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

export default function BlotterView() {
  const { runtime } = useStarGridApp();

  useEffect(() => {
    void ensureFiBlotterProfileRow(dataServices.configManager);
  }, []);

  const onGridReady = useCallback((handle: MarketsGridHandle) => {
    void applyFiBlotterOnGridReady(handle, dataServices.configManager);
  }, []);

  const onEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
    },
    [runtime],
  );

  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="openfin-scaffold-blotter"
      documentTitle="Blotter · OpenFin Scaffold"
      withStorage
      theme="auto"
      dataServices={dataServices}
      dataServicesMode="eager"
      gridId="openfin-scaffold-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      onEditProvider={onEditProvider}
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={DEFAULT_COL_DEF}
      onReady={onGridReady}
    />
  );
}
