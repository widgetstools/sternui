/**
 * BlottersMarketsGrid — hosts `<MarketsGridContainer>` at `/blotters/marketsgrid`.
 *
 * Pre-Phase D this view shipped its own `generateOrders(500)` synthetic
 * data. Now the local generator is gone — the grid receives rows from
 * the data plane via `<MarketsGridContainer>`, which subscribes to the
 * provider the user picks via `<DataProviderSelector>` and feeds AG-Grid
 * imperatively (snapshot batches → applyTransactionAsync({ add }),
 * realtime updates → applyTransactionAsync({ update })).
 *
 * Provider selection is persisted per `instanceId` in localStorage, so
 * each blotter window remembers what it was bound to. When no provider
 * is selected the grid renders an inline empty state with a picker —
 * no synthetic rows, ever.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataPlaneProvider } from '@marketsui/data-plane-react';
import { dataProviderConfigService } from '@marketsui/data-plane';
import { DataProviderSelector } from '@marketsui/widgets-react';
import { MarketsGridContainer } from '@marketsui/widgets-react/markets-grid-container';
import { useTheme } from '../context/ThemeContext';
import { HostedComponent } from '../components/HostedComponent';

// Bootstrap the config service against the configured backend so the
// <DataProviderSelector>'s `listVisible` query lands on the right URL.
// Mirrors what /views/DataProviders does so either entry point is
// independently usable.
const PROVIDER_API_URL =
  (import.meta.env.VITE_DATA_PROVIDER_API_URL as string | undefined) ||
  'http://localhost:3001';
dataProviderConfigService.configure({ apiUrl: PROVIDER_API_URL });

// ─── Default columns ──────────────────────────────────────────────────
//
// The container drives column shape via the provider's `columnDefinitions`
// (when present); these defaults only render when the provider's schema
// hasn't been authored yet, so the grid still has *something* to show.
// They're field-only — no synthetic data.

const defaultColumnDefs: ColDef[] = [
  { field: 'id', headerName: 'ID', initialWidth: 120, pinned: 'left', filter: 'agTextColumnFilter' },
];

const defaultColDef: ColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

// ─── AG-Grid theme variants ───────────────────────────────────────────

const sharedThemeParams = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  headerFontSize: 10,
  iconSize: 10,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder: false,
  columnBorder: true,
  spacing: 6,
  borderRadius: 0,
  wrapperBorderRadius: 0,
};

const darkTheme = themeQuartz.withParams({
  ...sharedThemeParams,
  backgroundColor: '#161a1e',
  foregroundColor: '#eaecef',
  headerBackgroundColor: '#1e2329',
  headerTextColor: '#a0a8b4',
  oddRowBackgroundColor: '#161a1e',
  rowHoverColor: '#1e2329',
  selectedRowBackgroundColor: '#14b8a614',
  borderColor: '#313944',
});

const lightTheme = themeQuartz.withParams({
  ...sharedThemeParams,
  backgroundColor: '#ffffff',
  foregroundColor: '#3b3b3b',
  headerBackgroundColor: '#f3f3f3',
  headerTextColor: '#616161',
  oddRowBackgroundColor: '#fafafa',
  rowHoverColor: '#f3f3f3',
  selectedRowBackgroundColor: '#0d948814',
  borderColor: '#e5e5e5',
});

// ─── Per-instance provider-id persistence ─────────────────────────────

function loadProviderId(instanceId: string): string | null {
  try {
    return localStorage.getItem(`mkt-blotter:${instanceId}:providerId`);
  } catch {
    return null;
  }
}

function saveProviderId(instanceId: string, providerId: string | null) {
  try {
    if (providerId === null) {
      localStorage.removeItem(`mkt-blotter:${instanceId}:providerId`);
    } else {
      localStorage.setItem(`mkt-blotter:${instanceId}:providerId`, providerId);
    }
  } catch {
    // localStorage unavailable (private mode etc.) — selection is
    // session-scoped only.
  }
}

function loadRowIdField(instanceId: string): string {
  try {
    return localStorage.getItem(`mkt-blotter:${instanceId}:rowIdField`) || 'id';
  } catch {
    return 'id';
  }
}

function saveRowIdField(instanceId: string, field: string) {
  try {
    localStorage.setItem(`mkt-blotter:${instanceId}:rowIdField`, field);
  } catch {
    /* noop */
  }
}

// ─── React Query client (one per route mount) ────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

