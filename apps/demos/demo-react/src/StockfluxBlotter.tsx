/*
 * StockfluxBlotter — Stockflux-style blotter comparison surface for demo-react.
 *
 * Apples-to-apples comparison surface: same data shape, same column defs,
 * same cell-renderer styling — but driven by our `@starui/design-system`
 * tokens (`--ds-*` vs Stockflux's `--sf-*`) and our shadcn primitives
 * from `@starui/ui`. Any visual delta is a real theme delta, not a
 * structural one.
 *
 * Renders under ?view=stockflux-blotter.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
  ICellRendererParams,
  ValueFormatterParams,
} from 'ag-grid-community';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  agGridDarkTheme,
  agGridLightTheme,
} from '@starui/design-system/adapters/ag-grid';
import { Badge, Button, Input } from '@starui/ui';
import { FileText, Search, Settings as SettingsIcon } from 'lucide-react';
import { useStarGridApp } from '@starui/app';

// Stockflux's blotter uses enterprise features (sideBar, cellSelection,
// row grouping, aggregations). Matching for apples-to-apples comparison.
ModuleRegistry.registerModules([AllEnterpriseModule]);

// ─── Seed data (verbatim from Stockflux blotter.jsx) ─────────────────────

const SF_TICKERS: Array<[string, string, number, string]> = [
  ['AAPL', 'Apple Inc.', 186.42, 'NASDAQ'],
  ['MSFT', 'Microsoft Corp.', 414.28, 'NASDAQ'],
  ['NVDA', 'NVIDIA Corp.', 872.15, 'NASDAQ'],
  ['TSLA', 'Tesla Inc.', 246.83, 'NASDAQ'],
  ['GOOGL', 'Alphabet Inc. Cl A', 142.66, 'NASDAQ'],
  ['AMZN', 'Amazon.com Inc.', 178.32, 'NASDAQ'],
  ['META', 'Meta Platforms', 498.71, 'NASDAQ'],
  ['JPM', 'JPMorgan Chase', 198.04, 'NYSE'],
  ['BAC', 'Bank of America', 37.92, 'NYSE'],
  ['XOM', 'Exxon Mobil', 117.66, 'NYSE'],
  ['CVX', 'Chevron Corp.', 156.41, 'NYSE'],
  ['UNH', 'UnitedHealth', 512.18, 'NYSE'],
  ['JNJ', 'Johnson & Johnson', 148.27, 'NYSE'],
  ['V',   'Visa Inc.', 276.83, 'NYSE'],
  ['MA',  'Mastercard', 472.51, 'NYSE'],
  ['LLY', 'Eli Lilly', 731.84, 'NYSE'],
  ['BRK.B', 'Berkshire Cl B', 418.04, 'NYSE'],
  ['WMT', 'Walmart Inc.', 67.42, 'NYSE'],
  ['PG', 'Procter & Gamble', 163.59, 'NYSE'],
  ['HD', 'Home Depot', 349.06, 'NYSE'],
];

const SF_BOOKS = ['EQUITY-US', 'MACRO', 'PROP', 'HEDGE-1', 'HEDGE-2'];
const SF_TRADERS = ['M. Chen', 'A. Patel', 'S. Johnson', 'R. Garcia', 'J. Schmidt', 'N. Tanaka'];
const SF_STATUS = ['FILLED', 'FILLED', 'FILLED', 'FILLED', 'PARTIAL', 'PENDING', 'CANCELLED'];
const SF_STRATS = ['VWAP', 'TWAP', 'POV', 'DARK', 'LIT', 'MIDPOINT', 'SMART'];

function sfRand(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

interface Trade {
  tradeId: string;
  time: Date;
  symbol: string;
  name: string;
  venue: string;
  side: 'BUY' | 'SELL';
  qty: number;
  filled: number;
  orderPx: number;
  fillPx: number;
  slippageBps: number;
  notional: number;
  status: string;
  trader: string;
  book: string;
  strategy: string;
  counterparty: string;
}

interface Position {
  symbol: string;
  name: string;
  venue: string;
  qty: number;
  avgCost: number;
  last: number;
  mktVal: number;
  unrealPnl: number;
  unrealPct: number;
  dayPnl: number;
  dayChgPct: number;
  book: string;
  sector: string;
}

function buildTrades(n = 60): Trade[] {
  const r = sfRand(1337);
  const now = Date.now();
  const rows: Trade[] = [];
  for (let i = 0; i < n; i++) {
    const t = SF_TICKERS[Math.floor(r() * SF_TICKERS.length)];
    const side = r() > 0.5 ? 'BUY' : 'SELL';
    const qty = Math.round((100 + r() * 9900) / 100) * 100;
    const px = +(t[2] * (0.985 + r() * 0.030)).toFixed(2);
    const fillPx = +(px * (0.999 + r() * 0.002)).toFixed(2);
    const time = new Date(now - Math.floor(r() * 86400000));
    rows.push({
      tradeId: 'T-' + (582914 + i),
      time,
      symbol: t[0],
      name: t[1],
      venue: t[3],
      side,
      qty,
      filled: qty,
      orderPx: px,
      fillPx,
      slippageBps: +(((fillPx - px) / px) * 10000 * (side === 'BUY' ? 1 : -1)).toFixed(1),
      notional: +(qty * fillPx).toFixed(2),
      status: SF_STATUS[Math.floor(r() * SF_STATUS.length)],
      trader: SF_TRADERS[Math.floor(r() * SF_TRADERS.length)],
      book: SF_BOOKS[Math.floor(r() * SF_BOOKS.length)],
      strategy: SF_STRATS[Math.floor(r() * SF_STRATS.length)],
      counterparty: ['GS', 'MS', 'JPM', 'CS', 'UBS', 'BARC', 'CITI'][Math.floor(r() * 7)],
    });
  }
  rows.sort((a, b) => b.time.getTime() - a.time.getTime());
  return rows;
}

const SECTORS = ['Tech','Tech','Tech','Tech','Tech','Tech','Tech','Financials','Financials','Energy','Energy','Healthcare','Healthcare','Financials','Financials','Healthcare','Financials','Consumer','Consumer','Consumer'];
function buildPositions(): Position[] {
  const r = sfRand(99);
  return SF_TICKERS.map((t, i) => {
    const longQty = Math.round((1000 + r() * 49000) / 100) * 100;
    const isLong = r() > 0.18;
    const qty = isLong ? longQty : -Math.round((500 + r() * 9000) / 100) * 100;
    const avgCost = +(t[2] * (0.92 + r() * 0.10)).toFixed(2);
    const last = +(t[2] * (0.97 + r() * 0.07)).toFixed(2);
    const dayChgPct = +((r() - 0.5) * 4.5).toFixed(2);
    return {
      symbol: t[0],
      name: t[1],
      venue: t[3],
      qty,
      avgCost,
      last,
      mktVal: +(qty * last).toFixed(2),
      unrealPnl: +((last - avgCost) * qty).toFixed(2),
      unrealPct: +(((last - avgCost) / avgCost) * (qty > 0 ? 1 : -1) * 100).toFixed(2),
      dayPnl: +(last * qty * (dayChgPct / 100)).toFixed(2),
      dayChgPct,
      book: SF_BOOKS[i % SF_BOOKS.length],
      sector: SECTORS[i],
    };
  });
}

// ─── Formatters (verbatim from Stockflux) ─────────────────────────────────

const sfFmt = {
  qty:   (v: number | null) => v?.toLocaleString('en-US') ?? '',
  px:    (v: number | null, d = 2) => v?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '',
  money: (v: number) => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  time:  (d: Date | null) => d?.toLocaleTimeString('en-GB', { hour12: false }) ?? '',
};

// ─── Cell renderers (Stockflux behaviour, --ds-* tokens) ─────────────────

function SideRenderer({ value }: ICellRendererParams) {
  if (!value) return null;
  const isBuy = value === 'BUY';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 42,
        padding: '0 6px',
        height: 18,
        borderRadius: 2,
        background: isBuy ? 'var(--ds-overlay-positive-soft)' : 'var(--ds-overlay-negative-soft)',
        color: isBuy ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
        fontFamily: 'var(--ds-font-sans)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
      }}
    >
      {value}
    </span>
  );
}

const STATUS_PALETTE: Record<string, { c: string; bg: string }> = {
  FILLED:    { c: 'var(--ds-accent-positive)', bg: 'var(--ds-overlay-positive-soft)' },
  PARTIAL:   { c: 'var(--ds-accent-warning)',  bg: 'var(--ds-overlay-warning-soft)'  },
  PENDING:   { c: 'var(--ds-accent-info)',     bg: 'var(--ds-overlay-info-soft)'     },
  CANCELLED: { c: 'var(--ds-text-faint)',      bg: 'transparent' },
};
function StatusRenderer({ value }: ICellRendererParams) {
  if (!value) return null;
  const m = STATUS_PALETTE[value as string] ?? STATUS_PALETTE.FILLED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '0 7px', height: 18, borderRadius: 2,
      background: m.bg, color: m.c,
      fontFamily: 'var(--ds-font-sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.c, display: 'inline-block' }} />
      {value}
    </span>
  );
}

function PnlRenderer({ value }: ICellRendererParams) {
  if (value == null) return null;
  const v = Number(value);
  const color = v > 0 ? 'var(--ds-accent-positive)' : v < 0 ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)';
  const sign  = v > 0 ? '+' : v < 0 ? '−' : '';
  const txt   = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return <span style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{sign}{txt}</span>;
}

function PctRenderer({ value }: ICellRendererParams) {
  if (value == null) return null;
  const v = Number(value);
  const color = v > 0 ? 'var(--ds-accent-positive)' : v < 0 ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)';
  const sign  = v > 0 ? '+' : '';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ fontSize: 9 }}>{arrow}</span>{sign}{v.toFixed(2)}%
    </span>
  );
}

function SlippageRenderer({ value }: ICellRendererParams) {
  if (value == null) return null;
  const v = Number(value);
  const color = v < 0 ? 'var(--ds-accent-positive)' : v > 0 ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{v > 0 ? '+' : ''}{v.toFixed(1)} bp</span>;
}

function SymbolRenderer({ data }: ICellRendererParams) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, padding: '3px 0' }}>
      <span style={{ fontFamily: 'var(--ds-font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', letterSpacing: '-0.005em' }}>
        {data.symbol}
      </span>
      <span style={{
        fontFamily: 'var(--ds-font-sans)', fontSize: 10, color: 'var(--ds-text-faint)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
      }}>
        {data.name}
      </span>
    </div>
  );
}

function QtyRenderer({ value }: ICellRendererParams) {
  if (value == null) return null;
  const v = Number(value);
  const color = v >= 0 ? 'var(--ds-text-primary)' : 'var(--ds-accent-negative)';
  const sign  = v < 0 ? '−' : '';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{sign}{Math.abs(v).toLocaleString('en-US')}</span>;
}

// ─── Column defs ─────────────────────────────────────────────────────────

const tradeCols: ColDef<Trade>[] = [
  { headerName: '#', valueGetter: (p) => p.node ? p.node.rowIndex! + 1 : 0, width: 48, pinned: 'left',
    cellStyle: { color: 'var(--ds-text-faint)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 11 } },
  { headerName: 'Time', field: 'time', width: 90,
    valueFormatter: (p: ValueFormatterParams<Trade>) => sfFmt.time(p.value as Date),
    cellStyle: { color: 'var(--ds-text-secondary)', fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Trade ID', field: 'tradeId', width: 100,
    cellStyle: { color: 'var(--ds-text-muted)', fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Symbol', field: 'symbol', width: 160, cellRenderer: SymbolRenderer, pinned: 'left', autoHeight: true },
  { headerName: 'Side', field: 'side', width: 80, cellRenderer: SideRenderer,
    cellStyle: { display: 'flex', alignItems: 'center' } },
  { headerName: 'Status', field: 'status', width: 120, cellRenderer: StatusRenderer,
    cellStyle: { display: 'flex', alignItems: 'center' } },
  { headerName: 'Qty', field: 'qty', width: 100, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.qty(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Filled', field: 'filled', width: 100, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.qty(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--ds-text-secondary)' } },
  { headerName: 'Order Px', field: 'orderPx', width: 100, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.px(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Fill Px', field: 'fillPx', width: 100, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.px(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: 500 } },
  { headerName: 'Slippage', field: 'slippageBps', width: 100, type: 'numericColumn', cellRenderer: SlippageRenderer },
  { headerName: 'Notional', field: 'notional', width: 140, type: 'numericColumn',
    valueFormatter: (p) => '$' + (p.value as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    cellStyle: { fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Venue', field: 'venue', width: 90, cellStyle: { color: 'var(--ds-text-muted)' } },
  { headerName: 'Strategy', field: 'strategy', width: 100, cellStyle: { color: 'var(--ds-text-muted)' } },
  { headerName: 'Trader', field: 'trader', width: 120, cellStyle: { color: 'var(--ds-text-secondary)' } },
  { headerName: 'Book', field: 'book', width: 110, cellStyle: { color: 'var(--ds-text-muted)' } },
  { headerName: 'CP', field: 'counterparty', width: 80, cellStyle: { color: 'var(--ds-text-muted)' } },
];

const positionCols: ColDef<Position>[] = [
  { headerName: 'Symbol', field: 'symbol', width: 170, cellRenderer: SymbolRenderer, pinned: 'left', autoHeight: true },
  { headerName: 'Sector', field: 'sector', width: 120, cellStyle: { color: 'var(--ds-text-muted)' } },
  { headerName: 'Book', field: 'book', width: 120, cellStyle: { color: 'var(--ds-text-muted)' } },
  { headerName: 'Qty', field: 'qty', width: 120, type: 'numericColumn', cellRenderer: QtyRenderer },
  { headerName: 'Avg Cost', field: 'avgCost', width: 110, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.px(p.value),
    cellStyle: { color: 'var(--ds-text-secondary)', fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Last', field: 'last', width: 110, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.px(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: 500 },
    enableCellChangeFlash: true },
  { headerName: 'Day Δ', field: 'dayChgPct', width: 110, type: 'numericColumn', cellRenderer: PctRenderer },
  { headerName: 'Market Value', field: 'mktVal', width: 160, type: 'numericColumn',
    valueFormatter: (p) => sfFmt.money(p.value),
    cellStyle: { fontVariantNumeric: 'tabular-nums' } },
  { headerName: 'Unrealized P&L', field: 'unrealPnl', width: 150, type: 'numericColumn', cellRenderer: PnlRenderer },
  { headerName: 'Unrealized %', field: 'unrealPct', width: 120, type: 'numericColumn', cellRenderer: PctRenderer },
  { headerName: 'Day P&L', field: 'dayPnl', width: 140, type: 'numericColumn', cellRenderer: PnlRenderer },
];

const defaultColDef: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
  floatingFilter: true,
  // Stockflux pattern: keep the column-menu icon (⋮) always visible
  // next to each header label. Together with the resize handle this
  // gives the column-divider look in the header row.
  suppressHeaderMenuButton: false,
  suppressMovable: false,
};

// ─── Page ────────────────────────────────────────────────────────────────

type Kind = 'trades' | 'positions';

export function StockfluxBlotter() {
  const { theme } = useStarGridApp();
  const isDark = theme === 'dark';
  const [kind, setKind] = useState<Kind>('trades');
  const [trades] = useState(() => buildTrades(60));
  const [positions, setPositions] = useState(() => buildPositions());
  const gridApiRef = useRef<GridApi | null>(null);

  // Live tick on positions — nudge a few prices every 1.4s
  useEffect(() => {
    if (kind !== 'positions') return;
    const id = setInterval(() => {
      setPositions((prev) => {
        const next = [...prev];
        for (let k = 0; k < 4; k++) {
          const i = Math.floor(Math.random() * next.length);
          const drift = (Math.random() - 0.5) * 0.004;
          const last = +(next[i].last * (1 + drift)).toFixed(2);
          const unrealPnl = +((last - next[i].avgCost) * next[i].qty).toFixed(2);
          const unrealPct = +(((last - next[i].avgCost) / next[i].avgCost) * (next[i].qty > 0 ? 1 : -1) * 100).toFixed(2);
          const dayChgPct = +(next[i].dayChgPct + drift * 100).toFixed(2);
          next[i] = { ...next[i], last, unrealPnl, unrealPct, mktVal: +(next[i].qty * last).toFixed(2), dayChgPct };
        }
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, [kind]);

  const cols = useMemo<ColDef<Trade | Position>[]>(
    () => (kind === 'trades' ? tradeCols : positionCols) as ColDef<Trade | Position>[],
    [kind],
  );
  const rows = kind === 'trades' ? trades : positions;
  const gridTheme = isDark ? agGridDarkTheme : agGridLightTheme;

  return (
    <div
      className="flex h-full flex-col gap-4 p-6"
      style={{ background: 'var(--ds-surface-ground)' }}
    >
      <h1
        className="font-bold tracking-tight"
        style={{
          fontSize: 'var(--ds-font-size-4xl)',
          color: 'var(--ds-text-primary)',
          margin: 0,
        }}
      >
        Trade &amp; Position blotter
      </h1>
      <PageChrome kind={kind} onKindChange={setKind} />
      <div className="flex-1 min-h-0">
        <AgGridReact
          theme={gridTheme}
          rowData={rows}
          columnDefs={cols}
          defaultColDef={defaultColDef}
          getRowId={(p) => (kind === 'trades' ? (p.data as Trade).tradeId : (p.data as Position).symbol)}
          rowSelection={{ mode: 'multiRow', checkboxes: false, enableClickSelection: true }}
          cellSelection={true}
          tooltipShowDelay={300}
          animateRows
          onGridReady={(e) => { gridApiRef.current = e.api; }}
          sideBar={{
            toolPanels: [
              { id: 'columns', labelDefault: 'Columns', labelKey: 'columns', iconKey: 'columns', toolPanel: 'agColumnsToolPanel' },
              { id: 'filters', labelDefault: 'Filters', labelKey: 'filters', iconKey: 'filter',  toolPanel: 'agFiltersToolPanel' },
            ],
            defaultToolPanel: undefined,
            position: 'right',
          }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
              { statusPanel: 'agAggregationComponent', align: 'right' },
            ],
          }}
        />
      </div>
    </div>
  );
}

function PageChrome({ kind, onKindChange }: { kind: Kind; onKindChange: (k: Kind) => void }) {
  const [filter, setFilter] = useState('');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="inline-flex gap-[2px] rounded-md p-[2px]"
        style={{
          background: 'var(--ds-surface-sunken)',
          border: '1px solid var(--ds-border-primary)',
        }}
      >
        <PillTab active={kind === 'trades'} onClick={() => onKindChange('trades')}>Trade blotter</PillTab>
        <PillTab active={kind === 'positions'} onClick={() => onKindChange('positions')}>Position blotter</PillTab>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-positive-soft)',
            color: 'var(--ds-accent-positive)',
            border: '1px solid var(--ds-overlay-positive-ring)',
          }}
        >
          LIVE
        </Badge>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--ds-text-muted)' }}
          />
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-[30px] w-[220px] pl-7 text-[12px]"
          />
        </div>
        <Button variant="outline" size="sm">
          <FileText size={13} /> Export
        </Button>
        <Button variant="outline" size="sm">
          <SettingsIcon size={13} /> Columns
        </Button>
      </div>
    </div>
  );
}

function PillTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-sm px-3 py-[5px] text-[12px] font-medium transition-colors"
      style={{
        background: active ? 'var(--ds-primary)' : 'transparent',
        color: active ? 'var(--ds-primary-foreground)' : 'var(--ds-text-secondary)',
        fontFamily: 'var(--ds-font-sans)',
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </button>
  );
}
