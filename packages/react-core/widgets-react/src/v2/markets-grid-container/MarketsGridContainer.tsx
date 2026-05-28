/**
 * MarketsGridContainer — v2.
 *
 *   - Two providers in the picker, ONE active at a time.
 *   - Picker toolbar is mounted INSIDE MarketsGrid via the
 *     `headerExtras` slot — it lives inside the grid's own chrome,
 *     not as a separate strip above it.
 *   - Toolbar is hidden by default. Alt+Shift+P / Meta+Shift+P toggles it.
 *   - Provider selection persists at the GRID level (not per-profile)
 *     in the SAME storage row MarketsGrid uses for its profile-set,
 *     via the StorageAdapter's `loadGridLevelData / saveGridLevelData`
 *     methods. Profile switches preserve the selection because it's
 *     not stored in any individual profile.
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
import type { MarketsGridProps, MarketsGridHandle, StorageAdapterFactory } from '@starui/grid';
import type { AppDataLookup, StorageAdapter } from '@starui/engine';
import {
  useDataProviderConfig,
  useResolvedCfg,
  useDataProvidersList,
  useAppDataStore,
  useDataProvider,
} from '@starui/host-data-react/runtime';
import { getValueByPath } from '@starui/shared-types';
import { createApplyProviderToGridState } from './applyProviderToGrid.js';
import { LOGGED_IN_USER_ID } from '@starui/types';
import { ProviderToolbar, type ProviderMode } from './ProviderToolbar.js';
import { ProviderEditorDialog } from './ProviderEditorDialog.js';
import { useChordHotkey } from './useChordHotkey.js';
import { PROVIDER_TOOLBAR_TOGGLE_CHORDS } from './providerToolbarHotkeys.js';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';
import { isOpenFinRuntime } from './openFinRuntime.js';

const EMPTY: never[] = [];

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * subscribe / update / unsubscribe behavior. The render-time log fires on
 * every render of the container; the update-batch logs fire per delta.
 * Both are off by default to avoid measurable CPU cost on busy providers.
 */
const DEBUG = false;

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
   * OpenFin only: called when the user clicks the toolbar Edit button.
   * In a browser runtime the container opens {@link DataProviderEditor}
   * in a shadcn dialog instead.
   */
  onEditProvider?(providerId: string): void;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
}

/** Persisted picker state. Stored as MarketsGrid's `gridLevelData`. */
export interface ProviderSelection {
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderMode;
}

const DEFAULT_SELECTION: ProviderSelection = {
  liveProviderId: null,
  historicalProviderId: null,
  mode: 'live',
};

function normalizeSelection(raw: unknown): ProviderSelection {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SELECTION };
  const v = raw as Partial<ProviderSelection>;
  return {
    liveProviderId: typeof v.liveProviderId === 'string' ? v.liveProviderId : null,
    historicalProviderId: typeof v.historicalProviderId === 'string' ? v.historicalProviderId : null,
    mode: v.mode === 'historical' ? 'historical' : 'live',
  };
}

function extractPersistedCaption(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = (raw as { caption?: unknown }).caption;
  return typeof c === 'string' ? c : undefined;
}

