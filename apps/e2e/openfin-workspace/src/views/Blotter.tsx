/**
 * Blotter view — the main grid surface inside an OpenFin view window.
 *
 * v1 implementation matches `apps/e2e/browser-blotter` standalone mode
 * — same column set, same 500-row in-app ticker. This keeps the e2e
 * surface predictable across both harnesses. Future iterations replace
 * the in-app generator with the host-data SharedWorker provider and
 * add the workspace-setup / dataprovider-editor popout flows the plan
 * describes.
 *
 * Renders identically in browser (Vite dev server) and inside an
 * OpenFin View so the same component is usable both for ad-hoc dev
 * inspection and for the openfin e2e suite.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { MarketsGrid } from '@starui/grid';

interface RowShape {
  id: string;
  cusip: string;
  issuer: string;
  sector: string;
  price: number;
  yield: number;
  bidPrice: number;
  askPrice: number;
}

export const GRID_ID = 'openfin-workspace-blotter-v1';

const COLUMNS: ColDef<RowShape>[] = [
  { field: 'id', headerName: 'ID', initialWidth: 100, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'cusip', headerName: 'CUSIP', initialWidth: 130, filter: 'agTextColumnFilter' },
  { field: 'issuer', headerName: 'Issuer', initialWidth: 200, filter: 'agTextColumnFilter' },
  { field: 'sector', headerName: 'Sector', initialWidth: 140, filter: 'agSetColumnFilter' },
  { field: 'price', headerName: 'Price', initialWidth: 110, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'yield', headerName: 'Yield %', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'bidPrice', headerName: 'Bid', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
  { field: 'askPrice', headerName: 'Ask', initialWidth: 100, filter: 'agNumberColumnFilter', enableCellChangeFlash: true },
];

const ISSUERS = [
  'Apple Inc.', 'Microsoft Corp', 'JPMorgan Chase', 'Bank of America',
  'Toyota Motor', 'BHP Group', 'Vodafone Group', 'Siemens AG',
  'Daimler AG', 'BNP Paribas',
];
const SECTORS = ['Financial', 'Industrial', 'Utility', 'Sovereign', 'Corporate', 'Mortgage'];

function generateRows(count: number): RowShape[] {
  const rows: RowShape[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `R${String(i).padStart(5, '0')}`,
      cusip: String(100000000 + i).padStart(9, '0'),
      issuer: ISSUERS[i % ISSUERS.length],
      sector: SECTORS[i % SECTORS.length],
      price: 95 + Math.random() * 10,
      yield: 2 + Math.random() * 4,
      bidPrice: 95 + Math.random() * 10,
      askPrice: 95 + Math.random() * 10,
    });
  }
  return rows;
}

export function Blotter() {
  const initialRows = useMemo(() => generateRows(500), []);
  const [rows, setRows] = useState<RowShape[]>(initialRows);
  const apiRef = useRef<GridApi<RowShape> | null>(null);

  useEffect(() => {
    const tick = () => {
      const updates: RowShape[] = [];
      for (let i = 0; i < 30; i++) {
        const idx = Math.floor(Math.random() * rows.length);
        const row = rows[idx];
        const drift = (Math.random() - 0.5) * 0.5;
        const next: RowShape = {
          ...row,
          price: Math.max(0, row.price + drift),
          yield: Math.max(0, row.yield + drift * 0.05),
          bidPrice: Math.max(0, row.bidPrice + drift),
          askPrice: Math.max(0, row.askPrice + drift),
        };
        rows[idx] = next;
        updates.push(next);
      }
      apiRef.current?.applyTransactionAsync({ update: updates });
    };
    const handle = setInterval(tick, 50);
    return () => clearInterval(handle);
  }, [rows]);

  const onGridReady = (event: GridReadyEvent<RowShape>) => {
    apiRef.current = event.api;
    (window as unknown as { __openfinWorkspaceApi?: GridApi<RowShape> }).__openfinWorkspaceApi = event.api;
  };

  return (
    <div
      data-testid="openfin-workspace-blotter"
      style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}
    >
      <div
        data-testid="openfin-workspace-blotter-grid-id"
        style={{
          padding: '6px 10px',
          background: 'var(--ds-surface-elevated, #1a1f26)',
          color: 'var(--ds-text-primary, #eaecef)',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          borderBottom: '1px solid var(--ds-border-subtle, #2a2f36)',
        }}
      >
        gridId: <code>{GRID_ID}</code>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarketsGrid<RowShape>
          gridId={GRID_ID}
          rowData={rows}
          columnDefs={COLUMNS}
          rowIdField="id"
          onGridReady={onGridReady}
        />
      </div>
    </div>
  );
}
