/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
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
};

function BlottersMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();
  const handleEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
    },
    [runtime],
  );
  const handleOpenConfigBrowser = useCallback(() => {
    void runtime.openSurface({
      kind: 'popout',
      url: `${window.location.origin}/config-browser`,
      windowName: 'config-browser',
      width: 1100,
      height: 720,
    });
  }, [runtime]);

  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="star-demo-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      configManager={configManager}
      defaultLiveProviderId="dp-121e4569-5100-4f6b-b946-c3423d8aff7c"
      gridId="star-demo-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      onEditProvider={handleEditProvider}
      onOpenConfigBrowser={handleOpenConfigBrowser}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
      defaultColDef={DEFAULT_COL_DEF}
      // Color-link test: broadcast the selected row's key columns + values
      // (auto-derived from the provider's keyColumn / getRowId — no hardcoding)
      // and the group path for grouped selections, to color-linked peer grids.
      // Posts Notification Center messages — "sent" here, "acknowledged" on the
      // receiver. Open two of these blotters and link them by color (dock →
      // Link) to exercise it.
      contextLink={{
        enabled: true,
        mode: 'fields',
        notify: true,
        debug: true,
      }}
    />
  );
}

export default BlottersMarketsGrid;
