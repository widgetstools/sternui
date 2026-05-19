import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { MarketsGrid } from '@stargrid/grid';
import { useStarGridApp, useStarGridHost } from '@stargrid/app';
import { Button } from '@stargrid/ui';
import { Moon, Sun } from 'lucide-react';
import { generateOrders, type Order } from './data';

export const APP_ID = 'stargrid-demo';
export const GRID_ID = 'demo-blotter-v2';

const columnDefs: ColDef<Order>[] = [
  { field: 'id', headerName: 'Order ID', initialWidth: 120, pinned: 'left' },
  { field: 'security', headerName: 'Security', initialWidth: 180 },
  { field: 'side', headerName: 'Side', initialWidth: 70 },
  { field: 'quantity', headerName: 'Qty', initialWidth: 100 },
  { field: 'price', headerName: 'Price', initialWidth: 100, editable: true },
  { field: 'status', headerName: 'Status', initialWidth: 100 },
  { field: 'venue', headerName: 'Venue', initialWidth: 120 },
];

const defaultColDef: ColDef<Order> = {
  filter: true,
  sortable: true,
  resizable: true,
  floatingFilter: true,
};

export function App() {
  const { theme, setTheme } = useStarGridApp();
  const host = useStarGridHost({ gridId: GRID_ID });
  const rowData = useMemo(() => generateOrders(300), []);
  const isDark = theme === 'dark';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--ds-border-primary)',
          background: 'var(--ds-surface-primary)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em' }}>
          StarGrid Demo
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            {rowData.length} orders · zero @starui/* imports
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="h-[26px] w-[26px]"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </Button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarketsGrid
          host={host}
          gridId={GRID_ID}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          showFiltersToolbar
          showFormattingToolbar
          sideBar={{ toolPanels: ['columns', 'filters'] }}
        />
      </div>
    </div>
  );
}
