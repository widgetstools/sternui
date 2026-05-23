/**
 * Browser-blotter App — selects the runtime stack based on the
 * resolved URL mode and renders MarketsGrid.
 *
 * v1 implementation: only `standalone` mode is wired. The other three
 * modes (provider, config, full) render the same surface with a TODO
 * banner pending wiring of:
 *   - provider: SharedWorker data-services client + mock provider
 *   - config:   ConfigManager + StarGridApp shell
 *   - full:     all of the above + every toolbar / feature
 *
 * Subsequent commits add each mode incrementally. Specs that need a
 * particular surface will fail loudly until that mode lands.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { MarketsGrid } from '@starui/grid';

export type AppMode = 'standalone' | 'provider' | 'config' | 'full';

export const GRID_ID = 'browser-blotter-v1';

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

const SECTORS = ['Financial', 'Industrial', 'Utility', 'Sovereign', 'Corporate', 'Mortgage'];
const ISSUERS = [
  'Apple Inc.', 'Microsoft Corp', 'JPMorgan Chase', 'Bank of America',
  'Toyota Motor', 'BHP Group', 'Vodafone Group', 'Siemens AG',
  'Daimler AG', 'BNP Paribas',
];

function generateRows(count: number): RowShape[] {
  const rows: RowShape[] = [];
  for (let i = 0; i < count; i++) {
    const issuer = ISSUERS[i % ISSUERS.length];
    const sector = SECTORS[i % SECTORS.length];
    const cusip = String(100000000 + i).padStart(9, '0');
    rows.push({
      id: `R${String(i).padStart(5, '0')}`,
      cusip,
      issuer,
      sector,
      price: 95 + Math.random() * 10,
      yield: 2 + Math.random() * 4,
      bidPrice: 95 + Math.random() * 10,
      askPrice: 95 + Math.random() * 10,
    });
  }
  return rows;
}

interface ModeBannerProps {
  mode: AppMode;
}

function ModeBanner({ mode }: ModeBannerProps) {
  const status = mode === 'standalone' ? 'wired' : 'pending';
  return (
    <div
      data-testid="browser-blotter-mode-banner"
      data-mode={mode}
      data-status={status}
      style={{
        padding: '8px 12px',
        background: 'var(--ds-surface-elevated, #1a1f26)',
        color: 'var(--ds-text-primary, #eaecef)',
        borderBottom: '1px solid var(--ds-border-subtle, #2a2f36)',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <span data-testid="browser-blotter-mode-label">mode: <strong>{mode}</strong></span>
      <span style={{ opacity: 0.6 }}>•</span>
      <span data-testid="browser-blotter-grid-id">gridId: <code>{GRID_ID}</code></span>
      {status === 'pending' && (
        <>
          <span style={{ opacity: 0.6 }}>•</span>
          <span style={{ color: 'var(--ds-accent-warning, #f0b429)' }}>
            (pending: this mode is not yet wired; renders standalone surface)
          </span>
        </>
      )}
    </div>
  );
}

export function App({ mode }: { mode: AppMode }) {
  const initialRows = useMemo(() => generateRows(500), []);
  const [rows, setRows] = useState<RowShape[]>(initialRows);
  const apiRef = useRef<GridApi<RowShape> | null>(null);

  // High-frequency tick — mutate a random ~30 cells per 50ms tick.
  useEffect(() => {
    const tick = () => {
      const updates: RowShape[] = [];
      const n = 30;
      for (let i = 0; i < n; i++) {
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
    // Expose for Playwright fast-paths.
    (window as unknown as { __browserBlotterApi?: GridApi<RowShape> }).__browserBlotterApi = event.api;
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <ModeBanner mode={mode} />
      <div style={{ flex: 1, minHeight: 0 }} data-testid="browser-blotter-grid-host">
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
