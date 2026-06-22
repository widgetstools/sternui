import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { Badge } from '@starui/ui';
import '../lib/agGridSetup';
import { gridTheme } from '../lib/agGridTheme';
import { useThemeMode } from '../lib/useThemeMode';
import type { Order, OrderStatus, TerminalState } from '../data/types';

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  working: 'default',
  filled: 'secondary',
  cancelled: 'destructive',
};

function StatusCell({ value }: { value: OrderStatus }) {
  return <Badge variant={STATUS_VARIANT[value]} className="capitalize">{value}</Badge>;
}

const COLS: ColDef<Order>[] = [
  { field: 'ticker', headerName: 'Instrument', minWidth: 150 },
  { field: 'side', headerName: 'Side', width: 90, valueFormatter: (p) => String(p.value).toUpperCase(),
    cellStyle: (p) => ({ color: p.value === 'buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }) },
  { field: 'qty', headerName: 'Qty', width: 130, type: 'rightAligned', valueFormatter: (p) => Number(p.value).toLocaleString('en-US') },
  { field: 'price', headerName: 'Price', width: 100, type: 'rightAligned', valueFormatter: (p) => Number(p.value).toFixed(3) },
  { field: 'status', headerName: 'Status', width: 130, cellRenderer: StatusCell },
];

export interface OrdersBlotterProps {
  state: TerminalState;
}

export function OrdersBlotter({ state }: OrdersBlotterProps) {
  const { mode } = useThemeMode();
  const rows = useMemo(() => state.orders, [state.orders]);
  return (
    <div data-ag-theme-mode={mode} className="h-full w-full" data-testid="orders-blotter">
      <AgGridReact<Order>
        theme={gridTheme}
        rowData={rows}
        columnDefs={COLS}
        getRowId={(p) => p.data.id}
        defaultColDef={{ sortable: true, resizable: true }}
        animateRows={false}
      />
    </div>
  );
}
