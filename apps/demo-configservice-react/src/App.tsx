import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid, type AdminAction, type StorageAdapterFactory } from '@marketsui/markets-grid';
import { activeProfileKey } from '@marketsui/core';
import type { ProfileSnapshot } from '@marketsui/core';
import {
  createConfigManager,
  createConfigServiceStorage,
  type ConfigManager,
} from '@marketsui/config-service';
import { setConfigManager as publishSharedConfigManager } from '@marketsui/openfin-platform';
import {
  ConfigBrowserPanel,
  createConfigBrowserAction,
} from '@marketsui/config-browser';
import { Sun, Moon, User, Database, X } from 'lucide-react';

import { generateOrders, startLiveTicking, type Order } from './data';
import { Dashboard } from './Dashboard';
import { MarketDepth } from './MarketDepth';
import { buildShowcasePayload, SHOWCASE_PROFILE_NAME } from './showcaseProfile';

// ─── ConfigService integration ─────────────────────────────────────────
//
// This demo swaps the plain-`DexieAdapter` wiring from apps/demo-react
// for the ConfigService-backed `createConfigServiceStorage` factory.
// Profiles are persisted as `AppConfigRow` rows scoped by
// `(appId, userId, instanceId)`. A user switcher in the header lets you
// flip between two demo users and watch each user's profile set come
// and go — proving that userId scoping works end-to-end.
//
// ConfigManager runs in pure-Dexie mode (no REST endpoint). All profile
// rows live in IndexedDB under the `marketsui-config` database; they
// survive reload and persist across browser sessions just like Dexie,
// but now MarketsGrid is decoupled from the storage medium and the
// same setup would transparently hit a REST backend in prod.

const APP_ID = 'demo-configservice';
const DEMO_USERS = [
  { id: 'alice', label: 'Alice' },
  { id: 'bob', label: 'Bob' },
] as const;
type DemoUserId = (typeof DEMO_USERS)[number]['id'];

const CURRENT_USER_LS_KEY = 'demo-cs-current-user';

function initialUser(): DemoUserId {
  try {
    const stored = localStorage.getItem(CURRENT_USER_LS_KEY);
    if (stored && DEMO_USERS.some((u) => u.id === stored)) return stored as DemoUserId;
  } catch { /* access denied */ }
  return 'alice';
}

/** User-scoped active-profile key. Keeps Alice's "last open profile"
 *  from leaking into Bob's session on the same device. */
function scopedActiveProfileKey(gridId: string, userId: DemoUserId): string {
  return `${activeProfileKey(gridId)}:${userId}`;
}

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
// Seed flag is per-user so each demo user sees the showcase on first
// open — proves that profile data is user-scoped. Without this, Alice
// would seed the profile, Bob would switch in and find it already
// present (because we DO share the Dexie physical db), giving the
// false impression that Bob inherits Alice's profile.
function seedFlagKey(userId: DemoUserId): string {
  return `demo-cs-showcase-seeded:${GRID_ID}:${userId}`;
}

/**
 * First-boot seed of the "Showcase" profile for a user. Writes
 * through the same `storage` factory MarketsGrid uses, so the
 * resulting row is a real ConfigService `AppConfigRow` — you can
 * inspect it via the ConfigBrowser (once wired) to see the exact
 * `componentType: "markets-grid-profile"` / composite configId shape.
 */
