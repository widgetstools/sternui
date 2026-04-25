/**
 * BlottersMarketsGrid — hosts `<MarketsGrid>` at `/blotters/marketsgrid`.
 *
 * Self-contained so it can run both standalone in the dev server AND
 * in an OpenFin view without coupling to the rest of the reference
 * app (the other views run in their own OpenFin windows with no
 * shared state anyway).
 *
 * Storage path:
 *   • Inside the OpenFin platform, `getConfigManager()` resolves to the
 *     same `ConfigManager` singleton the platform provider initialized in
 *     `initWorkspace()` — so grid profiles land in the same `marketsui-config`
 *     Dexie database (and the same REST sync queue, when wired) as the
 *     dock config, registry, user profile, etc. They show up in the
 *     Config Browser; they sync alongside everything else.
 *   • Standalone (vite dev with no OpenFin), `getConfigManager()` lazily
 *     creates a fallback ConfigManager that points at the same Dexie DB —
 *     identical persistence shape, just no platform-provider singleton
 *     to share with.
 *
 * Theming flows through the ambient `<ThemeProvider>` in main.tsx:
 * the provider flips `[data-theme]` on `<html>` so the design-system
 * CSS-var palette resolves correctly under MarketsGrid's shadcn
 * primitives. AG-Grid's own Quartz theme is switched between
 * dark/light variants here based on the same signal.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import {
  createConfigServiceStorage,
  type ConfigManager,
} from '@marketsui/config-service';
import { getConfigManager } from '@marketsui/openfin-platform';
import { useTheme } from '../context/ThemeContext';

// ─── Row shape + synthetic data ───────────────────────────────────────

type Order = {
  id: string;
  time: string;
  security: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  yield: number;
  spread: number;
  filled: number;
  status: 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled';
  venue: string;
  counterparty: string;
  account: string;
  desk: string;
  trader: string;
  notional: number;
  currency: string;
  settlementDate: string;
};

const INSTRUMENTS = [
  'UST 10Y 4.25 05/35', 'UST 2Y 4.75 04/27', 'UST 30Y 4.00 02/55',
  'BUND 10Y 2.30 02/34', 'BUND 5Y 2.50 10/29', 'GILT 10Y 4.25 07/34',
  'AAPL 3.85 05/43', 'MSFT 4.20 02/34', 'GOOGL 4.10 08/30',
  'JPM 4.875 07/33', 'BAC 4.75 01/34',
];
const SIDES: Order['side'][] = ['Buy', 'Sell'];
const STATUSES: Order['status'][] = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'];
const VENUES = ['MarketAxess', 'Tradeweb', 'Bloomberg TSOX', 'TruMid'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Bank of America', 'Citi'];
const DESKS = ['Rates', 'Credit', 'FX', 'Equities'];
const TRADERS = ['J.Smith', 'A.Jones', 'K.Patel', 'M.Chen', 'R.Davis'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY'];
const ACCOUNTS = ['PROP-1', 'PROP-2', 'HEDGE-A', 'HEDGE-B', 'CLIENT-DESK'];

function generateOrders(n: number): Order[] {
  const rows: Order[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const qty = Math.round((100 + Math.random() * 9900) / 100) * 100;
    const price = 95 + Math.random() * 10;
    rows.push({
      id: `ORD-${(i + 1).toString().padStart(5, '0')}`,
      time: new Date(now.getTime() - Math.random() * 8 * 3600 * 1000).toISOString().slice(11, 19),
      security: INSTRUMENTS[i % INSTRUMENTS.length],
      side: SIDES[i % SIDES.length],
      quantity: qty,
      price: Number(price.toFixed(4)),
      yield: Number((3 + Math.random() * 3).toFixed(3)),
      spread: Number((Math.random() * 150).toFixed(1)),
      filled: Math.random() < 0.6 ? qty : Math.floor(qty * Math.random()),
      status: STATUSES[i % STATUSES.length],
      venue: VENUES[i % VENUES.length],
      counterparty: COUNTERPARTIES[i % COUNTERPARTIES.length],
      account: ACCOUNTS[i % ACCOUNTS.length],
      desk: DESKS[i % DESKS.length],
      trader: TRADERS[i % TRADERS.length],
      notional: qty * price,
      currency: CURRENCIES[i % CURRENCIES.length],
      settlementDate: new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return rows;
}

// ─── AG-Grid theme variants (mirrors the demo-react scaffold) ──────────

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

// ─── Column definitions ───────────────────────────────────────────────

const columnDefs: ColDef<Order>[] = [
  { field: 'id', headerName: 'Order ID', initialWidth: 120, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'time', headerName: 'Time', initialWidth: 100, filter: 'agTextColumnFilter' },
  { field: 'security', headerName: 'Security', initialWidth: 200, filter: 'agTextColumnFilter' },
  { field: 'side', headerName: 'Side', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'quantity', headerName: 'Qty', initialWidth: 100, filter: 'agNumberColumnFilter' },
  {
    field: 'price',
    headerName: 'Price',
    initialWidth: 100,
    filter: 'agNumberColumnFilter',
    editable: true,
    cellEditor: 'agNumberCellEditor',
    cellEditorParams: { min: 0, precision: 4 },
    cellDataType: 'number',
  },
  { field: 'yield', headerName: 'Yield', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'spread', headerName: 'Spread', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'filled', headerName: 'Filled', initialWidth: 90, filter: 'agNumberColumnFilter' },
  { field: 'status', headerName: 'Status', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'venue', headerName: 'Venue', initialWidth: 140, filter: 'agSetColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', initialWidth: 150, filter: 'agSetColumnFilter' },
  { field: 'account', headerName: 'Account', initialWidth: 120, filter: 'agSetColumnFilter' },
  { field: 'desk', headerName: 'Desk', initialWidth: 100, filter: 'agSetColumnFilter' },
  { field: 'trader', headerName: 'Trader', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'notional', headerName: 'Notional', initialWidth: 130, filter: 'agNumberColumnFilter' },
  { field: 'currency', headerName: 'CCY', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'settlementDate', headerName: 'Settle', initialWidth: 110, filter: 'agTextColumnFilter' },
];

const defaultColDef: ColDef<Order> = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

// ─── View ─────────────────────────────────────────────────────────────

const GRID_ID = 'markets-ui-reference-blotter';

/**
 * App and user identity used for ConfigService scoping.
 *
 * These match the seeded values shipped in
 * `apps/markets-ui-react-reference/public/seed-config.json`:
 *   • appRegistry  → "TestApp"
 *   • userProfiles → "dev1"  (scoped to TestApp, role: admin/developer)
 *
 * Same `(appId, userId)` is used by the OpenFin platform provider for
 * the dock + registry, so the blotter's profile rows live in the same
 * scope bucket and show up together in the Config Browser.
 *
 * Replace `dev1` with the signed-in user's id when real auth lands;
 * `TestApp` should track whatever the appRegistry seed declares.
 */
