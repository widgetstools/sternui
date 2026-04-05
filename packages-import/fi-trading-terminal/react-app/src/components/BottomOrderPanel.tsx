import { useState, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { fiGridTheme } from '@/lib/agGridTheme';
import type { Bond } from '@/data/tradingData';
import { INITIAL_ORDERS, INITIAL_TRADES } from '@/data/tradingData';
import { SideCellRenderer, StatusBadgeRenderer, FilledAmountRenderer } from '@/lib/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);

interface BottomOrderPanelProps { bond: Bond | null; }

export function BottomOrderPanel({ bond }: BottomOrderPanelProps) {
  const [tab, setTab] = useState('Order History');
  const TABS = ['Order History', 'Trade History', 'Open Orders (0)', 'Funds'];

  const orderColDefs = useMemo<ColDef[]>(() => [
    { field: 'time',   headerName: 'Date',    width: 70,  cellStyle: { color: 'var(--bn-t1)' } },
    { field: 'bond',   headerName: 'Pair',    flex: 1,    cellStyle: { color: 'var(--bn-t0)' } },
    { field: 'type',   headerName: 'Type',    width: 60,  cellStyle: { color: 'var(--bn-t1)' } },
    { field: 'side',   headerName: 'Side',    width: 55,  cellRenderer: SideCellRenderer },
    { field: 'px',     headerName: 'Price',   width: 80,  type: 'numericColumn', valueFormatter: p => p.value > 0 ? p.value.toFixed(3) : '—' },
    { field: 'qty',    headerName: 'Amount',  width: 70,  type: 'numericColumn' },
    { field: 'filled', headerName: 'Filled',  width: 70,  type: 'numericColumn', cellRenderer: FilledAmountRenderer },
    { colId: 'total',  headerName: 'Total',   width: 80,  type: 'numericColumn',
      valueGetter: p => p.data?.px > 0 ? (+p.data.px * parseFloat(p.data.qty.replace('$', ''))).toFixed(0) : '—',
      cellStyle: { color: 'var(--bn-t1)' } },
    { field: 'status', headerName: 'Status',  width: 85,  cellRenderer: StatusBadgeRenderer },
  ], []);

  const tradeColDefs = useMemo<ColDef[]>(() => [
    { field: 'time',   headerName: 'Date',   width: 70,  cellStyle: { color: 'var(--bn-t1)' } },
    { field: 'bond',   headerName: 'Pair',   flex: 1,    cellStyle: { color: 'var(--bn-t0)' } },
    { field: 'side',   headerName: 'Side',   width: 55,  cellRenderer: SideCellRenderer },
    { field: 'price',  headerName: 'Price',  width: 80,  type: 'numericColumn', valueFormatter: p => p.value?.toFixed(3) },
    { field: 'size',   headerName: 'Amount', width: 70,  type: 'numericColumn' },
    { colId: 'total',  headerName: 'Total',  width: 80,  type: 'numericColumn', valueGetter: () => '—', cellStyle: { color: 'var(--bn-t1)' } },
    { colId: 'fee',    headerName: 'Fee',    width: 60,  type: 'numericColumn', valueGetter: () => '—', cellStyle: { color: 'var(--bn-t1)' } },
    { field: 'status', headerName: 'Status', width: 85,  cellRenderer: StatusBadgeRenderer },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    suppressMovable: true,
    cellStyle: { fontFamily: 'JetBrains Mono,monospace', fontSize: 11 },
  }), []);

  const getOrderRowId = useCallback((p: { data: typeof INITIAL_ORDERS[0] }) => p.data.id, []);
  const getTradeRowId = useCallback((p: { data: typeof INITIAL_TRADES[0] }) => p.data.id, []);

  return (
    <div className="flex flex-col h-full border-t" style={{background:'var(--bn-bg1)',borderColor:'var(--bn-border)'}}>
      {/* Tabs */}
      <div className="flex items-center border-b flex-shrink-0" style={{borderColor:'var(--bn-border)'}}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t.replace(/ \(\d+\)/,''))}
            className={`bn-tab ${tab===t.replace(/ \(\d+\)/,'')?'active':''}`}>
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 pr-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{color:'var(--bn-t1)'}}>
            <input type="checkbox" className="rounded" style={{accentColor:'var(--bn-yellow)'}}/> Hide Other Pairs
          </label>
          <button className="text-xs" style={{color:'var(--bn-yellow)'}}>Cancel All</button>
          <button className="text-xs" style={{color:'var(--bn-t1)'}}>▾</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'Open Orders' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8" style={{color:'var(--bn-t2)'}}>
            <div className="text-3xl mb-2 opacity-20">📋</div>
            <div className="text-sm">You have no open orders.</div>
          </div>
        )}
        {tab === 'Order History' && (
          <AgGridReact
            theme={fiGridTheme}
            rowData={INITIAL_ORDERS}
            columnDefs={orderColDefs}
            defaultColDef={defaultColDef}
            getRowId={getOrderRowId}
            headerHeight={28}
            rowHeight={26}
          />
        )}
        {tab === 'Trade History' && (
          <AgGridReact
            theme={fiGridTheme}
            rowData={INITIAL_TRADES}
            columnDefs={tradeColDefs}
            defaultColDef={defaultColDef}
            getRowId={getTradeRowId}
            headerHeight={28}
            rowHeight={26}
          />
        )}
        {tab === 'Funds' && (
          <div className="p-4 grid grid-cols-4 gap-4">
            {[{asset:'USD',avail:'0.00',locked:'0.00'},{asset:'UST',avail:'0.00',locked:'0.00'},{asset:'AAPL',avail:'0.00',locked:'0.00'}].map(f=>(
              <div key={f.asset} className="p-3 rounded border" style={{background:'var(--bn-bg2)',borderColor:'var(--bn-border2)'}}>
                <div className="font-bold mb-1" style={{color:'var(--bn-t0)'}}>{f.asset}</div>
                <div className="text-xs" style={{color:'var(--bn-t1)'}}>Available: <span className="font-mono-fi" style={{color:'var(--bn-t0)'}}>{f.avail}</span></div>
                <div className="text-xs" style={{color:'var(--bn-t1)'}}>In Order: <span className="font-mono-fi" style={{color:'var(--bn-t0)'}}>{f.locked}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
