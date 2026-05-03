/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, DataPlane, theme, full-bleed
 * layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import type { ReactNode } from 'react';
import { HostedMarketsGrid } from '@marketsui/widgets-react/hosted';
import { dataPlaneClient } from '../data-plane-client';
import { openProviderEditorPopout } from '../data-providers-popout';

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
      dataPlaneClient={dataPlaneClient}
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
