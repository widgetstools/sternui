/**
 * React bindings for `@starui/host-data` — one context provider +
 * focused hooks.
 *
 * Surface:
 *   <DataServicesProvider services={ds} mode="lazy"|"eager" />
 *   useDataServices()              — escape hatch to the raw client
 *   useAppDataStore()              — reactive AppData snapshot
 *   useDataProviderConfig(id)      — single saved config row
 *   useResolvedCfg(cfg)            — apply {{...}} templates against AppData
 *   useProviderStream(id, cfg, listener, opts?) — attach with auto-detach
 *   useProviderStats(id, listener) — stats subscription with auto-detach
 *
 * Each hook is < 60 LOC; the file as a whole is the only React glue
 * the data-services runtime needs.
 */

import {
  createContext,
  use,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DataListener,
  SharedWorkerDataServicesClient,
  StatsListener,
} from '@starui/host-data/runtime/client';
import {
  AppDataMirror,
  DataProviderConfigStore,
  resolveCfg,
  type DataServices,
} from '@starui/host-data/runtime';
import type { ProviderStatus } from '@starui/host-data/runtime';
import type { DataProviderConfig, ProviderConfig } from '@starui/types';
import { LOGGED_IN_USER_ID } from '@starui/types';

// ─── Context ──────────────────────────────────────────────────────

interface ContextValue {
  client: SharedWorkerDataServicesClient;
  appData: AppDataMirror;
  configStore: DataProviderConfigStore;
}

const DataServicesContext = createContext<ContextValue | null>(null);

export interface DataServicesProviderProps {
  /** Bootstrap result from `bootstrapDataServices(...)`. */
  services: DataServices;
  /**
   * Hydration mode for the AppData mirror.
   *   - `'lazy'` (default): render immediately. Components see
   *     `useAppDataStore().loaded === false` on first paint;
   *     templates resolve once the mirror snapshot arrives.
   *   - `'eager'`: suspend until `services.ready` resolves. Wrap
   *     this Provider in a `<Suspense fallback>` boundary to control
   *     the loading UI.
   */
  mode?: 'eager' | 'lazy';
  /** Override the user id stamped on AppData rows authored from this
   *  tree. Defaults to the bootstrap's userId via `LOGGED_IN_USER_ID`. */
  userId?: string;
  /**
   * React children. Optional at the type level so callers (notably
   * `<AppShell>`) can pass a pre-bound element without children and
   * let the shell inject them via `React.cloneElement`. Runtime
   * behaviour is unchanged — the body still renders `{children}`,
   * which is harmless when undefined.
   */
  children?: ReactNode;
}

export function DataServicesProvider({ services, mode = 'lazy', userId, children }: DataServicesProviderProps) {
  // Eager mode: throw services.ready to nearest <Suspense fallback>.
  // React's `use()` hook unwraps the resolved promise on subsequent
  // renders, so once the mirror snapshot has applied the children
  // mount normally.
  if (mode === 'eager') use(services.ready);

  const effectiveUserId = userId ?? LOGGED_IN_USER_ID;

  const value = useMemo<ContextValue>(() => ({
    client: services.client,
    appData: services.appData,
    configStore: new DataProviderConfigStore(services.configManager),
  }), [services]);

  return (
    <DataServicesContext.Provider value={value}>
      <DataServicesUserIdContext.Provider value={effectiveUserId}>
        {children}
      </DataServicesUserIdContext.Provider>
    </DataServicesContext.Provider>
  );
}

function useDataServicesContext(): ContextValue {
  const ctx = useContext(DataServicesContext);
  if (!ctx) {
    throw new Error('useDataServices / useProviderStream must be inside <DataServicesProvider>');
  }
  return ctx;
}

// ─── Hook 1: raw client + stores escape hatch ────────────────────

export function useDataServices(): ContextValue {
  return useDataServicesContext();
}

// ─── Hook 2: AppData reactive snapshot ───────────────────────────
//
// Returns a stable object whose `.get(name, key)` reflects the current
// snapshot, plus a counter that bumps every time AppData changes so
// downstream hooks can re-resolve cfgs. The store loads on first use
// (idempotent across re-renders).

export interface AppDataView {
  store: AppDataMirror;
  /** Bumps on every AppData mutation. Use as a dependency to drive
   *  re-resolution of templates. */
  version: number;
  /** Whether `ready()` has resolved at least once. False on the very
   *  first render before async load completes. */
  loaded: boolean;
}

