import React, { useState, useEffect, useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz, iconSetMaterial } from 'ag-grid-community';
import { MarketsGrid, type ToolbarSlotConfig } from '@grid-customizer/markets-grid';
import { MarketsGrid as MarketsGridV2 } from '@grid-customizer/markets-grid-v2';
import { DexieAdapter } from '@grid-customizer/core';
import { DexieAdapter as DexieAdapterV2 } from '@grid-customizer/core-v2';
import { Sun, Moon, Database } from 'lucide-react';

import { generateOrders, type Order } from './data';

// ─── AG-Grid Themes ─────────────────────────────────────────────────────────
//
// MarketsUI — Bloomberg Charcoal (dark) + Warm Parchment (light). Both
// tuned for 10-hour FI trading sessions: warm neutral charcoal and a
// low-strain parchment. Icon set swapped to Material for a denser,
// more telemetry-ready glyph shelf.

const darkTheme = themeQuartz
  .withPart(iconSetMaterial)
  .withParams({
    // Base canvas
    backgroundColor: '#1a1d21',
    foregroundColor: '#e8e8e8',
    browserColorScheme: 'dark',

    // Chrome — derived from foreground for consistency across surfaces
    chromeBackgroundColor: {
      ref: 'foregroundColor',
      mix: 0.06,
      onto: 'backgroundColor',
    },

    // Typography
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 12,

    // Density — FI blotter
    spacing: 4,
    rowHeight: 28,
    headerHeight: 32,

    // Shapes
    borderRadius: 2,
    wrapperBorderRadius: 4,
    cellHorizontalPadding: 10,

    // Header
    headerBackgroundColor: '#23272d',
    headerTextColor: '#9aa0a8',
    headerFontWeight: 600,
    headerColumnBorder: { color: '#363b44' },
    headerColumnResizeHandleColor: '#5c6472',

    // Rows
    rowBorder: { color: '#2a2e35', style: 'solid', width: 1 },
    oddRowBackgroundColor: {
      ref: 'foregroundColor',
      mix: 0.03,
      onto: 'backgroundColor',
    },
    rowHoverColor: {
      ref: 'foregroundColor',
      mix: 0.08,
      onto: 'backgroundColor',
    },
    selectedRowBackgroundColor: 'rgba(240, 185, 11, 0.10)',

    // Cells
    cellTextColor: '#e8e8e8',
    // (Horizontal cell borders are controlled via `rowBorder` in v35 Quartz;
    // vertical separators are enabled below.)
    columnBorder: true,

    // Borders
    borderColor: '#363b44',
    wrapperBorder: { color: '#363b44' },

    // Accent — Binance amber
    accentColor: '#f0b90b',
    rangeSelectionBackgroundColor: 'rgba(240, 185, 11, 0.12)',
    rangeSelectionBorderStyle: 'solid',
    rangeSelectionBorderColor: '#f0b90b',
    rangeSelectionChartBackgroundColor: 'rgba(240, 185, 11, 0.08)',
    rangeSelectionChartCategoryBackgroundColor: 'rgba(240, 185, 11, 0.05)',

    // Inputs
    inputBackgroundColor: '#181c21',
    inputBorder: { color: '#363b44' },
    inputTextColor: '#e8e8e8',
    inputFocusBorder: { color: '#f0b90b' },
    inputPlaceholderTextColor: '#5c6472',
    inputDisabledBackgroundColor: '#1a1d21',
    inputDisabledTextColor: '#5c6472',

    // Menus & popups
    menuBackgroundColor: '#23272d',
    menuTextColor: '#e8e8e8',
    menuBorder: { color: '#363b44' },
    menuShadow: '0 4px 16px rgba(0,0,0,0.5)',
    tooltipBackgroundColor: '#2c3139',
    tooltipTextColor: '#e8e8e8',

    // Icons
    iconSize: 14,
    iconButtonHoverColor: '#363b44',

    // Drag & drop
    columnDropCellBackgroundColor: '#23272d',
    columnDropCellBorder: { color: '#363b44' },
    dragAndDropImageBackgroundColor: '#23272d',
    dragAndDropImageBorder: { color: '#f0b90b' },

    // Pinned
    pinnedColumnBorder: { color: '#454a54', style: 'solid', width: 1 },
    pinnedRowBackgroundColor: '#262a31',
    pinnedRowBorder: { color: '#454a54' },

    // Checkbox
    checkboxCheckedBackgroundColor: '#f0b90b',
    checkboxCheckedBorderColor: '#f0b90b',
    checkboxCheckedShapeColor: '#1a1d21',
    checkboxUncheckedBackgroundColor: '#181c21',
    checkboxUncheckedBorderColor: '#5c6472',

    // Validation
    invalidColor: '#f87171',

    // Focus
    focusShadow: '0 0 0 2px rgba(240, 185, 11, 0.35)',
  });

