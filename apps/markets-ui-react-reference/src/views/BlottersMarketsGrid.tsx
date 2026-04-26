/**
 * BlottersMarketsGrid — hosts `<MarketsGrid>` at `/blotters/marketsgrid`.
 *
 * Implementation: a thin wrapper that delegates the hosting chrome
 * (debug overlay, instance-id resolution, ConfigManager + storage
 * factory) to the generic `<HostedComponent>` and only owns the
 * blotter-specific concerns (synthetic data, AG-Grid theme, column
 * defs).
 *
 * See `apps/markets-ui-react-reference/src/components/HostedComponent.tsx`
 * for what the wrapper provides, and the root README's "Hosting
 * components in the reference app" section for the canonical pattern.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import { useTheme } from '../context/ThemeContext';
import { HostedComponent } from '../components/HostedComponent';

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

const DEFAULT_INSTANCE_ID = 'markets-ui-reference-blotter';

function BlottersMarketsGrid() {
  const { isDark } = useTheme();

  // Seed a small synthetic dataset once on mount so the blotter has
  // something meaningful to render. A real blotter would plug a
  // data-plane provider in via `@marketsui/data-plane-react`.
  const [rowData] = useState(() => generateOrders(500));

  const gridApiRef = useRef<GridApi<Order> | null>(null);
  const handleGridReady = useCallback((ev: GridReadyEvent<Order>) => {
    gridApiRef.current = ev.api;
  }, []);

  // Keep AG-Grid's theme in sync with the ambient theme context.
  // `data-theme` on <html> is already flipped by ThemeProvider;
  // AG-Grid needs its own programmatic theme object passed via prop.
  const agTheme = isDark ? darkTheme : lightTheme;

  // Suppress the unused-effect lint noise — the grid api ref is kept
  // for future imperative calls (api.exportDataAsCsv etc).
  useEffect(() => {}, []);

  return (
    <HostedComponent
      componentName="MarketsGrid"
      defaultInstanceId={DEFAULT_INSTANCE_ID}
      documentTitle="MarketsGrid · Blotter"
      withStorage
    >
      {({ instanceId, storage, appId, userId }) =>
        instanceId == null || storage == null ? (
          <LoadingState />
        ) : (
          <MarketsGrid<Order>
            // gridId AND instanceId both flow from the host-resolved
            // per-instance id, so every blotter instance writes to its
            // own ConfigService row keyed by `(appId, userId, instanceId)`.
            gridId={instanceId}
            instanceId={instanceId}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            theme={agTheme}
            storage={storage}
            appId={appId}
            userId={userId}
            onGridReady={handleGridReady}
            // Toolbars default to `false` — opt in explicitly so the
            // filter pill row and formatter toolbar (floating pill on
            // the filters bar) render. Matches demo-react's default UX.
            showFiltersToolbar
            showFormattingToolbar
          />
        )
      }
    </HostedComponent>
  );
}

function LoadingState() {
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
      Connecting to ConfigService…
    </div>
  );
}

export default BlottersMarketsGrid;