// ─── Data-plane SharedWorker — built once per blotter mount ──────────
// Vite resolves this URL at build time; the file lives next to main.tsx.
const buildDataPlaneUrl = () => new URL('../dataPlaneWorker.ts', import.meta.url);

// ─── View ─────────────────────────────────────────────────────────────

const DEFAULT_INSTANCE_ID = 'markets-ui-reference-blotter';

function BlottersMarketsGrid() {
  return (
    <QueryClientProvider client={queryClient}>
      <HostedComponent
        componentName="MarketsGrid"
        defaultInstanceId={DEFAULT_INSTANCE_ID}
        documentTitle="MarketsGrid · Blotter"
        withStorage
      >
        {({ instanceId, storage, appId, userId }) =>
          instanceId == null || storage == null ? (
            <LoadingState message="Connecting to ConfigService…" />
          ) : (
            <BlotterShell
              instanceId={instanceId}
              storage={storage}
              appId={appId}
              userId={userId}
            />
          )
        }
      </HostedComponent>
    </QueryClientProvider>
  );
}

// ─── Inner shell — split out so DataPlaneProvider only mounts once
//     instanceId/storage are known. Keeping it inside HostedComponent's
//     children would re-instantiate the worker on every render. ───────

interface BlotterShellProps {
  instanceId: string;
  storage: unknown;
  appId: string;
  userId: string;
}

function BlotterShell({ instanceId, storage, appId, userId }: BlotterShellProps) {
  const { isDark } = useTheme();
  const agTheme = isDark ? darkTheme : lightTheme;
  const navigate = useNavigate();

  const [providerId, setProviderIdState] = useState<string | null>(() => loadProviderId(instanceId));
  const [rowIdField, setRowIdFieldState] = useState<string>(() => loadRowIdField(instanceId));

  // Hand off authoring to /dataproviders. We pass the picker's current
  // intent (`new` or the providerId being edited) as a query param so
  // a future enhancement can deep-link straight to the right row; the
  // editor ignores unknown params today and just lands on its empty
  // state, which is acceptable for the round-trip.
  const goToEditor = useCallback(
    (intent: 'new' | string) => {
      const qs = intent === 'new' ? '?intent=new' : `?intent=edit&providerId=${encodeURIComponent(intent)}`;
      navigate(`/dataproviders${qs}`);
    },
    [navigate],
  );

  const setProviderId = useCallback(
    (next: string | null) => {
      setProviderIdState(next);
      saveProviderId(instanceId, next);
    },
    [instanceId],
  );

  const setRowIdField = useCallback(
    (next: string) => {
      setRowIdFieldState(next);
      saveRowIdField(instanceId, next);
    },
    [instanceId],
  );

  // Memoise connectArgs so the provider doesn't reconnect on every render.
  const connectArgs = useMemo(
    () => ({
      url: buildDataPlaneUrl(),
      name: `mkt-data-plane:${appId}`,
      appId,
    }),
    [appId],
  );

  return (
    <DataPlaneProvider connect={connectArgs}>
      {/* Top strip — provider picker + row-id override. Always present
          so the user can swap providers without leaving the view. */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-card/50">
        <div className="flex-1 min-w-0">
          <DataProviderSelector
            userId={userId}
            value={providerId}
            onChange={setProviderId}
            placeholder="Pick a data provider…"
            onCreate={() => goToEditor('new')}
            onEdit={(p) => goToEditor(p.providerId ?? 'new')}
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Row id field:</span>
          <input
            value={rowIdField}
            onChange={(e) => setRowIdField(e.target.value)}
            className="h-7 w-24 rounded border border-border bg-background px-2 text-xs"
            placeholder="id"
          />
        </label>
      </div>

      <div className="flex-1 min-h-0">
        {providerId ? (
          <MarketsGridContainer
            providerId={providerId}
            rowIdField={rowIdField}
            gridId={instanceId}
            instanceId={instanceId}
            columnDefs={defaultColumnDefs}
            defaultColDef={defaultColDef}
            theme={agTheme}
            storage={storage as never}
            appId={appId}
            userId={userId}
            showFiltersToolbar
            showFormattingToolbar
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </DataPlaneProvider>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: 12,
        color: 'var(--bn-t2, #7a8494)',
      }}
    >
      {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center max-w-sm">
        <div className="text-sm font-medium mb-1">No data provider selected</div>
        <div className="text-xs text-muted-foreground">
          Pick a saved provider above, or create one from the Workspace
          Setup window. The blotter no longer ships synthetic data — every
          row comes from the data plane.
        </div>
      </div>
    </div>
  );
}

export default BlottersMarketsGrid;