export function MarketsGridContainer<TData extends Record<string, unknown> = Record<string, unknown>>(
  props: MarketsGridContainerProps<TData>,
) {
  const {
    historicalDateAppDataRef,
    onEditProvider,
    onError,
    onReady: onReadyProp,
    ...marketsGridProps
  } = props;

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
  const [loaded, setLoaded] = useState(false);
  // Provider toolbar hidden until the user toggles it via chord hotkeys.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

  // Initial load. If the adapter doesn't implement grid-level data
  // (older third-party adapters), or there's no adapter at all, we
  // fall through to the default selection and mark as loaded.
  useEffect(() => {
    let cancelled = false;
    if (!adapter?.loadGridLevelData) {
      setLoaded(true);
      return;
    }
    void adapter
      .loadGridLevelData(props.gridId)
      .then((raw) => {
        if (cancelled) return;
        setSelection(normalizeSelection(raw));
        setPersistedCaption(extractPersistedCaption(raw));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSelection({ ...DEFAULT_SELECTION });
        setPersistedCaption(undefined);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [adapter, props.gridId]);

  // Persist on mutation. `lastSavedRef` skips the initial sync when
  // `loaded` flips (state just came FROM disk; saving back would be a
  // no-op write) AND handles React StrictMode's double-effect correctly
  // across remounts. Tracks both the picker selection and the persisted
  // caption — they share the same gridLevelData blob.
  const lastSavedRef = useRef<{ selection: ProviderSelection; caption: string | undefined } | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (lastSavedRef.current === null) {
      lastSavedRef.current = { selection, caption: persistedCaption };
      return;
    }
    const prev = lastSavedRef.current;
    if (
      prev.selection.liveProviderId === selection.liveProviderId
      && prev.selection.historicalProviderId === selection.historicalProviderId
      && prev.selection.mode === selection.mode
      && prev.caption === persistedCaption
    ) {
      return;
    }
    lastSavedRef.current = { selection, caption: persistedCaption };
    if (adapter?.saveGridLevelData) {
      void adapter.saveGridLevelData(props.gridId, { ...selection, caption: persistedCaption });
    }
  }, [selection, persistedCaption, loaded, adapter, props.gridId]);

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

  const setLiveId = useCallback((id: string | null) => {
    setSelection((s) => ({ ...s, liveProviderId: id }));
  }, []);
  const setHistoricalId = useCallback((id: string | null) => {
    setSelection((s) => ({ ...s, historicalProviderId: id }));
  }, []);
  const setMode = useCallback((mode: ProviderMode) => {
    setSelection((s) => ({ ...s, mode }));
  }, []);

  // ── Hotkey ────────────────────────────────────────────────────────
  //
  // Alt+Shift+P (Option on Mac) and Meta+Shift+P (Command on Mac) toggle
  // the provider toolbar. Hidden by default — developer/support affordance.
  const toggleToolbar = useCallback(() => setPickerVisible((v) => !v), []);
  useChordHotkey(PROVIDER_TOOLBAR_TOGGLE_CHORDS, (e) => {
    e.preventDefault();
    toggleToolbar();
  });

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
    if (next && historicalDateAppDataRef) {
      const dot = historicalDateAppDataRef.indexOf('.');
      if (dot > 0) {
        const name = historicalDateAppDataRef.slice(0, dot);
        const key = historicalDateAppDataRef.slice(dot + 1);
        void appData.store.set(name, key, next);
      }
    }
  }, [appData.store, historicalDateAppDataRef]);

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

  const columnDefs = useMemo<ColDef<TData>[] | null>(() => {
    const defs = (activeCfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions;
    if (!defs || defs.length === 0) return null;
    // Inject a `valueGetter` for any column whose `field` contains a
    // dot. AG-Grid's built-in dot-walk handles nested objects fine
    // (`field: 'a.b.c'` → `row.a.b.c`), but it CAN'T tell apart the
    // nested case from a literal-dot key (`row['a.b.c']`). Our shared
    // helper does both: literal flat key first, dot-walk fallback. We
    // wrap it in a getter only when the field has a dot — flat fields
    // get AG-Grid's native fast path untouched. Stripping field +
    // adding valueGetter also signals to AG-Grid that this column is
    // computed (no implicit field binding); we keep `colId` so AG-
    // Grid still references it stably.
    return defs.map((d) => {
      if (typeof d.field !== 'string' || !d.field.includes('.')) return d;
      const path = d.field;
      return {
        ...d,
        colId: d.colId ?? path,
        valueGetter: (params) => getValueByPath(params.data, path),
      };
    });
  }, [activeCfg]);

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

  const onReady = useCallback((handle: MarketsGridHandle) => {
    const k = expectedKeyRef.current;
    if (k) {
      setStamped({ key: k, api: handle.gridApi as unknown as GridApi<TData> });
    }
    onReadyProp?.(handle);
  }, [onReadyProp]);

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
      `[v2/grid] render gate: loaded=%s liveApi=%s activeId=%s rowIdField=%s columnDefs=%s cfgLoaded=%s pickerVisible=%s`,
      loaded, Boolean(liveApi), activeId, rowIdField, Boolean(columnDefs), Boolean(activeCfg), pickerVisible,
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
  const reloadFromSource = useCallback(() => {
    if (!activeId || !provider) return;
    const extra = (selection.mode === 'historical' && asOfDate)
      ? { asOfDate }
      : { __refresh: Date.now() };
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
  }, [activeId, provider, selection.mode, asOfDate, liveApi, restartProvider, onError]);

  // ── Toolbar slot content ──────────────────────────────────────────
  //
  // Passed via `headerExtras`; null until the user toggles the toolbar
  // via Alt+Shift+P / Meta+Shift+P.
  const handleProviderEdit = useCallback((providerId: string) => {
    if (isOpenFinRuntime()) {
      onEditProvider?.(providerId);
      return;
    }
    setEditingProviderId(providerId);
    setProviderEditorOpen(true);
  }, [onEditProvider]);

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

  const headerExtras = pickerVisible ? (
    <ProviderToolbar
      liveProviders={liveList.configs}
      historicalProviders={histList.configs}
      liveProviderId={selection.liveProviderId}
      historicalProviderId={selection.historicalProviderId}
      mode={selection.mode}
      asOfDate={asOfDate}
      onLiveChange={setLiveId}
      onHistoricalChange={setHistoricalId}
      onModeChange={setMode}
      onAsOfDateChange={setAsOfDateAndPersist}
      onRefreshView={refreshView}
      onReloadFromSource={reloadFromSource}
      onEdit={handleProviderEdit}
    />
  ) : null;

  // ── Render ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Loading…
        </div>
        {providerEditorDialog}
      </>
    );
  }

  // Provider selected and cfg loaded → full data-attached grid.
  if (activeId && !activeRow.loading && rowIdField && columnDefs) {
    // Prepend reload admin actions mirroring the provider toolbar.
    const userAdminActions = (marketsGridProps as { adminActions?: import('@starui/grid').AdminAction[] }).adminActions ?? [];
    const adminActionsWithRefresh: import('@starui/grid').AdminAction[] = [
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
      ...userAdminActions,
    ];
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
            headerExtras={headerExtras}
            adminActions={adminActionsWithRefresh}
            caption={effectiveCaption}
            onCaptionChange={handleCaptionChange}
            onSavingChange={setIsSavingProfile}
            dataStale={providerDisconnected}
            dataStaleMessage={dataStaleMessage}
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
        {providerEditorDialog}
      </>
    );
  }

  // No provider selected (or cfg still resolving): mount MarketsGrid
  // with a sentinel rowIdField. Reveal the toolbar (Alt+Shift+P /
  // Meta+Shift+P) to pick a provider; chord toggles visibility.
  return (
    <>
      <MarketsGrid<TData>
        {...(marketsGridProps as MarketsGridProps<TData>)}
        key="__no_provider__"
        rowData={EMPTY as TData[]}
        rowIdField="__none__"
        columnDefs={EMPTY as unknown as ColDef<TData>[]}
        appData={appDataLookup}
        headerExtras={headerExtras}
        caption={effectiveCaption}
        onCaptionChange={handleCaptionChange}
      />
      {providerEditorDialog}
    </>
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}