const lightTheme = themeQuartz
  .withPart(iconSetMaterial)
  .withParams({
    // Base canvas
    backgroundColor: '#E8E4DC',
    foregroundColor: '#2a2620',
    browserColorScheme: 'light',

    // Chrome — panel surface sits lighter than the canvas
    chromeBackgroundColor: {
      ref: 'backgroundColor',
      mix: 0.5,
      onto: '#FFFFFF',
    },

    // Typography
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 12,

    // Density
    spacing: 4,
    rowHeight: 28,
    headerHeight: 32,

    // Shapes
    borderRadius: 2,
    wrapperBorderRadius: 4,
    cellHorizontalPadding: 10,

    // Header
    headerBackgroundColor: '#E0DBD0',
    headerTextColor: '#6b6459',
    headerFontWeight: 600,
    headerColumnBorder: { color: '#d4cfc3' },
    headerColumnResizeHandleColor: '#8a8275',

    // Rows
    rowBorder: { color: '#dcd7cb', style: 'solid', width: 1 },
    oddRowBackgroundColor: {
      ref: 'foregroundColor',
      mix: 0.03,
      onto: 'backgroundColor',
    },
    rowHoverColor: {
      ref: 'foregroundColor',
      mix: 0.08,
      onto: 'backgroundColor',
    },
    selectedRowBackgroundColor: 'rgba(184, 115, 51, 0.10)',

    // Cells
    cellTextColor: '#2a2620',
    // (Horizontal cell borders are controlled via `rowBorder` in v35 Quartz;
    // vertical separators are enabled below.)
    columnBorder: true,

    // Borders
    borderColor: '#d4cfc3',
    wrapperBorder: { color: '#d4cfc3' },

    // Accent — copper complements parchment
    accentColor: '#b87333',
    rangeSelectionBackgroundColor: 'rgba(184, 115, 51, 0.12)',
    rangeSelectionBorderStyle: 'solid',
    rangeSelectionBorderColor: '#b87333',
    rangeSelectionChartBackgroundColor: 'rgba(184, 115, 51, 0.08)',
    rangeSelectionChartCategoryBackgroundColor: 'rgba(184, 115, 51, 0.05)',

    // Inputs
    inputBackgroundColor: '#FAF6EE',
    inputBorder: { color: '#d4cfc3' },
    inputTextColor: '#2a2620',
    inputFocusBorder: { color: '#b87333' },
    inputPlaceholderTextColor: '#8a8275',
    inputDisabledBackgroundColor: '#E8E4DC',
    inputDisabledTextColor: '#8a8275',

    // Menus & popups
    menuBackgroundColor: '#F2EEE6',
    menuTextColor: '#2a2620',
    menuBorder: { color: '#d4cfc3' },
    menuShadow: '0 4px 16px rgba(0,0,0,0.10)',
    tooltipBackgroundColor: '#2a2620',
    tooltipTextColor: '#F2EEE6',

    // Icons
    iconSize: 14,
    iconButtonHoverColor: '#DDD8CC',

    // Drag & drop
    columnDropCellBackgroundColor: '#EDE9E0',
    columnDropCellBorder: { color: '#d4cfc3' },
    dragAndDropImageBackgroundColor: '#F2EEE6',
    dragAndDropImageBorder: { color: '#b87333' },

    // Pinned
    pinnedColumnBorder: { color: '#bfb8a8', style: 'solid', width: 1 },
    pinnedRowBackgroundColor: '#E0DBD0',
    pinnedRowBorder: { color: '#bfb8a8' },

    // Checkbox
    checkboxCheckedBackgroundColor: '#b87333',
    checkboxCheckedBorderColor: '#b87333',
    checkboxCheckedShapeColor: '#F2EEE6',
    checkboxUncheckedBackgroundColor: '#FAF6EE',
    checkboxUncheckedBorderColor: '#8a8275',

    // Validation
    invalidColor: '#a32d2d',

    // Focus
    focusShadow: '0 0 0 2px rgba(184, 115, 51, 0.35)',
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

// Read `?v=2` once at module load — switching versions requires a full reload
// because each version owns its own AG-Grid module registration + storage.
const useV2 = (() => {
  try {
    return new URLSearchParams(window.location.search).get('v') === '2';
  } catch { return false; }
})();

// Separate standalone preview of the proposed Figma-inspired Format Editor.
// Reachable at ?fmt=preview — does not mount the grid; used to evaluate the
// component library before integrating into the real toolbars / panels.
const useFormatPreview = (() => {
  try {
    return new URLSearchParams(window.location.search).get('fmt') === 'preview';
  } catch { return false; }
})();

// Standalone A/B/C preview for the settings-panel visual style decision.
// Reachable at ?panel=preview. Delete once a pattern is chosen.
const usePanelPreview = (() => {
  try {
    return new URLSearchParams(window.location.search).get('panel') === 'preview';
  } catch { return false; }
})();

// Cockpit Terminal aesthetic proposal — sample before wholesale redesign.
// Reachable at ?panel=cockpit.
const useCockpitPreview = (() => {
  try {
    return new URLSearchParams(window.location.search).get('panel') === 'cockpit';
  } catch { return false; }
})();

export function App() {
  if (useFormatPreview) {
    const LazyPreview = React.lazy(() =>
      import('./FormatEditorPreview').then((m) => ({ default: m.FormatEditorPreview })),
    );
    return (
      <React.Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading format preview…</div>}>
        <LazyPreview />
      </React.Suspense>
    );
  }
  if (usePanelPreview) {
    const LazyPreview = React.lazy(() =>
      import('./PanelStylePreview').then((m) => ({ default: m.PanelStylePreview })),
    );
    return (
      <React.Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading panel preview…</div>}>
        <LazyPreview />
      </React.Suspense>
    );
  }
  if (useCockpitPreview) {
    const LazyPreview = React.lazy(() =>
      import('./CockpitPreview').then((m) => ({ default: m.CockpitPreview })),
    );
    return (
      <React.Suspense fallback={<div style={{ padding: 24, color: '#888' }}>Loading cockpit preview…</div>}>
        <LazyPreview />
      </React.Suspense>
    );
  }
  return <AppInner />;
}

function AppInner() {
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
            defaultColDef={defaultColDef}
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
