/**
 * BlottersMarketsGridSsrm — route `/blotters/marketsgrid-ssrm`. The SAME
 * HostedMarketsGrid + the SAME STOMP provider as `/blotters/marketsgrid`, but
 * `rowModelType="serverSide"` drives it through the hub-backed Server-Side Row
 * Model: the grid holds only its visible block, sort/filter/group/aggregate run
 * in the hub, and updates + the grand total stream live. Full toolbar/customizer
 * chrome, unlike the bare `/blotters/ssrm` POC.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useStarGridApp } from '@starui/app';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
  enableRowGroup: true,
};

function BlottersMarketsGridSsrm(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();
  const handleEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
    },
    [runtime],
  );

  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="star-demo-blotter-ssrm"
      documentTitle="MarketsGrid · SSRM Blotter"
      withStorage
      theme="auto"
      configManager={configManager}
      defaultLiveProviderId="dp-121e4569-5100-4f6b-b946-c3423d8aff7c"
      gridId="star-demo-blotter-ssrm"
      // Hub-backed Server-Side Row Model — same provider, block pulls.
      rowModelType="serverSide"
      onEditProvider={handleEditProvider}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
      defaultColDef={DEFAULT_COL_DEF}
    />
  );
}

export default BlottersMarketsGridSsrm;
