/**
 * MarketsGridContainer — v2.
 *
 *   - Provider selection persists at the GRID level (not per-profile)
 *     in the SAME storage row MarketsGrid uses for its profile-set,
 *     via the StorageAdapter's `loadGridLevelData / saveGridLevelData`
 *     methods. Profile switches preserve the selection because it's
 *     not stored in any individual profile.
 *   - Provider pickers, mode toggle, refresh/reload, and edit live in
 *     the grid customizer → Custom Settings panel (not a toolbar strip).
 *
 *   Persistence flow:
 *     - Container resolves the storage adapter from
 *       `props.storage({ instanceId, appId, userId })` once on mount.
 *     - Reads `loadGridLevelData(gridId)`; while pending, renders a
 *       small loading state. This guarantees MarketsGrid mounts
 *       exactly once with the correct rowIdField for the persisted
 *       provider — no remount-on-load loop.
 *     - On every selection mutation, calls `saveGridLevelData(gridId,
 *       selection)`. The adapter writes back to the same bundled row
 *       that holds the profile-set (top-level field, not nested in a
 *       profile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@starui/grid';
import { isHistoricalToolbarDate } from '@starui/grid/customizer';
import type { MarketsGridProps, MarketsGridHandle, StorageAdapterFactory, ProviderGridHostApi, GridEventBindingsHostApi, MarketsGridEventHandlerRegistry, MarketsGridHandlerMeta } from '@starui/grid';
import {
  MARKETS_GRID_EVENT_CATALOG,
  createMarketsGridContainerEventBus,
  useMarketsGridEventBridge,
} from '@starui/grid';
import type { StompProviderConfig } from '@starui/types';
import { traceStompProviderCfg } from '@starui/host-data/runtime';
import type { AppDataLookup, StorageAdapter } from '@starui/engine';
import {
  useDataProviderConfig,
  useResolvedCfg,
  useDataProvidersList,
  useAppDataStore,
  useDataProvider,
} from '@starui/host-data-react/runtime';
import { buildColumnDefs } from './buildColumnDefs.js';
import { createApplyProviderToGridState } from './applyProviderToGrid.js';
import { LOGGED_IN_USER_ID } from '@starui/types';
import {
  createConfigBrowserAction,
} from '@starui/config-browser';
import type { AdminAction } from '@starui/grid';
import { ConfigBrowserDialog } from './ConfigBrowserDialog.js';
import { ProviderEditorDialog } from './ProviderEditorDialog.js';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';
import { isOpenFinRuntime } from './openFinRuntime.js';
import {
  DEFAULT_PROVIDER_SELECTION,
  normalizeGridLevelData,
  serializeGridLevelData,
  type GridLevelStateV1,
  type ProviderMode,
  type ProviderSelection,
} from './gridLevelState.js';

export type { ProviderMode, ProviderSelection } from './gridLevelState.js';

const EMPTY: never[] = [];

/** Stable id for overflow-menu e2e (`admin-action-data-provider-editor`). */
export const DATA_PROVIDER_EDITOR_ACTION_ID = 'data-provider-editor';

function mergeAdminActions(
  prepend: AdminAction[],
  infra: AdminAction[],
  user: AdminAction[],
): AdminAction[] {
  const userIds = new Set(user.map((a) => a.id));
  const dedupedInfra = infra.filter((a) => !userIds.has(a.id));
  return [...prepend, ...dedupedInfra, ...user];
}

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * subscribe / update / unsubscribe behavior. The render-time log fires on
 * every render of the container; the update-batch logs fire per delta.
 * Both are off by default to avoid measurable CPU cost on busy providers.
 */
const DEBUG = false;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface MarketsGridContainerProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<MarketsGridProps<TData>, 'rowData' | 'rowIdField' | 'columnDefs' | 'gridLevelData' | 'onGridLevelDataLoad' | 'headerExtras'> {
  /**
   * Where to write the historical date when the user picks one.
   * Format: `'appDataProviderName.key'` — e.g. `'positions.asOfDate'`.
   * The historical provider's cfg should reference this entry via
   * `{{positions.asOfDate}}` so the value flows through.
   * Required when a historical provider is supplied.
   */
  historicalDateAppDataRef?: string;
  /**
   * OpenFin only: called when the user edits the active provider from
   * Custom Settings. In a browser runtime the container opens
   * {@link DataProviderEditor} in a shadcn dialog instead.
   */
  onEditProvider?(providerId: string | null): void;
  /**
   * OpenFin only: called when the user opens Config Browser from the
   * toolbar overflow menu. In a browser runtime the container opens
   * {@link ConfigBrowserPanel} in a shadcn dialog instead.
   */
  onOpenConfigBrowser?(): void;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
  /**
   * When no live provider is persisted in grid-level data, select this
   * provider on first load (demo / single-provider apps).
   */
  defaultLiveProviderId?: string;
  /**
   * When no historical provider is persisted in grid-level data, select
   * this provider when the user picks a past toolbar date.
   */
  defaultHistoricalProviderId?: string;
  /** App registry of event handler functions keyed by stable id. */
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  /** Optional labels for Custom Settings event binding UI. */
  handlerMeta?: MarketsGridHandlerMeta;
}

const DEFAULT_SELECTION = DEFAULT_PROVIDER_SELECTION;

