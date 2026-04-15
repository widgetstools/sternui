import React, { useState, useEffect, useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid, type ToolbarSlotConfig } from '@grid-customizer/markets-grid';
import { MarketsGrid as MarketsGridV2 } from '@grid-customizer/markets-grid-v2';
import { DexieAdapter } from '@grid-customizer/core';
import { DexieAdapter as DexieAdapterV2 } from '@grid-customizer/core-v2';
import { Sun, Moon, Database } from 'lucide-react';

import { generateOrders, type Order } from './data';

// ─── AG-Grid Themes ─────────────────────────────────────────────────────────

const sharedParams = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,       // primitives.typography.fontSize.sm (11px)
  headerFontSize: 10,  // primitives.typography.fontSize.xs + 1 (9+1=10)
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder: false,
  columnBorder: false,  // matches design-system/adapters/ag-grid.ts
  spacing: 6,
  borderRadius: 0,
  wrapperBorderRadius: 0,
};

const darkTheme = themeQuartz.withParams({
  ...sharedParams,
  backgroundColor: '#161a1e',
  foregroundColor: '#eaecef',
  headerBackgroundColor: '#1e2329',
  headerForegroundColor: '#a0a8b4',
  oddRowBackgroundColor: '#161a1e',
  rowHoverColor: '#1e2329',
  selectedRowBackgroundColor: '#14b8a614',
  borderColor: '#313944',
  rowBorderColor: '#31394499',
});

const lightTheme = themeQuartz.withParams({
  ...sharedParams,
  backgroundColor: '#ffffff',
  foregroundColor: '#3b3b3b',
  headerBackgroundColor: '#f3f3f3',
  headerForegroundColor: '#616161',
  oddRowBackgroundColor: '#fafafa',
  rowHoverColor: '#f3f3f3',
  selectedRowBackgroundColor: '#0d948814',
  borderColor: '#e5e5e5',
  rowBorderColor: '#e5e5e599',
});

// ─── Column Definitions (plain — no renderers, no formatters, no styles) ─────

const columnDefs: ColDef<Order>[] = [
  { field: 'id', headerName: 'Order ID', initialWidth: 120, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'time', headerName: 'Time', initialWidth: 100, filter: 'agTextColumnFilter' },
  { field: 'security', headerName: 'Security', initialWidth: 180, filter: 'agTextColumnFilter' },
  { field: 'side', headerName: 'Side', initialWidth: 70, filter: 'agSetColumnFilter' },
  { field: 'quantity', headerName: 'Qty', initialWidth: 100, filter: 'agNumberColumnFilter' },
  { field: 'price', headerName: 'Price', initialWidth: 100, filter: 'agNumberColumnFilter' },
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
  { field: 'currency', headerName: 'CCY', initialWidth: 70 },
  { field: 'settlementDate', headerName: 'Settle Date', initialWidth: 110 },
];

// ─── App ─────────────────────────────────────────────────────────────────────

// Read `?v=2` once at module load — switching versions requires a full reload
// because each version owns its own AG-Grid module registration + storage.
const useV2 = (() => {
  try {
    return new URLSearchParams(window.location.search).get('v') === '2';
  } catch { return false; }
})();

export function App() {
  const [rowData] = useState(() => generateOrders(500));
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('gc-theme') !== 'light'; }
    catch { return true; }
  });

  // Apply data-theme attribute to root and persist preference
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try { localStorage.setItem('gc-theme', isDark ? 'dark' : 'light'); }
    catch { /* */ }
  }, [isDark]);

  const theme = isDark ? darkTheme : lightTheme;

  // Persistent profile storage (IndexedDB) — enables the Profiles settings panel.
  // v2 gets its own adapter instance (different Dexie database name under the hood).
  const storageAdapter = useMemo(() => new DexieAdapter(), []);
  const storageAdapterV2 = useMemo(() => new DexieAdapterV2(), []);

  // Demo extra toolbars — placeholder content to showcase the switcher
  const extraToolbars: ToolbarSlotConfig[] = [
    {
      id: 'data',
      label: 'Data',
      color: 'var(--bn-blue, #3da0ff)',
      icon: <Database size={12} strokeWidth={1.75} />,
      content: (
        <div className="flex items-center gap-3 h-11 shrink-0 border-b border-border bg-card text-xs px-4">
          <Database size={14} strokeWidth={1.75} style={{ color: 'var(--bn-blue)' }} />
          <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
            Data connections, live subscriptions, and field mappings — coming soon
          </span>
        </div>
      ),
    },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)',
        gap: 12,
      }}>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          {rowData.length} orders{useV2 ? ' • v2' : ''}
        </span>
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
      </header>

      <div style={{ flex: 1 }}>
        {useV2 ? (
          <MarketsGridV2
            gridId="demo-blotter-v2"
            rowData={rowData}
            columnDefs={columnDefs}
            theme={theme}
            rowIdField="id"
            showFiltersToolbar={true}
            showFormattingToolbar={true}
            storageAdapter={storageAdapterV2}
            sideBar={{ toolPanels: ['columns', 'filters'] }}
            statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              ],
            }}
          />
        ) : (
          <MarketsGrid
            gridId="demo-blotter"
            rowData={rowData}
            columnDefs={columnDefs}
            theme={theme}
            rowIdField="id"
            showFiltersToolbar={true}
            storageAdapter={storageAdapter}
            extraToolbars={extraToolbars}
            sideBar={{ toolPanels: ['columns', 'filters'] }}
            statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              ],
            }}
          />
        )}
      </div>
    </div>
  );
}
