import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import { getPlatform } from './bootstrap.js';
import { gridEventHandlers } from './platform/gridEventHandlers.js';
import { gridHandlerMeta } from './platform/hooksMeta.js';
import {
  perspectiveProviderDraft,
  PERSPECTIVE_PROVIDER_CFG_VERSION,
  PERSPECTIVE_PROVIDER_ID,
} from './perspectiveProvider.js';

const CFG_VERSION_KEY = 'minimal-perspective-table.cfg-version';

/**
 * Seed the catalog row, then hand its id to the grid.
 *
 * Deliberately the SAME shape as `stomp-marketsgrid-minimal`: seed a provider,
 * pass `defaultLiveProviderId`, let the library do the rest. The only line that
 * differs is `rowModel="perspective"`, and that is the point — the pull path is
 * a row supply, not a different application.
 *
 * There is no second historical provider here. Historical mode swaps a
 * date-templated provider, which is orthogonal to where the book lives; the
 * plain STOMP demo already covers it and carrying it would only blur what is
 * being demonstrated.
 */
export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp-perspective' });
      const exists = rows.some((p) => p.providerId === PERSPECTIVE_PROVIDER_ID);
      const storedVersion = localStorage.getItem(CFG_VERSION_KEY);
      const shouldRefresh = storedVersion !== String(PERSPECTIVE_PROVIDER_CFG_VERSION);

      if (shouldRefresh || !exists) {
        await configStore.save(perspectiveProviderDraft, userId);
        localStorage.setItem(CFG_VERSION_KEY, String(PERSPECTIVE_PROVIDER_CFG_VERSION));
      }

      if (!cancelled) setProviderId(PERSPECTIVE_PROVIDER_ID);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  if (!providerId) return null;

  return (
    <HostedMarketsGrid
      gridId="perspective-blotter"
      componentName="Positions (Perspective)"
      defaultInstanceId="perspective-blotter"
      defaultLiveProviderId={providerId}
      // The whole switch. The container attaches to the provider's worker-held
      // Table and mounts AG Grid on the server-side row model against it;
      // toolbar, formatting, customizer, profiles and column defs are the ones
      // every other MarketsGrid gets.
      rowModel="perspective"
      withStorage
      configManager={getPlatform().configManager}
      gridEventHandlers={gridEventHandlers}
      handlerMeta={gridHandlerMeta}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
    />
  );
}
