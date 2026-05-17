/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import { useCallback, type ReactNode } from "react";
import { HostedMarketsGrid } from "@starui/widgets-react/hosted";
import { useHost } from "@starui/host-wrapper-react";
import { dataServices } from "../dataServices.mainThread";
import { openProviderEditorPopout } from "../dataProvidersPopout";

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

function BlottersMarketsGrid(): ReactNode {
  // Runtime port (OpenFin or Browser) — used to open the data-provider
  // editor popout via the single transport-agnostic `openSurface()` API.
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
      defaultInstanceId="{{name}}-blotter"
      documentTitle="MarketsGrid · {{name}}"
      withStorage
      theme="auto"
      dataServices={dataServices}
      dataServicesMode="eager"
      gridId="{{name}}-blotter"
      onEditProvider={handleEditProvider}
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={DEFAULT_COL_DEF}
    />
  );
}

export default BlottersMarketsGrid;
