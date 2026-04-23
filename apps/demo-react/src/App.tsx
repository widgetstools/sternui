import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import { DexieAdapter, activeProfileKey } from '@marketsui/core';
import type { StorageAdapter, ProfileSnapshot } from '@marketsui/core';
import { Sun, Moon } from 'lucide-react';

import { generateOrders, startLiveTicking, type Order } from './data';
import { Dashboard } from './Dashboard';
import { MarketDepth } from './MarketDepth';
import { buildShowcasePayload, SHOWCASE_PROFILE_NAME } from './showcaseProfile';

type View = 'single' | 'dashboard' | 'depth';

/**
 * Initial view comes from `?view=...` (falls back to single).
 * Captured ONCE on mount so a runtime toggle doesn't round-trip the
 * URL — the header button updates both state AND the URL in place via
 * `history.replaceState`.
 */
function initialView(): View {
  if (typeof window === 'undefined') return 'single';
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  if (v === 'dashboard') return 'dashboard';
  if (v === 'depth') return 'depth';
  return 'single';
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

// ─── Showcase seeding ──────────────────────────────────────────────────
//
// On first boot (per gridId), seed the "Showcase" profile directly into
// the Dexie store and flip the active-profile localStorage pointer so
// MarketsGrid boots straight into the styled / calculated / tick-flashed
// view. Skipped on subsequent loads (idempotent: we match by name).

const GRID_ID = 'demo-blotter-v2';
const SEEDED_FLAG_KEY = `gc-showcase-seeded:${GRID_ID}`;

async function ensureShowcaseSeed(adapter: StorageAdapter): Promise<void> {
  // One-shot guard: if the flag's set, bail. We still check storage in
  // case the user manually cleared IndexedDB but kept localStorage.
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(SEEDED_FLAG_KEY)) {
      return;
    }
  } catch { /* access denied — press on */ }

  const existing = await adapter.listProfiles(GRID_ID);
  if (existing.some((p) => p.name.toLowerCase() === SHOWCASE_PROFILE_NAME.toLowerCase())) {
    try { localStorage.setItem(SEEDED_FLAG_KEY, '1'); } catch { /* */ }
    return;
  }

  const payload = buildShowcasePayload(GRID_ID);
  const now = Date.now();
  const id = 'showcase';
  const snap: ProfileSnapshot = {
    id,
    gridId: GRID_ID,
    name: payload.profile.name,
    state: payload.profile.state,
    createdAt: now,
    updatedAt: now,
  };
  await adapter.saveProfile(snap);

  // Point the active-profile pointer at the fresh snapshot so the first
  // MarketsGrid render lands here (avoids a default-profile → showcase
  // flicker). Safe even if the key's already set — we're on first boot.
  try { localStorage.setItem(activeProfileKey(GRID_ID), id); } catch { /* */ }
  try { localStorage.setItem(SEEDED_FLAG_KEY, '1'); } catch { /* */ }
}

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
  // Grid API captured via onGridReady — used to stream tick updates
  // through applyTransactionAsync without replacing rowData.
  const gridApiRef = useRef<GridApi<Order> | null>(null);
  // Live-tick toggle in the header. Defaults on — that's the whole
  // point of the showcase, but users debugging render issues can pause
  // it. Persisted so a reload keeps the user's choice.
  const [ticking, setTicking] = useState(() => {
    try { return localStorage.getItem('gc-ticking') !== 'off'; }
    catch { return true; }
  });
  // Gate the first render until the showcase profile has been seeded;
  // otherwise MarketsGrid briefly boots with the default profile and
  // then flips, producing a visible style flash.
  const [seeded, setSeeded] = useState(false);

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
    else if (view === 'depth') q.set('view', 'depth');
    else q.delete('view');
    const next = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [view]);

  const theme = isDark ? darkTheme : lightTheme;

  const storageAdapter = useMemo(() => new DexieAdapter(), []);

  // One-shot seed on mount. `ensureShowcaseSeed` is idempotent — it
  // short-circuits on the per-grid flag or when the profile already
  // exists in Dexie — so React 19 StrictMode double-mount is safe.
  useEffect(() => {
    let alive = true;
    ensureShowcaseSeed(storageAdapter).finally(() => {
      if (alive) setSeeded(true);
    });
    return () => { alive = false; };
  }, [storageAdapter]);

  // Persist the tick-toggle preference.
  useEffect(() => {
    try { localStorage.setItem('gc-ticking', ticking ? 'on' : 'off'); }
    catch { /* */ }
  }, [ticking]);

  // Live ticking — start once the grid is ready + ticking is on. Emits
  // row updates through the transaction API so AG-Grid only repaints
  // the dirty cells (conditional styling's flash rule picks up the
  // cellValueChanged event and fires the pulse).
  useEffect(() => {
    if (!ticking || view !== 'single') return;
    const stop = startLiveTicking(rowData, (updates) => {
      const api = gridApiRef.current;
      if (!api) return;
      try { api.applyTransactionAsync({ update: updates }); }
      catch { /* grid tearing down — drop the batch */ }
    }, 800);
    return stop;
  }, [ticking, view, rowData]);

  const handleGridReady = useCallback((ev: GridReadyEvent<Order>) => {
    gridApiRef.current = ev.api;
  }, []);

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
          <ViewTab active={view === 'depth'} onClick={() => setView('depth')} testId="view-tab-depth">
            Market depth
          </ViewTab>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'single' && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {rowData.length} orders
            </span>
          )}
          {/* Live-tick toggle — pulse dot when ticking is on, static
              dot when paused. Placed next to the row-count so users
              immediately see the "live" state of the showcase. */}
          {view === 'single' && (
            <button
              onClick={() => setTicking((t) => !t)}
              data-testid="tick-toggle"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 26, padding: '0 10px', borderRadius: 5,
                border: '1px solid var(--border)',
                background: ticking
                  ? 'color-mix(in srgb, var(--bn-green, #2dd4bf) 14%, transparent)'
                  : 'var(--secondary)',
                color: ticking ? 'var(--bn-green, #2dd4bf)' : 'var(--muted-foreground)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: "'IBM Plex Sans', sans-serif",
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              title={ticking ? 'Pause live ticking' : 'Resume live ticking'}
            >
              <span
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: ticking ? '#2dd4bf' : '#64748b',
                  boxShadow: ticking ? '0 0 8px #2dd4bf' : 'none',
                  animation: ticking ? 'gcTickPulse 1.4s ease-in-out infinite' : undefined,
                }}
              />
              {ticking ? 'LIVE' : 'PAUSED'}
            </button>
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

      {/* Pulse keyframes for the LIVE dot. Inlined here so the demo is
          self-contained (globals.css is scoped to grid-customizer
          tokens). */}
      <style>{`
        @keyframes gcTickPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.35); }
        }
      `}</style>

      {!seeded ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
          fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Loading showcase…
        </div>
      ) : view === 'single' ? (
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
            onGridReady={handleGridReady}
            sideBar={{ toolPanels: ['columns', 'filters'] }}
            statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
              ],
            }}
          />
        </div>
      ) : view === 'dashboard' ? (
        <Dashboard theme={theme} columnDefs={columnDefs} defaultColDef={defaultColDef} />
      ) : (
        <MarketDepth isDark={isDark} />
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