export function useAppDataStore(): AppDataView {
  const { appData } = useDataServicesContext();
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    appData.ready().then(() => { if (!cancelled) setLoaded(true); });
    const off = appData.subscribe(() => setVersion((v) => v + 1));
    return () => { cancelled = true; off(); };
  }, [appData]);

  return { store: appData, version, loaded };
}

// ─── Hook 2b: scoped AppData hook for a single provider ─────────
//
// Reactive, name-scoped view of one AppData provider's variables.
// Consumers anywhere in the tree can read + mutate values without
// touching the store directly:
//
//   const { values, get, set } = useAppData('positions');
//   await set('asOfDate', '2026-04-30');
//   const dt = get('asOfDate');
//
// Updates fire whenever any key on this named provider changes.
// `set()` writes through `AppDataStore.set()`, which honours
// ConfigManager persistence (durability semantics live there).

export interface AppDataHandle {
  /** Current key→value map. Empty until the store has loaded. */
  values: Record<string, unknown>;
  /** Whether `AppDataStore.ready()` has resolved at least once. */
  loaded: boolean;
  /** Sync read. Returns undefined for unknown keys or pre-load. */
  get(key: string): unknown;
  /** Write a single key. Creates the AppData row on first set if it
   *  doesn't already exist (with the active user as owner, not public). */
  set(key: string, value: unknown): Promise<void>;
  /** Replace the entire variable map for this provider in one round-trip. */
  setMany(values: Record<string, unknown>): Promise<void>;
}