const APP_ID = 'TestApp';
const USER_ID = 'dev1';

function BlottersMarketsGrid() {
  const { isDark } = useTheme();

  // Seed a small synthetic dataset once on mount so the blotter has
  // something meaningful to render. A real blotter would plug a
  // data-plane provider in via `@marketsui/data-plane-react`.
  const [rowData] = useState(() => generateOrders(500));

  // Resolve the shared ConfigManager once on mount. Inside OpenFin this
  // returns the platform provider's singleton; standalone it lazily
  // creates a fallback pointing at the same Dexie database. Either
  // way the blotter writes into `marketsui-config` and shows up in the
  // Config Browser alongside dock + registry rows.
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);
  useEffect(() => {
    let cancelled = false;
    getConfigManager()
      .then((cm) => { if (!cancelled) setConfigManager(cm); })
      .catch((err) => {
        console.error('[BlottersMarketsGrid] Failed to resolve ConfigManager:', err);
      });
    return () => { cancelled = true; };
  }, []);

  // ConfigService-backed StorageAdapterFactory. Memoised on the
  // resolved configManager so MarketsGrid's storage closure is stable
  // (re-creating it on every render would re-load profiles unnecessarily).
  const storage = useMemo(
    () => (configManager ? createConfigServiceStorage({ configManager }) : null),
    [configManager],
  );

  const gridApiRef = useRef<GridApi<Order> | null>(null);
  const handleGridReady = useCallback((ev: GridReadyEvent<Order>) => {
    gridApiRef.current = ev.api;
  }, []);

  // Keep AG-Grid's theme in sync with the ambient theme context.
  // `data-theme` on <html> is already flipped by ThemeProvider;
  // AG-Grid needs its own programmatic theme object passed via prop.
  const agTheme = isDark ? darkTheme : lightTheme;

  // Document title — helps when hosting as an OpenFin view.
  useEffect(() => {
    const prev = document.title;
    document.title = 'MarketsGrid · Blotter';
    return () => { document.title = prev; };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--bn-bg)',
        color: 'var(--bn-t0)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid var(--bn-border, #313944)',
          background: 'var(--bn-bg1, #161a1e)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bn-t0)' }}>
            MarketsGrid
          </span>
          <span style={{ fontSize: 10, color: 'var(--bn-t2, #7a8494)' }}>
            /blotters/marketsgrid · {rowData.length} rows · gridId: {GRID_ID} · appId: {APP_ID} · user: {USER_ID}
          </span>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        {storage ? (
          <MarketsGrid<Order>
            gridId={GRID_ID}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            theme={agTheme}
            // ConfigService-backed storage — same Dexie DB and same
            // (appId, userId) scope as the dock + registry rows the
            // provider writes via initWorkspace().
            storage={storage}
            appId={APP_ID}
            userId={USER_ID}
            onGridReady={handleGridReady}
            // Toolbars default to `false` — opt in explicitly so the
            // filter pill row and formatter toolbar (floating pill on
            // the filters bar) render. Matches demo-react's default UX.
            showFiltersToolbar
            showFormattingToolbar
          />
        ) : (
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
            Connecting to ConfigService…
          </div>
        )}
      </div>
    </div>
  );
}

export default BlottersMarketsGrid;