export function MarketsGridContainer<TData extends Record<string, unknown> = Record<string, unknown>>(
  props: MarketsGridContainerProps<TData>,
) {
  const {
    historicalDateAppDataRef,
    onEditProvider,
    onOpenConfigBrowser,
    onError,
    onReady: onReadyProp,
    defaultLiveProviderId,
    defaultHistoricalProviderId,
    gridEventHandlers,
    handlerMeta,
    ...marketsGridProps
  } = props;

  const containerEventBus = useMemo(() => createMarketsGridContainerEventBus(), []);
  const [gridHandle, setGridHandle] = useState<MarketsGridHandle | null>(null);

  const appData = useAppDataStore();

  // Adapt AppDataStore → AppDataLookup for the platform's
  // resources.appData(). Plumbed into MarketsGrid so column-customization's
  // cell-editor `valuesSource` ({{name.key}}) bindings resolve at edit
  // time. Stable across re-renders unless the underlying store ref flips
  // (typically only on user-id swap).
  const appDataLookup = useMemo<AppDataLookup>(() => ({
    get: (name, key) => appData.store.get(name, key),
    listProviders: () => appData.store.list().map((row) => row.name),
    keysOf: (name) => {
      const row = appData.store.list().find((r) => r.name === name);
      return row ? Object.keys(row.values) : [];
    },
    subscribe: (fn) => appData.store.subscribe(fn),
    set: (name: string, key: string, value: unknown) => {
      void appData.store.set(name, key, value);
    },
  }), [appData.store]);

  // ── Storage adapter ──────────────────────────────────────────────
  //
  // Same factory MarketsGrid uses for profile persistence; we resolve
  // a copy here to read/write the grid-level-data field of the same
  // row. Memoised on the identity-affecting tuple so a userId swap
  // (rare) rebuilds the adapter cleanly.
  const storageFactory = (props as { storage?: StorageAdapterFactory }).storage;
  const adapter = useMemo<StorageAdapter | null>(() => {
    if (!storageFactory) return null;
    const instanceId = props.instanceId ?? props.gridId;
    return storageFactory({
      instanceId,
      gridId: props.gridId,
      appId: props.appId,
      userId: props.userId,
    });
  }, [storageFactory, props.instanceId, props.gridId, props.appId, props.userId]);

  // ── Picker state ──────────────────────────────────────────────────
  //
  // `loaded === false` while we wait for the first load. Once it
  // flips, MarketsGrid mounts with the persisted selection in place
  // — no second mount required when the load resolves.
  const [selection, setSelection] = useState<ProviderSelection>(DEFAULT_SELECTION);
  const [persistedCaption, setPersistedCaption] = useState<string | undefined>(undefined);
  const [eventBindings, setEventBindings] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [toolbarDate, setToolbarDate] = useState(todayIsoDate);
  // Carries the *intent* of a queued toolbar reload — the mode + asOfDate the
  // reload should run against — not a bare boolean. The ref is set
  // synchronously in the handler while the matching state updates commit a
  // render later; keying off the intent lets the reload effect fire exactly
  // once, when committed state catches up, with the correct payload.
  const pendingToolbarReloadRef = useRef<{ mode: ProviderMode; asOfDate: string | null } | null>(null);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [configBrowserOpen, setConfigBrowserOpen] = useState(false);

  // Fill empty provider slots from the configured defaults. Shared by the
  // initial load and the import-restore handler so both reconcile the
  // persisted selection against host defaults identically.
  const applyDefaults = useCallback(
    (sel: ProviderSelection): ProviderSelection => {
      let next = sel;
      if (!next.liveProviderId && defaultLiveProviderId) {
        next = { ...next, liveProviderId: defaultLiveProviderId, mode: 'live' };
      }
      if (!next.historicalProviderId && defaultHistoricalProviderId) {
        next = { ...next, historicalProviderId: defaultHistoricalProviderId };
      }
      return next;
    },
    [defaultLiveProviderId, defaultHistoricalProviderId],
  );

  // Initial load. If the adapter doesn't implement grid-level data
  // (older third-party adapters), or there's no adapter at all, we
  // fall through to the default selection and mark as loaded.
  useEffect(() => {
    let cancelled = false;

    if (!adapter?.loadGridLevelData) {
      if (defaultLiveProviderId || defaultHistoricalProviderId) {
        setSelection(applyDefaults({ ...DEFAULT_SELECTION }));
      }
      setLoaded(true);
      return;
    }
    void adapter
      .loadGridLevelData(props.gridId)
      .then((raw) => {
        if (cancelled) return;
        const state = normalizeGridLevelData(raw);
        setSelection(applyDefaults(state.provider));
        setPersistedCaption(state.caption);
        setEventBindings(state.eventBindings ?? {});
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSelection({ ...DEFAULT_SELECTION });
        setPersistedCaption(undefined);
        setEventBindings({});
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [adapter, props.gridId, applyDefaults]);

  // Restore toolbar date from AppData when persisted mode is historical.
  useEffect(() => {
    if (!loaded || selection.mode !== 'historical' || !historicalDateAppDataRef) return;
    const dot = historicalDateAppDataRef.indexOf('.');
    if (dot <= 0) return;
    const name = historicalDateAppDataRef.slice(0, dot);
    const key = historicalDateAppDataRef.slice(dot + 1);
    const val = appData.store.get(name, key);
    if (typeof val === 'string' && isHistoricalToolbarDate(val)) {
      setToolbarDate(val);
      setAsOfDate(val);
      pendingToolbarReloadRef.current = { mode: 'historical', asOfDate: val };
    }
  }, [loaded, selection.mode, historicalDateAppDataRef, appData.store]);

  // Persist on mutation. `lastSavedRef` skips the initial sync when
  // `loaded` flips (state just came FROM disk; saving back would be a
  // no-op write) AND handles React StrictMode's double-effect correctly
  // across remounts. Tracks both the picker selection and the persisted
  // caption — they share the same gridLevelData blob.
  const lastSavedRef = useRef<GridLevelStateV1 | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const next = serializeGridLevelData({
      v: 1,
      provider: selection,
      caption: persistedCaption,
      eventBindings: Object.keys(eventBindings).length > 0 ? eventBindings : undefined,
    });
    if (lastSavedRef.current === null) {
      lastSavedRef.current = next;
      return;
    }
    const prev = lastSavedRef.current;
    if (
      prev.provider.liveProviderId === next.provider.liveProviderId
      && prev.provider.historicalProviderId === next.provider.historicalProviderId
      && prev.provider.mode === next.provider.mode
      && prev.caption === next.caption
      && JSON.stringify(prev.eventBindings ?? {}) === JSON.stringify(next.eventBindings ?? {})
    ) {
      return;
    }
    lastSavedRef.current = next;
    if (adapter?.saveGridLevelData) {
      void adapter.saveGridLevelData(props.gridId, next);
    }
  }, [selection, persistedCaption, eventBindings, loaded, adapter, props.gridId]);

  // Apply grid-level data restored by a profile import (schemaVersion 2).
  // The ProfileManager has already written the blob to the same backing
  // row and emitted `gridLevelData:imported`; this mirrors it into live
  // picker/caption/binding state so the view updates without a reload.
  // `lastSavedRef` is primed to the applied value so the persist effect
  // above treats it as already-on-disk and skips a redundant write (which
  // would also bump the row version unnecessarily).
  const applyImportedGridLevelData = useCallback(
    (raw: unknown) => {
      const state = normalizeGridLevelData(raw);
      const provider = applyDefaults(state.provider);
      const bindings = state.eventBindings ?? {};
      lastSavedRef.current = serializeGridLevelData({
        v: 1,
        provider,
        caption: state.caption,
        eventBindings: Object.keys(bindings).length > 0 ? bindings : undefined,
      });
      setSelection(provider);
      setPersistedCaption(state.caption);
      setEventBindings(bindings);
    },
    [applyDefaults],
  );

  // Subscribe to the grid's `gridLevelData:imported` event per mounted
  // handle. A provider-switch remount swaps `gridHandle` (new platform),
  // so re-binding on its identity keeps the listener on the live bus and
  // cleans up the stale one.
  useEffect(() => {
    const events = gridHandle?.platform?.events;
    if (!events) return;
    return events.on('gridLevelData:imported', ({ data }) => {
      applyImportedGridLevelData(data);
    });
  }, [gridHandle, applyImportedGridLevelData]);

  // Caller may also want to observe caption edits — chain.
  const callerOnCaptionChange = (marketsGridProps as { onCaptionChange?: (next: string) => void }).onCaptionChange;
  const handleCaptionChange = useCallback((next: string) => {
    setPersistedCaption(next);
    callerOnCaptionChange?.(next);
  }, [callerOnCaptionChange]);

  // Effective caption: persisted value (once loaded) wins over the
  // prop, which is treated as the initial / fallback. The downstream
  // MarketsGrid still gates RENDER on `tabsHidden` — this just decides
  // WHAT to show when render is allowed.
  const propCaption = (marketsGridProps as { caption?: string }).caption;
  const effectiveCaption = persistedCaption ?? propCaption;

  // Changing the live/historical provider or the mode changes `activeId`,
  // which is part of the <MarketsGrid> `key` — so the grid remounts and a
  // fresh ProfileManager re-hydrates the customizer from disk. Under
  // `disableAutoSave`, other tabs' per-card "Save"s live only in the
  // in-memory store, so that remount would silently discard them (e.g. a
  // Grid Options status-bar edit lost when the provider is switched).
  // Save-and-switch: flush the working set to disk via the grid's own
  // saveAll() BEFORE applying the selection, so the remount re-hydrates the
  // latest state. `saveAll` is a stable bridge to the live store (the
  // handle's `profiles.isDirty` snapshot is captured at onReady and would
  // be stale), so we call it unconditionally — a clean save is a harmless
  // no-op write.
  const applyProviderSelection = useCallback(
    async (apply: (s: ProviderSelection) => ProviderSelection) => {
      const handle = gridHandleRef.current;
      if (handle) {
        try {
          await handle.saveAll();
        } catch (err) {
          console.warn('[markets-grid] save-before-provider-switch failed:', err);
        }
      }
      setSelection(apply);
    },
    [],
  );

  const setLiveId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, liveProviderId: id }));
  }, [applyProviderSelection]);
  const setHistoricalId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, historicalProviderId: id }));
  }, [applyProviderSelection]);
  const setMode = useCallback((mode: ProviderMode) => {
    void applyProviderSelection((s) => ({ ...s, mode }));
  }, [applyProviderSelection]);

  // ── Active provider resolution ────────────────────────────────────
  const activeId = selection.mode === 'live' ? selection.liveProviderId : selection.historicalProviderId;
  const activeRow = useDataProviderConfig(activeId);
  const activeCfg = useResolvedCfg(activeRow.cfg?.config ?? null);

  // List of available providers per slot. Subtype filter could be
  // tightened (live=stomp, historical=rest) but keeping it open is
  // friendlier — the user might want a Mock for either slot in dev.
  const liveList = useDataProvidersList();
  const histList = useDataProvidersList();

  // Log active provider name on change so it's easy to confirm which
  // provider a given grid is bound to at runtime.
  const activeProviderName = activeRow.cfg?.name ?? null;
  useEffect(() => {
    if (activeRow.loading) return;
    // eslint-disable-next-line no-console
    console.log(
      `[markets-grid] gridId=%s mode=%s providerId=%s providerName=%s`,
      props.gridId,
      selection.mode,
      activeId ?? '(none)',
      activeProviderName ?? '(none)',
    );
  }, [props.gridId, selection.mode, activeId, activeProviderName, activeRow.loading]);

  // Date picker writes through to AppData; historical refresh passes
  // `{ asOfDate }` via `provider.restart()`.
  const setAsOfDateAndPersist = useCallback((next: string | null) => {
    setAsOfDate(next);
    if (next) {
      setToolbarDate(next);
    }
    if (next && historicalDateAppDataRef) {
      const dot = historicalDateAppDataRef.indexOf('.');
      if (dot > 0) {
        const name = historicalDateAppDataRef.slice(0, dot);
        const key = historicalDateAppDataRef.slice(dot + 1);
        void appData.store.set(name, key, next);
      }
    }
  }, [appData.store, historicalDateAppDataRef]);

  const effectiveHistoricalProviderId =
    selection.historicalProviderId ?? defaultHistoricalProviderId ?? null;
  const toolbarDateHistoryEnabled = effectiveHistoricalProviderId != null;
  const isHistoricalView =
    selection.mode === 'historical'
    && asOfDate != null
    && isHistoricalToolbarDate(asOfDate);
  const historicalViewMessage = isHistoricalView
    ? `Viewing historical data as of ${asOfDate}. Editing is disabled.`
    : undefined;

  const handleToolbarDateChange = useCallback((next: string) => {
    setToolbarDate(next);
    const isHistorical = isHistoricalToolbarDate(next);

    if (isHistorical) {
      if (!effectiveHistoricalProviderId) {
        (onError ?? defaultOnError)(new Error(
          'Cannot load historical data: no historical provider is configured.',
        ));
        return;
      }
      setAsOfDateAndPersist(next);
      setSelection((s) => ({
        ...s,
        mode: 'historical',
        historicalProviderId: s.historicalProviderId ?? defaultHistoricalProviderId ?? null,
      }));
      pendingToolbarReloadRef.current = { mode: 'historical', asOfDate: next };
      containerEventBus.emit('toolbar:dateChanged', { date: next, historical: true });
      return;
    }

    if (selection.mode === 'historical') {
      setAsOfDate(null);
      setMode('live');
      pendingToolbarReloadRef.current = { mode: 'live', asOfDate: null };
    }
    containerEventBus.emit('toolbar:dateChanged', { date: next, historical: false });
  }, [
    effectiveHistoricalProviderId,
    defaultHistoricalProviderId,
    setAsOfDateAndPersist,
    setMode,
    selection.mode,
    onError,
    containerEventBus,
  ]);

  // `keyColumn` may be a single column name OR an array of column
  // names (composite key — values joined with `-`, see
  // `composeRowId` in @starui/shared-types). We pass the raw shape
  // through to MarketsGrid + use it for the live-update add/update
  // dispatch below so the cache key matches AG-Grid's getRowId
  // byte-for-byte.
  const rowIdField = activeRow.cfg
    ? (activeCfg as { keyColumn?: string | readonly string[] } | null)?.keyColumn ?? null
    : null;
  // Stable string representation for keys / log output. For arrays,
  // joining is fine — colon separator avoids collision with the data
  // separator (`-`).
  const rowIdFieldKey = Array.isArray(rowIdField) ? rowIdField.join(':') : rowIdField;

  // Map the provider's persisted `columnDefinitions` into AG-Grid
  // ColDefs. `buildColumnDefs` handles three cases per column:
  //   1. a DSL `valueGetter` expression → compiled (CSP-safe) getter,
  //   2. a dotted `field` → nested-path default getter,
  //   3. a flat field → AG-Grid's native fast path.
  // See ./buildColumnDefs.ts for the precedence + error-fallback rules.
  const columnDefs = useMemo<ColDef<TData>[] | null>(
    () =>
      buildColumnDefs<TData>(
        (activeCfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions,
      ),
    [activeCfg],
  );

  // ── Grid lifecycle: capture the gridApi when AG-Grid is ready ────
  //
  // The grid mounts twice across a normal session:
  //   1. The "no provider" placeholder grid (empty cols, sentinel
  //      rowIdField). Press Alt+Shift+P / Meta+Shift+P to reveal the
  //      toolbar and pick a provider from the empty state.
  //   2. The real data-attached grid, mounted with a key that includes
  //      the provider id and key column.
  //
  // We only care about the api from mount #2. To distinguish the two
  // we stamp the captured api with the `key` it was created for; the
  // subscribe effect below only fires when the stamped key matches
  // the current `expectedKey`. An onReady from the placeholder grid
  // (where `expectedKey === null`) is a no-op stamp.
  const expectedKey = (activeId && !activeRow.loading && rowIdField && columnDefs)
    ? `${activeId}::${rowIdFieldKey}`
    : null;

  const [stamped, setStamped] = useState<{ key: string; api: GridApi<TData> } | null>(null);

  const expectedKeyRef = useRef(expectedKey);
  useEffect(() => { expectedKeyRef.current = expectedKey; }, [expectedKey]);

  // Latest grid handle, kept in a ref so the provider-change setters can
  // flush a save before the switch remounts the grid (see
  // `applyProviderSelection`) without re-creating those callbacks or
  // closing over a stale handle.
  const gridHandleRef = useRef<MarketsGridHandle | null>(null);

  const onReady = useCallback((handle: MarketsGridHandle) => {
    const k = expectedKeyRef.current;
    if (k) {
      setStamped({ key: k, api: handle.gridApi as unknown as GridApi<TData> });
    }
    gridHandleRef.current = handle;
    setGridHandle(handle);
    onReadyProp?.(handle);
  }, [onReadyProp]);

  useMarketsGridEventBridge({
    handle: gridHandle,
    gridId: props.gridId,
    instanceId: props.instanceId ?? props.gridId,
    appId: props.appId,
    userId: props.userId,
    appData: appDataLookup,
    eventBindings,
    handlers: gridEventHandlers,
    containerBus: containerEventBus,
  });

  const liveApi = stamped && stamped.key === expectedKey ? stamped.api : null;

  // ── IDataProvider hook ───────────────────────────────────────────
  //
  // Hub config comes from the worker catalog on `start()` — we keep
  // `useDataProviderConfig` / `useResolvedCfg` for column defs and
  // the picker only, not as an attach cfg pass-through.
  const providerReady = Boolean(activeId && !activeRow.loading && rowIdField && columnDefs);
  const {
    provider,
    refresh: refreshProvider,
    restart: restartProvider,
  } = useDataProvider<TData>(providerReady ? activeId : null, { autoStart: false });

  // Loading-overlay state — derived synchronously from a "subscription
  // key" so the overlay appears on the SAME render that mounts the
  // grid. If we used a useState+useEffect pair, AG-Grid would briefly
  // flash its built-in "No Rows To Show" overlay between mount and
  // the first useEffect tick. We track which subscription key has had
  // its snapshot resolved, and the overlay shows whenever the current
  // subscription key !== the resolved key.
  const subscriptionKey =
    activeId && rowIdField ? `${activeId}::${rowIdFieldKey}` : null;
  const [resolvedSubKey, setResolvedSubKey] = useState<string | null>(null);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>(undefined);
  // True while the provider is in the 'loading' phase of a peer-
  // triggered re-snapshot. Driven by the worker's status events, which
  // every subscriber receives — so all connected windows show the
  // overlay together, not just the one that pressed the refresh button.
  const [isRefetching, setIsRefetching] = useState(false);
  // Bubbled up from MarketsGrid whenever the active profile is being
  // persisted (Save button or save-on-switch). We reuse the same
  // snapshot loading overlay component for visual consistency, just
  // with a "Saving…" caption.
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  // True when the live provider stops or the transport disconnects.
  // Grid data may be stale; MarketsGrid shows a flashing banner and
  // disables cell editing until status returns to ready.
  const [providerDisconnected, setProviderDisconnected] = useState(false);
  const [disconnectDetail, setDisconnectDetail] = useState<string | undefined>();
  const isLoadingSnapshot = subscriptionKey !== null && subscriptionKey !== resolvedSubKey;
  const showLoadingOverlay = isLoadingSnapshot || isRefetching || isSavingProfile;

  const dataStaleMessage = disconnectDetail
    ? `Grid data is stale — ${disconnectDetail}. Edits are disabled until the connection is restored.`
    : undefined;

  const prevSelectionRef = useRef<ProviderSelection | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const prev = prevSelectionRef.current;
    if (prev === null) {
      prevSelectionRef.current = selection;
      return;
    }
    if (
      prev.liveProviderId === selection.liveProviderId
      && prev.historicalProviderId === selection.historicalProviderId
      && prev.mode === selection.mode
    ) {
      return;
    }
    prevSelectionRef.current = selection;
    containerEventBus.emit('provider:switched', {
      liveProviderId: selection.liveProviderId,
      historicalProviderId: selection.historicalProviderId,
      mode: selection.mode,
    });
  }, [loaded, selection, containerEventBus]);

  useEffect(() => {
    if (!loaded) return;
    containerEventBus.emit('provider:dataStale', {
      stale: providerDisconnected,
      message: dataStaleMessage,
    });
  }, [loaded, providerDisconnected, dataStaleMessage, containerEventBus]);

  useEffect(() => {
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);
  }, [activeId]);

  // Render-time log of the gating inputs so you can see WHY the
  // subscribe effect isn't firing yet (or that it IS gated correctly
  // and waiting for the missing piece). Gated by `DEBUG` because this
  // fires on every render and the container does re-render frequently
  // when status/refreshTick/selection mutate.
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[v2/grid] render gate: loaded=%s liveApi=%s activeId=%s rowIdField=%s columnDefs=%s cfgLoaded=%s`,
      loaded, Boolean(liveApi), activeId, rowIdField, Boolean(columnDefs), Boolean(activeCfg),
    );
  }

  useEffect(() => {
    if (!liveApi || !provider || !activeId) {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid]   provider wiring skipped: liveApi=%s provider=%s activeId=%s`,
          Boolean(liveApi), Boolean(provider), activeId);
      }
      return;
    }

    setLoadRowCount(undefined);
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);

    const thisSubKey = subscriptionKey ?? `${activeId}::${rowIdFieldKey}`;
    const t0 = performance.now();
    // eslint-disable-next-line no-console
    console.log(
      '[refresh] %c5. provider wiring effect fired%c provider=%s',
      'color:#ec4899', '', activeId,
    );

    let cancelled = false;
    const gridApply = createApplyProviderToGridState();
    const providerStatusRef = { current: 'loading' as 'loading' | 'ready' | 'error' };

    const unsubRows = provider.onRowsReceived((count) => {
      if (cancelled) return;
      setLoadRowCount(count);
    });

    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      Promise.resolve().then(() => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log(
          '[refresh] %cflushAsyncTransactions BEFORE commit%c pendingAdds=%d gridRows=%d',
          'color:#f97316;font-weight:bold', '',
          gridApply.getPendingAddCount(), liveApi.getDisplayedRowCount(),
        );
        try { liveApi.flushAsyncTransactions(); } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[refresh]    flushAsyncTransactions threw:', e);
        }
        // eslint-disable-next-line no-console
        console.log(
          '[refresh] %csnapshot commit%c %d rows (onSnapshotData)',
          'color:#10b981;font-weight:bold', '', rows.length,
        );
        liveApi.setGridOption('rowData', rows.slice());
        setLoadRowCount(rows.length);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        providerStatusRef.current = 'ready';
      });
    });

    let updateBatchCount = 0;
    const unsubTick = provider.onTick((updateRows) => {
      if (cancelled || updateRows.length === 0) return;
      updateBatchCount += 1;

      if (!rowIdField) {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`[v2/grid] %cupdate#%d%c %d rows (no rowIdField → all update)`, 'color:#f59e0b', '', updateBatchCount, updateRows.length);
        }
        gridApply.applyTick(liveApi, updateRows, undefined);
        return;
      }

      const { droppedPending, addCount, updateCount } = gridApply.applyTick(
        liveApi,
        updateRows,
        rowIdField,
      );
      if (droppedPending > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[refresh]   %clive split (rows dropped due to pending adds)%c add=%d update=%d droppedPending=%d',
          'color:#f97316', '',
          addCount, updateCount, droppedPending,
        );
      }
    });

    const unsubStatus = provider.onStatus((s, err) => {
      // eslint-disable-next-line no-console
      console.log(
        `[refresh] %cstatus%c %s${err ? ' error=' + JSON.stringify(err) : ''} (+${(performance.now() - t0).toFixed(0)}ms) — pendingAdds=${gridApply.getPendingAddCount()}`,
        'color:#a855f7;font-weight:bold', '', s,
      );
      if (cancelled) return;

      if (s === 'loading') {
        setIsRefetching(true);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        if (providerStatusRef.current === 'ready' || providerStatusRef.current === 'error') {
          gridApply.clearPendingAdds();
        }
        providerStatusRef.current = 'loading';
      }

      if (err) {
        providerStatusRef.current = s;
        setProviderDisconnected(true);
        setDisconnectDetail(err);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        (onError ?? defaultOnError)(new Error(err));
        return;
      }

      if (s !== 'loading') {
        providerStatusRef.current = s;
      }

      containerEventBus.emit('provider:status', {
        status: s,
        error: err,
        providerId: activeId,
        mode: selection.mode,
      });
    });

    const unsubError = provider.onError((err) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      (onError ?? defaultOnError)(err);
    });

    void provider.start().catch((err: unknown) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
    });

    return () => {
      cancelled = true;
      unsubRows();
      unsubSnapshot();
      unsubTick();
      unsubStatus();
      unsubError();
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid] %cunwire provider%c provider=%s (effect cleanup, +${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#6b7280', '', activeId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApi, provider, activeId, rowIdFieldKey, onError]);

  /** Cache replay only — `IDataProvider.refresh()`; no upstream reconnect. */
  const refreshView = useCallback(() => {
    if (!activeId || !provider) return;
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[refresh] %c1. Refresh view clicked%c provider=%s (cache replay)',
        'color:#ec4899;font-weight:bold', '', activeId);
    }
    void refreshProvider().catch((err: unknown) => {
      (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
    });
  }, [activeId, provider, refreshProvider, onError]);

  /** Full re-acquire — `IDataProvider.restart()` with toolbar extra payload. */
  const reloadFromSource = useCallback(async () => {
    if (!activeId || !provider) return;
    const asOfForRestart = selection.mode === 'historical'
      ? (asOfDate ?? (isHistoricalToolbarDate(toolbarDate) ? toolbarDate : null))
      : null;
    const extra = asOfForRestart
      ? { asOfDate: asOfForRestart }
      : { __refresh: Date.now() };
    if (
      selection.mode === 'historical'
      && asOfForRestart
      && historicalDateAppDataRef
    ) {
      const dot = historicalDateAppDataRef.indexOf('.');
      if (dot > 0) {
        const name = historicalDateAppDataRef.slice(0, dot);
        const key = historicalDateAppDataRef.slice(dot + 1);
        try {
          await appData.store.set(name, key, asOfForRestart);
        } catch (err: unknown) {
          (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
          return;
        }
      }
    }
    const rawCfg = activeRow.cfg?.config;
    if (rawCfg && (rawCfg as { providerType?: string }).providerType === 'stomp') {
      traceStompProviderCfg(
        'MarketsGridContainer.reloadFromSource (main-thread audit; worker resolves on connect)',
        rawCfg as StompProviderConfig,
        {
          providerId: activeId,
          extra,
          lookup: (name, key) => appData.store.get(name, key),
        },
      );
    }
    // eslint-disable-next-line no-console
    console.log('[refresh] %c1. Reload from source clicked%c provider=%s mode=%s asOfDate=%s extra=%s',
      'color:#ec4899;font-weight:bold', '',
      activeId, selection.mode, asOfDate ?? '—', JSON.stringify(extra));
    if (liveApi) {
      try {
        const beforeFlush = liveApi.getDisplayedRowCount();
        liveApi.flushAsyncTransactions();
        const afterFlush = liveApi.getDisplayedRowCount();
        // eslint-disable-next-line no-console
        console.log(
          '[refresh] %c3a. flushAsyncTransactions drained old queue%c rows %d → %d',
          'color:#ec4899', '', beforeFlush, afterFlush,
        );
        liveApi.setGridOption('rowData', []);
        // eslint-disable-next-line no-console
        console.log('[refresh] %c3b. Grid cleared (setGridOption rowData=[])%c', 'color:#ec4899', '');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[refresh]    Grid clear failed:', e);
      }
    }
    setIsRefetching(true);
    setLoadRowCount(undefined);
    setResolvedSubKey(null);
    void restartProvider(extra).catch((err: unknown) => {
      (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
    });
  }, [activeId, provider, selection.mode, asOfDate, toolbarDate, liveApi, restartProvider, onError, activeRow.cfg, appData.store, historicalDateAppDataRef]);

  // Restart the active provider after toolbar date / mode changes.
  // Wait for `liveApi` so the provider wiring effect registers snapshot
  // listeners before `restart()` — otherwise the first historical snapshot
  // can arrive with no `onSnapshotData` handler attached.
  useEffect(() => {
    const pending = pendingToolbarReloadRef.current;
    if (!pending) return;
    if (!loaded || !provider || !activeId || !liveApi) return;
    // Fire only once the committed state matches the intent that queued this
    // reload. The ref is set synchronously in the handler, but the matching
    // toolbar date / mode / asOfDate updates commit a render later — an
    // unrelated render (e.g. `liveApi` flipping true from the grid's onReady)
    // can otherwise run this effect with stale state, consume the flag with a
    // live refresh, and skip the historical restart that carries `{ asOfDate }`.
    if (selection.mode !== pending.mode) return;
    if (pending.mode === 'historical' && asOfDate !== pending.asOfDate) return;
    pendingToolbarReloadRef.current = null;
    reloadFromSource();
  }, [
    loaded,
    provider,
    activeId,
    liveApi,
    selection.mode,
    asOfDate,
    toolbarDate,
    reloadFromSource,
  ]);

  const handleProviderEdit = useCallback((providerId: string | null) => {
    if (isOpenFinRuntime()) {
      onEditProvider?.(providerId);
      return;
    }
    setEditingProviderId(providerId);
    setProviderEditorOpen(true);
  }, [onEditProvider]);

  const handleOpenConfigBrowser = useCallback(() => {
    if (isOpenFinRuntime()) {
      onOpenConfigBrowser?.();
      return;
    }
    setConfigBrowserOpen(true);
  }, [onOpenConfigBrowser]);

  const userAdminActions = useMemo(
    () => (marketsGridProps as { adminActions?: AdminAction[] }).adminActions ?? [],
    [marketsGridProps],
  );

  const dataProviderInfraAdminActions = useMemo<AdminAction[]>(() => [
    {
      id: DATA_PROVIDER_EDITOR_ACTION_ID,
      label: 'Data Provider Editor',
      description: 'Edit provider configs, STOMP paths, and field mappings',
      icon: 'lucide:plug',
      onClick: () => handleProviderEdit(activeId ?? null),
    },
    createConfigBrowserAction({ launch: handleOpenConfigBrowser }),
  ], [activeId, handleProviderEdit, handleOpenConfigBrowser]);

  const setEventBindingsAll = useCallback((next: Record<string, string[]>) => {
    setEventBindings(next);
  }, []);

  const setEventHandler = useCallback((eventId: string, handlerId: string | null) => {
    setEventBindings((prev) => {
      const next = { ...prev };
      if (!handlerId) delete next[eventId];
      else next[eventId] = [handlerId];
      return next;
    });
  }, []);

  const gridEventBindingsHost = useMemo<GridEventBindingsHostApi>(() => ({
    available: Boolean(gridEventHandlers),
    bindings: eventBindings,
    catalog: MARKETS_GRID_EVENT_CATALOG,
    handlerIds: gridEventHandlers ? Object.keys(gridEventHandlers) : [],
    handlerMeta,
    setBindings: setEventBindingsAll,
    setEventHandler,
  }), [
    gridEventHandlers,
    eventBindings,
    handlerMeta,
    setEventBindingsAll,
    setEventHandler,
  ]);

  const providerGridHost = useMemo<ProviderGridHostApi>(() => ({
    available: true,
    liveProviders: liveList.configs,
    historicalProviders: histList.configs,
    liveProviderId: selection.liveProviderId,
    historicalProviderId: selection.historicalProviderId,
    mode: selection.mode,
    asOfDate,
    onLiveChange: setLiveId,
    onHistoricalChange: setHistoricalId,
    onModeChange: setMode,
    onAsOfDateChange: setAsOfDateAndPersist,
    onRefreshView: refreshView,
    onReloadFromSource: () => { void reloadFromSource(); },
    onEditProvider: handleProviderEdit,
  }), [
    liveList.configs,
    histList.configs,
    selection.liveProviderId,
    selection.historicalProviderId,
    selection.mode,
    asOfDate,
    setLiveId,
    setHistoricalId,
    setMode,
    setAsOfDateAndPersist,
    refreshView,
    reloadFromSource,
    handleProviderEdit,
  ]);

  const providerEditorDialog = (
    <ProviderEditorDialog
      open={providerEditorOpen}
      providerId={editingProviderId}
      userId={props.userId ?? LOGGED_IN_USER_ID}
      onOpenChange={(open) => {
        setProviderEditorOpen(open);
        if (!open) setEditingProviderId(null);
      }}
    />
  );

  const configBrowserDialog = (
    <ConfigBrowserDialog
      open={configBrowserOpen}
      onOpenChange={setConfigBrowserOpen}
    />
  );

  const dataDialogs = (
    <>
      {providerEditorDialog}
      {configBrowserDialog}
    </>
  );

  const refreshReloadAdminActions = useMemo<AdminAction[]>(() => [
    {
      id: 'refresh-view',
      label: 'Refresh view',
      description: activeProviderName
        ? `Replay cached rows for ${activeProviderName} without reconnecting`
        : 'Replay cached rows without reconnecting',
      icon: 'lucide:refresh-cw',
      onClick: refreshView,
    },
    {
      id: 'reload-from-source',
      label: 'Reload from source',
      description: activeProviderName
        ? `Restart ${activeProviderName} and re-fetch the snapshot`
        : 'Restart the active provider and re-fetch the snapshot',
      icon: 'lucide:rotate-cw',
      onClick: reloadFromSource,
    },
  ], [activeProviderName, refreshView, reloadFromSource]);

  const adminActionsWithDataInfra = useMemo(
    () => mergeAdminActions(refreshReloadAdminActions, dataProviderInfraAdminActions, userAdminActions),
    [refreshReloadAdminActions, dataProviderInfraAdminActions, userAdminActions],
  );

  const adminActionsInfraOnly = useMemo(
    () => mergeAdminActions([], dataProviderInfraAdminActions, userAdminActions),
    [dataProviderInfraAdminActions, userAdminActions],
  );

  // ── Render ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Loading…
        </div>
        {dataDialogs}
      </>
    );
  }

  // Provider selected and cfg loaded → full data-attached grid.
  if (activeId && !activeRow.loading && rowIdField && columnDefs) {
    return (
      <>
        <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
          <MarketsGrid<TData>
            {...(marketsGridProps as MarketsGridProps<TData>)}
            key={`${activeId}::${rowIdFieldKey}`}
            rowData={EMPTY as TData[]}
            rowIdField={rowIdField}
            columnDefs={columnDefs}
            appData={appDataLookup}
            onReady={onReady}
            providerGridHost={providerGridHost}
            gridEventBindingsHost={gridEventBindingsHost}
            adminActions={adminActionsWithDataInfra}
            caption={effectiveCaption}
            onCaptionChange={handleCaptionChange}
            onSavingChange={setIsSavingProfile}
            dataStale={providerDisconnected}
            dataStaleMessage={dataStaleMessage}
            historicalViewMode={isHistoricalView}
            historicalViewMessage={historicalViewMessage}
            toolbarDate={toolbarDate}
            onToolbarDateChange={handleToolbarDateChange}
            toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
          />
          {showLoadingOverlay && (
            <MarketsGridLoadingOverlay
              title={
                isSavingProfile
                  ? 'Saving…'
                  : activeProviderName
                    ? `Loading ${activeProviderName}`
                    : 'Loading market data'
              }
              message={isSavingProfile ? 'Persisting profile' : undefined}
              rowCount={isSavingProfile ? undefined : loadRowCount}
            />
          )}
        </div>
        {dataDialogs}
      </>
    );
  }

  // No provider selected (or cfg still resolving): mount MarketsGrid
  // with a sentinel rowIdField. Open Custom Settings to pick a provider.
  return (
    <>
      <MarketsGrid<TData>
        {...(marketsGridProps as MarketsGridProps<TData>)}
        key="__no_provider__"
        rowData={EMPTY as TData[]}
        rowIdField="__none__"
        columnDefs={EMPTY as unknown as ColDef<TData>[]}
        appData={appDataLookup}
        providerGridHost={providerGridHost}
        gridEventBindingsHost={gridEventBindingsHost}
        adminActions={adminActionsInfraOnly}
        caption={effectiveCaption}
        onCaptionChange={handleCaptionChange}
        toolbarDate={toolbarDate}
        onToolbarDateChange={handleToolbarDateChange}
        toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
      />
      {dataDialogs}
    </>
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}
