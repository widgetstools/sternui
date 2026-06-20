/**
 * BlottersMarketsGridSsrm — route `/blotters/marketsgrid-ssrm`. The SAME
 * HostedMarketsGrid as `/blotters/marketsgrid`, but `rowModelType="serverSide"`
 * drives it through the hub-backed Server-Side Row Model: the grid holds only
 * its visible block, sort/filter/group/aggregate run in the hub, and updates +
 * the grand total stream live.
 *
 * No provider or grid-setting defaults are hardcoded — pick the data provider
 * and tune column/grid settings through the customizer (Custom Settings); the
 * choice persists per `gridId`.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useStarGridApp } from '@starui/app';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';

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
      gridId="star-demo-blotter-ssrm"
      // Hub-backed Server-Side Row Model — same provider config, block pulls.
      rowModelType="serverSide"
      onEditProvider={handleEditProvider}
    />
  );
}

export default BlottersMarketsGridSsrm;