export function useAppData(providerName: string): AppDataHandle {
  const { store, version, loaded } = useAppDataStore();

  const values = useMemo<Record<string, unknown>>(() => {
    const row = store.list().find((r) => r.name === providerName);
    return row ? { ...row.values } : {};
    // version drives re-computation on every AppData mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerName, store, version, loaded]);

  const get = useCallback((key: string) => store.get(providerName, key), [store, providerName]);

  const set = useCallback(
    (key: string, value: unknown) => store.set(providerName, key, value),
    [store, providerName],
  );

  const setMany = useCallback(
    async (next: Record<string, unknown>) => {
      const existing = store.list().find((r) => r.name === providerName);
      await store.upsertConfig({
        configId: existing?.configId ?? '',
        name: providerName,
        description: existing?.description,
        isPublic: existing?.isPublic ?? false,
        values: next,
        // userId is single-user-pinned across the codebase. Preserve a
        // public ('system') row's userId; otherwise land on the canonical
        // logged-in user id so a fresh row never gets userId=''.
        userId: existing?.userId ?? LOGGED_IN_USER_ID,
      });
    },
    [store, providerName],
  );

  return { values, loaded, get, set, setMany };
}

// ─── Hook 3: single DataProviderConfig row ───────────────────────

export interface DataProviderConfigView {
  cfg: DataProviderConfig | null;
  loading: boolean;
  error?: string;
}

export function useDataProviderConfig(providerId: string | null | undefined): DataProviderConfigView {
  const { configStore } = useDataServicesContext();
  const [view, setView] = useState<DataProviderConfigView>({ cfg: null, loading: Boolean(providerId) });

  useEffect(() => {
    let cancelled = false;
    if (!providerId) {
      setView({ cfg: null, loading: false });
      return;
    }
    setView({ cfg: null, loading: true });
    configStore.get(providerId)
      .then((cfg) => { if (!cancelled) setView({ cfg, loading: false }); })
      .catch((err: unknown) => {
        if (!cancelled) setView({ cfg: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [providerId, configStore]);

  return view;
}

// ─── Hook 3b: list DataProvider configs ──────────────────────────
//
// Returns the union of public (userId='system') + the active user's
// own DataProvider rows, optionally filtered by subtype. Re-fetches
// when `version` bumps — exposed via `refresh()` so consumers can
// re-pull after a save without re-mounting the picker.

export interface DataProvidersListView {
  configs: readonly DataProviderConfig[];
  loading: boolean;
  error?: string;
  refresh(): void;
}

export function useDataProvidersList(
  opts: { subtype?: ProviderConfig['providerType']; includeAppData?: boolean } = {},
): DataProvidersListView {
  const { configStore } = useDataServicesContext();
  const userId = useUserIdFromContext();
  const [view, setView] = useState<{ configs: readonly DataProviderConfig[]; loading: boolean; error?: string }>(
    { configs: [], loading: true },
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setView((v) => ({ ...v, loading: true }));
    const listOpts: { subtype?: ProviderConfig['providerType']; includeAppData?: boolean } = {};
    if (opts.subtype) listOpts.subtype = opts.subtype;
    if (opts.includeAppData) listOpts.includeAppData = true;
    configStore.list(userId, listOpts)
      .then((rows) => { if (!cancelled) setView({ configs: rows, loading: false }); })
      .catch((err: unknown) => {
        if (!cancelled) setView({ configs: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [configStore, userId, opts.subtype, opts.includeAppData, tick]);

  return { ...view, refresh };
}

// Internal: read userId out of the context so list/save hooks don't
// re-take it as a prop.
function useUserIdFromContext(): string {
  const ctx = useContext(DataServicesUserIdContext);
  if (ctx === null) {
    throw new Error('useDataProvidersList requires <DataServicesProvider userId="...">');
  }
  return ctx;
}

const DataServicesUserIdContext = createContext<string | null>(null);

// ─── Hook 4: template-resolved cfg ───────────────────────────────
//
// Walks any `{{name.key}}` tokens in the cfg's strings against the
// current AppData snapshot. Returns a stable object that swaps when
// any referenced AppData key changes, so downstream
// `useProviderStream` deps can trigger a re-attach.

export function useResolvedCfg(cfg: ProviderConfig | null | undefined): ProviderConfig | null {
  const { store, version, loaded } = useAppDataStore();

  return useMemo(() => {
    if (!cfg) return null;
    if (!loaded) return cfg; // pre-load, return as-is — caller usually waits for `loaded` anyway
    return resolveCfg(cfg, (name, key) => store.get(name, key));
    // `version` participates so any AppData mutation re-runs resolveCfg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, version, loaded, store]);
}

// ─── Hook 5: provider data subscription ──────────────────────────
//
// Hides the manual subId tracking + detach-on-unmount. Listener
// methods are stored in a ref so callers can pass inline closures
// without re-subscribing on every render — only `providerId` and the
// cfg identity drive resubscription.

export interface ProviderStreamHandle {
  status: ProviderStatus;
  error?: string;
  /** Re-attach with `extra` — convenience around the toolbar refresh
   *  button. The Hub will turn this into a `provider.restart(extra)`. */
  refresh(extra?: Record<string, unknown>): void;
}

export function useProviderStream<T = unknown>(
  providerId: string | null | undefined,
  cfg: ProviderConfig | null | undefined,
  listener: DataListener<T>,
): ProviderStreamHandle {
  const { client } = useDataServicesContext();
  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);
  const subIdRef = useRef<string | null>(null);

  const listenerRef = useRef(listener);
  useEffect(() => { listenerRef.current = listener; }, [listener]);

  useEffect(() => {
    if (!providerId || !cfg) {
      setStatus('loading');
      return;
    }
    setStatus('loading');
    setError(undefined);
    const sub = client.attach<T>(providerId, cfg, {
      onDelta: (rows, replace) => listenerRef.current.onDelta(rows, replace),
      onStatus: (s, err) => {
        setStatus(s);
        setError(err);
        listenerRef.current.onStatus(s, err);
      },
    });
    subIdRef.current = sub;
    return () => {
      client.detach(sub);
      subIdRef.current = null;
    };
  }, [providerId, cfg, client]);

  const refresh = useCallback((extra?: Record<string, unknown>) => {
    if (!providerId) return;
    // Send a fresh attach with extra; the Hub forwards to provider.restart.
    client.attach(providerId, undefined, {
      onDelta: () => undefined,
      onStatus: () => undefined,
    }, { extra: extra ?? { __refresh: Date.now() } });
  }, [client, providerId]);

  return { status, error, refresh };
}

// ─── Hook 6: provider stats subscription ─────────────────────────

export function useProviderStats(
  providerId: string | null | undefined,
  listener: StatsListener,
): void {
  const { client } = useDataServicesContext();
  const listenerRef = useRef(listener);
  useEffect(() => { listenerRef.current = listener; }, [listener]);

  useEffect(() => {
    if (!providerId) return;
    const sub = client.attachStats(providerId, {
      onStats: (stats) => listenerRef.current.onStats(stats),
    });
    return () => client.detach(sub);
  }, [providerId, client]);
}

// ─── Re-exports ──────────────────────────────────────────────────

export type {
  DataListener,
  StatsListener,
  AttachOpts,
  SubId,
  SharedWorkerDataServicesClient,
} from '@starui/host-data/runtime/client';
export type {
  ProviderStats,
  ProviderStatus,
} from '@starui/host-data/runtime';
