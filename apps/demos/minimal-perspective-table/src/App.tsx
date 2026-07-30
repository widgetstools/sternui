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
 * Opt-in surfaces for the two features that have no default UI to reach them.
 *
 * `?tree=region,desk` mounts AG's SSRM tree mode over that hierarchy;
 * `?detail=1` makes every leaf row expandable onto the other positions in its
 * book. Both are read from the same worker-held Table, so they are exactly the
 * thing worth demonstrating — a hierarchy and a detail grid over a book this
 * window does not hold. Query-param rather than always-on because the default
 * demo is deliberately the plainest possible blotter.
 */
function readSearchFlags() {
  const params = new URLSearchParams(
    typeof window === 'undefined' ? '' : window.location.search,
  );
  const tree = (params.get('tree') ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  return { tree, detail: params.get('detail') === '1' };
}

const MASTER_DETAIL = {
  detailColumnDefs: [
    { field: 'positionId', headerName: 'Position' },
    { field: 'ticker', headerName: 'Ticker' },
    { field: 'trader', headerName: 'Trader' },
    { field: 'quantity', headerName: 'Quantity' },
    { field: 'pnl', headerName: 'P&L' },
  ],
  // Detail column id -> master column id. Every position in the same book.
  matchFields: { bookName: 'bookName' },
  detailLimit: 200,
};

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
  const [flags] = useState(readSearchFlags);

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
      perspectiveTreeFields={flags.tree.length > 0 ? flags.tree : undefined}
      masterDetail={flags.detail ? MASTER_DETAIL : undefined}
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
