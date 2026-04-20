import { useState, useEffect, useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid } from '@grid-customizer/markets-grid';
import { DexieAdapter } from '@grid-customizer/core';
import { Sun, Moon } from 'lucide-react';

import { generateOrders, type Order } from './data';
import { Dashboard } from './Dashboard';

type View = 'single' | 'dashboard';

/**
 * Initial view comes from `?view=dashboard` (falls back to single).
 * Captured ONCE on mount so a runtime toggle doesn't round-trip the
 * URL — the header button updates both state AND the URL in place via
 * `history.replaceState`.
 */
function initialView(): View {
  if (typeof window === 'undefined') return 'single';
  const q = new URLSearchParams(window.location.search);
  return q.get('view') === 'dashboard' ? 'dashboard' : 'single';
}

// ─── AG-Grid Themes ─────────────────────────────────────────────────────────

const sharedParams = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,       // primitives.typography.fontSize.sm (11px)
  headerFontSize: 10,  // primitives.typography.fontSize.xs + 1 (9+1=10)
  // Scale AG-Grid's built-in glyphs (sort arrow, filter funnel, menu
  // hamburger, sidebar chevrons, etc.) down to match the dense FI
  // blotter type stack. Applies to both light and dark variants.
  iconSize: 10,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder: false,
  columnBorder: true,
  spacing: 6,
  borderRadius: 0,
  wrapperBorderRadius: 0,
};

const darkTheme = themeQuartz.withParams({
  ...sharedParams,
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
  ...sharedParams,
  backgroundColor: '#ffffff',
  foregroundColor: '#3b3b3b',
  headerBackgroundColor: '#f3f3f3',
  headerTextColor: '#616161',
  oddRowBackgroundColor: '#fafafa',
  rowHoverColor: '#f3f3f3',
  selectedRowBackgroundColor: '#0d948814',
  borderColor: '#e5e5e5',
});

// ─── Column Definitions (plain — no renderers, no formatters, no styles) ─────

const columnDefs: ColDef<Order>[] = [
  { field: 'id', headerName: 'Order ID', initialWidth: 120, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'time', headerName: 'Time', initialWidth: 100, filter: 'agTextColumnFilter' },
  { field: 'security', headerName: 'Security', initialWidth: 180, filter: 'agTextColumnFilter' },
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
  { field: 'status', headerName: 'Status', initialWidth: 100, filter: 'agSetColumnFilter' },
  { field: 'venue', headerName: 'Venue', initialWidth: 120, filter: 'agSetColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', initialWidth: 140, filter: 'agSetColumnFilter' },
  { field: 'account', headerName: 'Account', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'desk', headerName: 'Desk', initialWidth: 90, filter: 'agSetColumnFilter' },
  { field: 'trader', headerName: 'Trader', initialWidth: 110, filter: 'agSetColumnFilter' },
  { field: 'notional', headerName: 'Notional', initialWidth: 120, filter: 'agNumberColumnFilter' },
  { field: 'currency', headerName: 'CCY', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'settlementDate', headerName: 'Settle Date', initialWidth: 110, filter: 'agTextColumnFilter' },
];

// Every column gets a floating filter by default; columns set their specific
// filter type (text/number/set) on the column def itself.
const defaultColDef: ColDef<Order> = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

// ─── App ─────────────────────────────────────────────────────────────────────

export function App() {
  return <AppInner />;
}

function AppInner() {
  const [rowData] = useState(() => generateOrders(500));
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('gc-theme') !== 'light'; }
    catch { return true; }
  });
  const [view, setView] = useState<View>(initialView);

  // Apply data-theme attribute to root and persist preference
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('gc-theme', isDark ? 'dark' : 'light'); }
    catch { /* */ }
  }, [isDark]);

  // Reflect the view in the URL so reloads / shared links land in the
  // same mode. `replaceState` to avoid polluting browser history on
  // every toggle.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (view === 'dashboard') q.set('view', 'dashboard');
    else q.delete('view');
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [view]);

  const theme = isDark ? darkTheme : lightTheme;

  const storageAdapter = useMemo(() => new DexieAdapter(), []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)',
        gap: 12,
      }}>
        {/* View switcher — Single Grid vs Dashboard. Pins the demo to
            one of the two reference layouts that the e2e suites cover. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-testid="view-switcher">
          <ViewTab active={view === 'single'} onClick={() => setView('single')} testId="view-tab-single">
            Single grid
          </ViewTab>
          <ViewTab active={view === 'dashboard'} onClick={() => setView('dashboard')} testId="view-tab-dashboard">
            Two-grid dashboard
          </ViewTab>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'single' && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {rowData.length} orders
            </span>
          )}
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--secondary)',
              color: 'var(--foreground)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </button>
        </div>
      </header>

      {view === 'single' ? (
        <div style={{ flex: 1 }}>
          <MarketsGrid
            gridId="demo-blotter-v2"
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            theme={theme}
            rowIdField="id"
            storageAdapter={storageAdapter}
            showFiltersToolbar
            showFormattingToolbar
            sideBar={{ toolPanels: ['columns', 'filters'] }}
            statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              ],
            }}
          />
        </div>
      ) : (
        <Dashboard theme={theme} columnDefs={columnDefs} defaultColDef={defaultColDef} />
      )}
    </div>
  );
}

function ViewTab({
  children,
  active,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: "'IBM Plex Sans', sans-serif",
        borderRadius: 4,
        border: '1px solid',
        borderColor: active ? 'var(--bn-green, #2dd4bf)' : 'var(--border)',
        color: active ? 'var(--bn-green, #2dd4bf)' : 'var(--muted-foreground)',
        background: active ? 'color-mix(in srgb, var(--bn-green, #2dd4bf) 14%, transparent)' : 'transparent',
        cursor: 'pointer',
        transition: 'all 120ms',
      }}
    >
      {children}
    </button>
  );
}