async function ensureShowcaseSeedFor(
  userId: DemoUserId,
  storage: StorageAdapterFactory,
): Promise<void> {
  const flagKey = seedFlagKey(userId);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) {
      return;
    }
  } catch { /* access denied — press on */ }

  const adapter = storage(GRID_ID); // effectiveInstanceId = gridId for standalone
  const existing = await adapter.listProfiles(GRID_ID);
  if (existing.some((p) => p.name.toLowerCase() === SHOWCASE_PROFILE_NAME.toLowerCase())) {
    try { localStorage.setItem(flagKey, '1'); } catch { /* */ }
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

  // Point the user-scoped active-profile pointer at the fresh snapshot
  // so the first MarketsGrid render for this user lands on the showcase.
  try { localStorage.setItem(scopedActiveProfileKey(GRID_ID, userId), id); } catch { /* */ }
  try { localStorage.setItem(flagKey, '1'); } catch { /* */ }
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
  // Active user — flips the factory's closure, effectively replacing
  // every MarketsGrid's view of what profiles exist. Persisted so
  // reload keeps you as the same user.
  const [userId, setUserId] = useState<DemoUserId>(initialUser);
  // ConfigManager is created once per mount in dev (Dexie-only mode —
  // no REST endpoint means all data lives in IndexedDB). A real app
  // would pass `{ restUrl, apiKey }` here to push writes upstream.
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);
  const [cfgError, setCfgError] = useState<Error | null>(null);
  // Full-screen ConfigBrowser overlay — toggled by the admin action's
  // launch callback. A real app might use a route, OpenFin window, or
  // modal instead; the AdminAction onClick is just a thunk so we can
  // do whatever feels right in this context.
  const [configBrowserOpen, setConfigBrowserOpen] = useState(false);

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

  // Init ConfigManager once on mount. Dexie-only (no REST endpoint
  // in the demo). Awaiting init gates the factory behind a loaded
  // configuration — we don't want MarketsGrid to race its first
  // listProfiles call against a half-initialized Dexie table.
  //
  // Also publish the instance to @marketsui/openfin-platform's shared
  // singleton so `<ConfigBrowserPanel>` (which reads via getConfigManager())
  // sees the same ConfigManager. Without this, the browser's fallback
  // path would create a second manager against the same Dexie DB —
  // functional but wasteful.
  useEffect(() => {
    let alive = true;
    const mgr = createConfigManager({});
    mgr.init()
      .then(() => {
        if (!alive) return;
        publishSharedConfigManager(mgr); // share with ConfigBrowserPanel's hook
        setConfigManager(mgr); // local state for factory memoization
      })
      .catch((err) => { if (alive) setCfgError(err); });
    return () => {
      alive = false;
      mgr.dispose();
    };
  }, []);

  // Build the ConfigService-backed StorageAdapterFactory. Closes over
  // `(configManager, appId, userId)`; each <MarketsGrid> instance
  // resolves its own `effectiveInstanceId = instanceId ?? gridId`
  // and calls the factory to get a per-instance adapter.
  const storage = useMemo<StorageAdapterFactory | undefined>(() => {
    if (!configManager) return undefined;
    return createConfigServiceStorage({
      configManager,
      appId: APP_ID,
      userId,
    });
  }, [configManager, userId]);

  // Persist the selected user across reloads.
  useEffect(() => {
    try { localStorage.setItem(CURRENT_USER_LS_KEY, userId); } catch { /* */ }
  }, [userId]);

  // Admin actions surfaced in the MarketsGrid settings-sheet Tools
  // menu. One entry: launch the real @marketsui/config-browser
  // full-screen overlay. `createConfigBrowserAction` supplies the
  // default id/label/icon/description; we just wire the launch.
  const adminActions = useMemo<AdminAction[]>(() => [
    createConfigBrowserAction({
      launch: () => setConfigBrowserOpen(true),
    }),
  ], []);

  // One-shot seed of the Showcase profile per user. Seeds via the same
  // ConfigService factory MarketsGrid uses — the resulting row is a
  // real AppConfigRow you can inspect through the Config Browser.
  useEffect(() => {
    if (!storage) return;
    let alive = true;
    setSeeded(false);
    ensureShowcaseSeedFor(userId, storage).finally(() => {
      if (alive) setSeeded(true);
    });
    return () => { alive = false; };
  }, [storage, userId]);

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
          {/* ConfigService indicator — visual proof that profiles are
              being persisted through the factory, not a direct adapter. */}
          <span
            title="Profiles persist via @marketsui/config-service — scoped by (appId, userId, instanceId)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 26, padding: '0 10px', borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--secondary)',
              color: 'var(--muted-foreground)',
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            <Database size={11} strokeWidth={2} />
            ConfigService
          </span>

          {/* User switcher — flips the factory closure so profiles
              scope to a different userId. Effectively replaces every
              grid's profile set without unmounting. */}
          <div
            title="Active user. Profiles are scoped per-user; switching reveals a different profile set."
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              height: 26, padding: '0 4px 0 10px', borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--secondary)',
              color: 'var(--foreground)',
            }}
            data-testid="user-switcher"
          >
            <User size={11} strokeWidth={2} style={{ color: 'var(--muted-foreground)' }} />
            {DEMO_USERS.map((u) => (
              <button
                key={u.id}
                onClick={() => setUserId(u.id)}
                data-testid={`user-tab-${u.id}`}
                data-active={userId === u.id ? 'true' : 'false'}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  borderRadius: 3,
                  border: '1px solid transparent',
                  color: userId === u.id ? 'var(--bn-green, #2dd4bf)' : 'var(--muted-foreground)',
                  background: userId === u.id
                    ? 'color-mix(in srgb, var(--bn-green, #2dd4bf) 14%, transparent)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 120ms',
                }}
              >
                {u.label}
              </button>
            ))}
          </div>

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

      {cfgError ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          color: 'var(--destructive, #ef4444)', fontSize: 12,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}>
          <div style={{ fontWeight: 600 }}>ConfigService init failed</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{cfgError.message}</div>
        </div>
      ) : !configManager || !seeded ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
          fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {!configManager ? 'Initializing ConfigService…' : `Loading showcase for ${userId}…`}
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
            storage={storage}
            adminActions={adminActions}
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
        <Dashboard
          theme={theme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          storage={storage}
          adminActions={adminActions}
        />
      ) : (
        <MarketDepth isDark={isDark} />
      )}

      {/* ConfigBrowser full-screen overlay. Rendered only when opened
          from the Tools dropdown. The Panel self-bootstraps via
          @marketsui/openfin-platform's getConfigManager() — which we
          already pointed at the demo's ConfigManager via
          publishSharedConfigManager(). A real app would use a route or
          OpenFin window instead of an overlay; this is the quickest
          way to demo the integration without adding a router. */}
      {configBrowserOpen && (
        <div
          data-testid="config-browser-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', flexDirection: 'column',
            background: 'var(--background)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--card)', flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              Config Browser · {APP_ID} / {userId}
            </span>
            <button
              onClick={() => setConfigBrowserOpen(false)}
              data-testid="config-browser-close"
              title="Close Config Browser"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--secondary)',
                color: 'var(--foreground)',
                cursor: 'pointer',
              }}
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <ConfigBrowserPanel />
          </div>
        </div>
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
