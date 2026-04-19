/**
 * Two-grid dashboard — visual reference for a multi-grid layout.
 *
 * Two `<MarketsGrid>` instances sit side by side. Each has:
 *   - a unique `gridId` → independent IndexedDB profiles, independent
 *     platform, independent DirtyBus, independent toolbars.
 *   - its own rowData + chrome label so users can see at a glance which
 *     dataset they're looking at.
 *   - the full feature set (filters toolbar, formatting toolbar,
 *     settings sheet, profile selector).
 *
 * Why this exists: the FormattingToolbar refactor (steps 1-7) made every
 * toolbar fully context-driven — no prop-threaded store, no shared
 * references between grids. This page is the visual proof. Formatting
 * column `price` as bold+red on grid A leaves grid B untouched; grid B
 * can have its own saved templates, its own profile, its own overrides.
 *
 * This is also the harness the end-to-end isolation spec targets
 * (`e2e/v2-two-grid-isolation.spec.ts`).
 */
import { useMemo, useState } from 'react';
import type { ColDef, Theme } from 'ag-grid-community';
import { MarketsGrid } from '@grid-customizer/markets-grid';
import { DexieAdapter } from '@grid-customizer/core';

import { generateOrders, generateEquityOrders, type Order } from './data';

export interface DashboardProps {
  theme: Theme;
  columnDefs: ColDef<Order>[];
  defaultColDef: ColDef<Order>;
}

export function Dashboard({ theme, columnDefs, defaultColDef }: DashboardProps) {
  const [ratesData] = useState(() => generateOrders(500));
  const [equityData] = useState(() => generateEquityOrders(300));

  // One storage adapter, shared across both grids. The `MarketsGrid` host
  // scopes everything it writes by `gridId`, so two grids sharing one
  // IndexedDB adapter still have fully independent profile state.
  const storageAdapter = useMemo(() => new DexieAdapter(), []);

  return (
    <div
      data-testid="two-grid-dashboard"
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 1,
        background: 'var(--border)',
        minHeight: 0,
      }}
    >
      <GridPanel
        label="RATES BLOTTER"
        gridId="dashboard-rates-v2"
        rowData={ratesData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={theme}
        storageAdapter={storageAdapter}
      />
      <GridPanel
        label="EQUITIES BLOTTER"
        gridId="dashboard-equities-v2"
        rowData={equityData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={theme}
        storageAdapter={storageAdapter}
      />
    </div>
  );
}

interface GridPanelProps {
  label: string;
  gridId: string;
  rowData: Order[];
  columnDefs: ColDef<Order>[];
  defaultColDef: ColDef<Order>;
  theme: Theme;
  storageAdapter: DexieAdapter;
}

function GridPanel({
  label,
  gridId,
  rowData,
  columnDefs,
  defaultColDef,
  theme,
  storageAdapter,
}: GridPanelProps) {
  return (
    <section
      data-testid={`dashboard-panel-${gridId}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--background)' }}
    >
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: 'var(--bn-green, #2dd4bf)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--foreground)',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
          · {rowData.length} rows · {gridId}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarketsGrid
          gridId={gridId}
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
    </section>
  );
}
