import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import { getPlatform } from './bootstrap.js';
import { gridEventHandlers } from './platform/gridEventHandlers.js';
import { gridHandlerMeta } from './platform/hooksMeta.js';
import { stompHistoricalProviderDraft, stompProviderDraft } from './stompProvider.js';

/**
 * Phase 3 — seed catalog row (programmatic, no provider editor UI).
 * Phase 4 — cfg-free grid attach via defaultLiveProviderId.
 *
 * Requires DataHubProvider ancestor (main.tsx) so useDataServices resolves.
 */
export function App() {
  // useDataServices — React context from DataHubProvider → DataServicesProvider.
  // configStore wraps main-thread ConfigManager (IndexedDB writes for provider rows).
  const { configStore } = useDataServices();

  // useUserIdFromContext — session user from DataHubProvider (matches app-config.json).
  const userId = useUserIdFromContext();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [historicalProviderId, setHistoricalProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // configStore.list — read STOMP providers from IndexedDB (main thread).
      const rows = await configStore.list(userId, { subtype: 'stomp' });
      const existing = rows.find((p) => p.name === stompProviderDraft.name);
      const existingHistorical = rows.find((p) => p.name === stompHistoricalProviderDraft.name);

      // configStore.save — persist data-provider row if missing; then
      // client.invalidateConfig() (inside save) reloads worker ConfigCatalogCache.
      const id =
        existing?.providerId ??
        (await configStore.save(stompProviderDraft, userId)).providerId;
      const histId =
        existingHistorical?.providerId ??
        (await configStore.save(stompHistoricalProviderDraft, userId)).providerId;

      if (!cancelled && id) setProviderId(id);
      if (!cancelled && histId) setHistoricalProviderId(histId);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  // Wait until catalog rows exist and worker cache has been invalidated.
  if (!providerId || !historicalProviderId) return null;

  // HostedMarketsGrid: cfg-free attach via defaultLiveProviderId; hub lazy-starts STOMP.
  // withStorage + configManager: grid layout via main-thread ConfigManager from getPlatform().
  return (
    <HostedMarketsGrid
      gridId="stomp-blotter"
      componentName="STOMP Positions"
      defaultInstanceId="stomp-blotter"
      defaultLiveProviderId={providerId}
      defaultHistoricalProviderId={historicalProviderId}
      historicalDateAppDataRef="positions.asOfDate"
      withStorage
      configManager={getPlatform().configManager}
      gridEventHandlers={gridEventHandlers}
      handlerMeta={gridHandlerMeta}
      showFiltersToolbar
      showFormattingToolbar
    />
  );
}
