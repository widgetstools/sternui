/**
 * MarketsGridContainer — v2.
 *
 *   - Two providers in the picker, ONE active at a time.
 *   - Picker toolbar is mounted INSIDE MarketsGrid via the
 *     `headerExtras` slot — it lives inside the grid's own chrome,
 *     not as a separate strip above it.
 *   - Toolbar is visible by default. Alt+Shift+P toggles it off/on.
 *   - Provider selection persists at the GRID level (not per-layout)
 *     in the SAME storage row MarketsGrid uses for its layout-set
 *     (wire `componentType: 'markets-grid-layout-set'`, with
 *     `'markets-grid-profile-set'` still accepted on read for back-compat),
 *     via the StorageAdapter's `loadGridLevelData / saveGridLevelData`
 *     methods. Layout switches preserve the selection because it's
 *     not stored in any individual layout.
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
 *       that holds the layout-set (top-level field, not nested in a
 *       layout).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@starui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle, StorageAdapterFactory } from '@starui/markets-grid';
import type { AppDataLookup, StorageAdapter } from '@starui/core';
import {
  useDataProviderConfig,
  useResolvedCfg,
  useDataProvidersList,
  useAppDataStore,
  useDataServices,
} from '@starui/data-services-react/runtime';
import { composeRowId, getValueByPath } from '@starui/shared-types';
import { ProviderToolbar, type ProviderMode } from './ProviderToolbar.js';
import { useChordHotkey } from './useChordHotkey.js';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';

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
   * Called when the user clicks the toolbar's Edit button. The
   * consumer is expected to open the editor (typically as a popout
   * window via `data-plane-popout.ts`'s helper).
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

  const dp = useDataServices();
  const dpClient = dp.client;
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
  // Same factory MarketsGrid uses for layout persistence; we resolve
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
  // Provider toolbar starts visible — Alt+Shift+P toggles it off/on.
  const [pickerVisible, setPickerVisible] = useState(true);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);

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
  // Alt+Shift+P toggles the provider toolbar. The toolbar is visible
  // by default; the chord lets users hide it (and re-show it) without
  // a config flag.
  //
  // Chord choice: Alt+Shift+P. The original plan called for
  // Ctrl+Shift+P but every major browser binds that to "open
  // incognito / private window" — Chromium intercepts it before the
  // page-level keydown listener runs. Alt+Shift+P is unbound in
  // Chrome / Firefox / Edge / Safari / OpenFin and is mnemonic for
  // "Provider".
  const toggleToolbar = useCallback(() => setPickerVisible((v) => !v), []);
  useChordHotkey('Alt+Shift+P', (e) => {
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

  // Date picker writes through to AppData; the next render's
  // `useResolvedCfg` produces a fresh cfg → useProviderStream
  // re-attaches → Hub turns it into a restart.
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
  //      rowIdField). The toolbar is visible by default so the user
  //      can pick a provider from the empty state.
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

  // ── Two-phase data flow ──────────────────────────────────────────
  //
  // The flow matches the natural reload-time sequence:
  //
  //   1. App reloads → connect to (or create) the SharedWorker.
  //   2. Grid requests the snapshot from the worker.
  //   3. Worker delivers it — either from its cache (hot reload), or
  //      by starting the provider and waiting for its snapshot phase
  //      to finish (cold reload / first load).
  //   4. Grid applies the snapshot via setGridOption('rowData', ...).
  //   5. Grid subscribes for live updates.
  //
  // `client.subscribe` returns a handle with both phases unbundled:
  //   • `await handle.snapshot` — step 3.
  //   • `handle.onUpdate(cb)` — step 5.
  //
  // Updates that arrive between snapshot resolution and onUpdate
  // registration are buffered by the client and flushed in order on
  // registration, so nothing is dropped.
  //
  // Refresh is implemented as: re-subscribe with `extra: {asOfDate}`
  // for historical mode, or `extra: {__refresh: ts}` for live. The
  // worker turns either into provider.restart(extra), which clears
  // the cache and resets to 'loading' until the new snapshot arrives.
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshExtraRef = useRef<Record<string, unknown> | undefined>(undefined);

  // Loading-overlay state — derived synchronously from a "subscription
  // key" so the overlay appears on the SAME render that mounts the
  // grid. If we used a useState+useEffect pair, AG-Grid would briefly
  // flash its built-in "No Rows To Show" overlay between mount and
  // the first useEffect tick. We track which subscription key has had
  // its snapshot resolved, and the overlay shows whenever the current
  // subscription key !== the resolved key.
  const subscriptionKey =
    activeId && rowIdField ? `${activeId}::${rowIdFieldKey}::${refreshTick}` : null;
  const [resolvedSubKey, setResolvedSubKey] = useState<string | null>(null);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>(undefined);
  // True while the provider is in the 'loading' phase of a peer-
  // triggered re-snapshot. Driven by the worker's status events, which
  // every subscriber receives — so all connected windows show the
  // overlay together, not just the one that pressed the refresh button.
  const [isRefetching, setIsRefetching] = useState(false);
  // Bubbled up from MarketsGrid whenever the active layout is being
  // persisted (Save button or save-on-switch). We reuse the same
  // snapshot loading overlay component for visual consistency, just
  // with a "Saving…" caption.
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const isLoadingSnapshot = subscriptionKey !== null && subscriptionKey !== resolvedSubKey;
  const showLoadingOverlay = isLoadingSnapshot || isRefetching || isSavingLayout;

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
    if (!liveApi || !activeId || !activeCfg) {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid]   subscribe effect skipped: liveApi=%s activeId=%s activeCfg=%s`,
          Boolean(liveApi), activeId, Boolean(activeCfg));
      }
      return;
    }
    // Subscribe starting / restarting — clear the row count display so
    // the next snapshot's count appears fresh. The overlay's
    // visibility is already true via the derived isLoadingSnapshot
    // flag (subscriptionKey changed → resolvedSubKey is stale).
    setLoadRowCount(undefined);
    // Capture the key that's loading right now so async callbacks
    // mark the right subscription resolved (in case the user picks a
    // different provider before this one's snapshot arrives).
    const thisSubKey = subscriptionKey ?? `${activeId}::${rowIdFieldKey}::${refreshTick}`;

    const extra = refreshExtraRef.current;
    refreshExtraRef.current = undefined;
    const t0 = performance.now();
    // eslint-disable-next-line no-console
    console.log(
      '[refresh] %c5. subscribe useEffect fired%c provider=%s extra=%s',
      'color:#ec4899', '', activeId,
      extra ? JSON.stringify(extra) : '(none — initial mount)',
    );
    const handle = dpClient.subscribe<TData>(activeId, activeCfg, extra ? { extra } : {});
    let cancelled = false;

    // Track ids we've handed to AG-Grid as `add` but whose transaction
    // hasn't been applied yet. Without this, two live ticks for the
    // SAME new id arriving in the same frame both observe
    // `getRowNode(id) === null` (because applyTransactionAsync is
    // async — transactions queue and flush together at the next
    // animation frame), classify both as `add`, and AG-Grid emits
    // warning #2 ("Duplicate node id detected"). Server-side fan-out
    // with multiple ticks per row makes this hit constantly.
    const pendingAddIds = new Set<string>();

    // Snapshot accumulator. Chunks of the (re-)snapshot are buffered
    // here while status='loading' and committed to AG-Grid in a single
    // `setGridOption('rowData', ...)` call on the loading→ready
    // transition. The running length feeds the busy-overlay caption so
    // the user sees row count climbing while chunks stream in.
    let snapshotBuf: TData[] = [];
    let snapshotApplied = false;

    // Tracks the worker's most recent status so onUpdate can route
    // deltas correctly: while 'loading', the rows are chunks of a
    // refreshing snapshot and must be applied as adds-only (the
    // worker buffers true live frames during the snapshot phase, so
    // any replace=false delta in this window IS a snapshot chunk).
    // While 'ready', deltas are real live ticks and go through the
    // add/update classifier.
    const providerStatusRef = { current: 'loading' as 'loading' | 'ready' | 'error' };

    handle.onStatus((s, err) => {
      // eslint-disable-next-line no-console
      console.log(
        `[refresh] %cstatus%c %s${err ? ' error=' + JSON.stringify(err) : ''} (+${(performance.now() - t0).toFixed(0)}ms) — pendingAdds=${pendingAddIds.size}`,
        'color:#a855f7;font-weight:bold', '', s,
      );
      if (cancelled) return;

      // 'loading' enters the snapshot phase — show the overlay
      // (relevant for peer-triggered re-snapshots; on initial mount
      // the isLoadingSnapshot derived flag already handles this).
      if (s === 'loading') setIsRefetching(true);

      // Error path — tear down overlay immediately and surface to
      // caller. Overrides the loading→ready commit path.
      if (err) {
        providerStatusRef.current = s;
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        (onError ?? defaultOnError)(new Error(err));
        return;
      }

      // loading→ready: commit the accumulated snapshot buffer in a
      // single setGridOption AND defer the providerStatusRef flip +
      // overlay tear-down to the same microtask. The flip MUST happen
      // inside the microtask (not synchronously here) because:
      //
      //   1. trySettleSnapshot() inside SharedWorkerDataServicesClient.ts schedules a
      //      microtask M_snap (the consumer's `handle.snapshot.then`).
      //   2. This onStatus body runs synchronously and schedules
      //      M_commit (below).
      //   3. M_snap runs FIRST (FIFO microtask order). Inside it,
      //      `handle.onUpdate(cb)` triggers SharedWorkerDataServicesClient.ts's
      //      `flushBuffered`, which synchronously replays every
      //      `replace=false` chunk that arrived before onUpdate was
      //      wired (i.e. chunks 1..N of the late-join cache replay).
      //
      // Each replayed chunk lands in the consumer's onUpdate. If
      // providerStatusRef were already 'ready' at that point, those
      // chunks would route to the live-tick `applyTransactionAsync`
      // path instead of `snapshotBuf.push`. The commit's setGridOption
      // would then overwrite those adds with chunk0 only — surfacing
      // as "Rows: ~500 of 20000" or similar partial counts.
      //
      // Keeping the ref on 'loading' until inside M_commit means
      // flushBuffered's onUpdate callbacks correctly buffer-append,
      // and by the time M_commit reads `snapshotBuf` it has every row.
      if (s === 'ready' && providerStatusRef.current === 'loading') {
        Promise.resolve().then(() => {
          if (cancelled) return;
          // Drain any genuinely-queued live-tick transactions BEFORE
          // setGridOption replaces rowData (rare path: ticks queued by
          // an overlapping live phase). With the snapshot buffering in
          // place during 'loading', this is typically a no-op.
          // eslint-disable-next-line no-console
          console.log(
            '[refresh] %cflushAsyncTransactions BEFORE commit%c pendingAdds=%d gridRows=%d',
            'color:#f97316;font-weight:bold', '',
            pendingAddIds.size, liveApi.getDisplayedRowCount(),
          );
          try { liveApi.flushAsyncTransactions(); } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[refresh]    flushAsyncTransactions threw:', e);
          }
          if (!snapshotApplied) {
            // eslint-disable-next-line no-console
            console.log(
              '[refresh] %csnapshot commit%c %d rows (single-shot apply on loading→ready)',
              'color:#10b981;font-weight:bold', '', snapshotBuf.length,
            );
            liveApi.setGridOption('rowData', snapshotBuf.slice());
            snapshotApplied = true;
            setLoadRowCount(snapshotBuf.length);
            setResolvedSubKey(thisSubKey);
          }
          setIsRefetching(false);
          providerStatusRef.current = 'ready';
        });
        // Do NOT update providerStatusRef synchronously here — see
        // multi-line comment above. The microtask above does it.
        return;
      }
      providerStatusRef.current = s;
    });

    // Re-snapshot listener — fires when a `replace: true` delta arrives
    // AFTER the initial snapshot has settled (peer-triggered refresh
    // or any caller of `provider.restart`). Re-seeds the buffer with
    // chunk0; subsequent chunks ride in via onUpdate during 'loading'
    // and append to the same buffer. The grid stays untouched until
    // the loading→ready transition does the single-shot commit.
    handle.onReset((rows) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.log(
        `[refresh] %conReset%c %d rows (replace=true mid-subscription) pendingAdds(before)=%d`,
        'color:#ec4899;font-weight:bold', '', rows.length, pendingAddIds.size,
      );
      pendingAddIds.clear();
      snapshotBuf = [...rows];
      snapshotApplied = false;
      setLoadRowCount(snapshotBuf.length);
    });

    // Register onUpdate IMMEDIATELY (not inside snapshot.then) so
    // each `replace=false` chunk of the late-join cache replay fires
    // its own task tick. With the late registration, every chunk
    // bypassed updateCb and accumulated in SharedWorkerDataServicesClient's bufferedUpdates;
    // the entire backlog then flushed synchronously when onUpdate was
    // registered post-`status='ready'`, collapsing into a single React
    // render and leaving the busy-overlay caption stuck at "0 rows
    // received" until the commit. Registering early lets each chunk's
    // setLoadRowCount land on its own task tick → React renders
    // between them → user sees the count climb.
    let updateBatchCount = 0;
    handle.onUpdate((updateRows) => {
      if (cancelled || updateRows.length === 0) return;
      updateBatchCount += 1;

      // While the worker is in 'loading', replace=false deltas are
      // chunks 1..N of the (re-)snapshot — the worker buffers true
      // live ticks during the snapshot phase and only emits them
      // after status='ready'. Append to the snapshot buffer; the
      // grid stays untouched until the loading→ready transition
      // does the single-shot commit. The Hub's cache replay is
      // already de-duped by keyColumn so we don't need to filter.
      if (providerStatusRef.current === 'loading') {
        snapshotBuf.push(...updateRows);
        setLoadRowCount(snapshotBuf.length);
        return;
      }

      if (!rowIdField) {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`[v2/grid] %cupdate#%d%c %d rows (no rowIdField → all update)`, 'color:#f59e0b', '', updateBatchCount, updateRows.length);
        }
        liveApi.applyTransactionAsync({ update: updateRows.slice() });
        return;
      }
      const adds: TData[] = [];
      const updates: TData[] = [];
      let droppedPending = 0;
      for (const row of updateRows) {
        const id = composeRowId(row, rowIdField);
        if (id === null) continue;
        // Order matters here: check `getRowNode` FIRST.
        //
        // After `flushAsyncTransactions` runs (e.g., on the
        // loading→ready transition, or on refresh-button entry),
        // AG-Grid HAS the row internally, but our `pendingAddIds`
        // bookkeeping can't be cleaned up yet — AG-Grid dispatches
        // the per-transaction callback on next tick (setTimeout),
        // not synchronously inside the flush. So `pendingAddIds`
        // may still hold stale ids for rows that ARE already in
        // the grid. Checking `getRowNode` first means we correctly
        // route those ticks to `updates`. Only when the row is
        // genuinely not in the grid AND we've queued an add for
        // it do we drop the live tick.
        if (liveApi.getRowNode(id)) {
          updates.push(row);
          continue;
        }
        if (pendingAddIds.has(id)) {
          droppedPending++;
          continue;
        }
        adds.push(row);
        pendingAddIds.add(id);
      }
      // Log only when something is dropped (silent in steady state).
      if (droppedPending > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[refresh]   %clive split (rows dropped due to pending adds)%c add=%d update=%d droppedPending=%d',
          'color:#f97316', '',
          adds.length, updates.length, droppedPending,
        );
      }
      liveApi.applyTransactionAsync({ add: adds, update: updates }, (result) => {
        // Transaction has now been applied — those ids are real
        // grid rows now, so getRowNode will find them on the
        // next batch. Clear them from the pending set.
        for (const node of result.add) {
          const nodeId = node.id;
          if (typeof nodeId === 'string') pendingAddIds.delete(nodeId);
        }
      });
    });
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`[v2/grid]   onUpdate handler registered (early)`);
    }

    handle.snapshot
      .then((rows) => {
        // eslint-disable-next-line no-console
        console.log(
          `[refresh] %csnapshot ✓%c %d rows (chunk0 of buffered snapshot, +${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#10b981;font-weight:bold', '',
          rows.length,
        );
        if (cancelled) {
          if (DEBUG) {
            // eslint-disable-next-line no-console
            console.log('[v2/grid]   …but the subscription was cancelled before snapshot chunk0 landed; skipping');
          }
          return;
        }
        // Prepend chunk0 to the buffer — chunks 1..N may already have
        // accumulated via onUpdate during 'loading' (the late-join
        // replay sends them as separate replace=false events between
        // chunk0's replace=true and the final status='ready'). Keeping
        // chunk0 first preserves the source order in case downstream
        // consumers care.
        snapshotBuf = [...rows, ...snapshotBuf];
        setLoadRowCount(snapshotBuf.length);
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`[v2/grid]   snapshot buffer total after chunk0 prepend: %d rows`, snapshotBuf.length);
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[v2/grid] %csnapshot ✗%c rejected: %s (+${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#ef4444;font-weight:bold', '',
          err instanceof Error ? err.message : String(err),
        );
        if (cancelled) return;
        // Tear the overlay down so the user sees the empty grid /
        // their onError toast rather than a perpetual spinner.
        setResolvedSubKey(thisSubKey);
        (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid] %cunsubscribe%c provider=%s (effect cleanup, +${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#6b7280', '', activeId);
      }
      handle.unsubscribe();
    };
    // `refreshTick` is a deliberate trigger: bumping it tears down
    // the current handle and re-subscribes with whatever
    // `refreshExtraRef.current` was set to before the bump.
    //
    // `rowIdFieldKey` (the stable string form of `rowIdField`) is the
    // dependency rather than `rowIdField` itself — the latter is a
    // composite-key array that gets a fresh reference per render even
    // when the contents are identical, which would tear down +
    // re-subscribe needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApi, activeId, activeCfg, rowIdFieldKey, dpClient, onError, refreshTick]);

  const refresh = useCallback(() => {
    if (!activeId) return;
    // eslint-disable-next-line no-console
    console.log('[refresh] %c1. Refresh button clicked%c provider=%s mode=%s asOfDate=%s',
      'color:#ec4899;font-weight:bold', '',
      activeId, selection.mode, asOfDate ?? '—');
    refreshExtraRef.current = (selection.mode === 'historical' && asOfDate)
      ? { asOfDate }
      : { __refresh: Date.now() };
    // eslint-disable-next-line no-console
    console.log('[refresh] %c2. extra payload set%c', 'color:#ec4899', '', refreshExtraRef.current);
    // Clear the grid immediately so the user who pressed refresh sees
    // an empty + spinner state, not stale rows under the overlay.
    // Other connected subscribers get the same effect via `onReset`
    // when the worker's `replace: true` empty broadcast lands.
    if (liveApi) {
      try {
        // CRITICAL: drain any async transactions queued by the old
        // subscription's live ticks BEFORE clearing the grid. If we
        // clear first, those queued transactions reach AG-Grid's
        // 100ms flush boundary AFTER the rowData was wiped — they
        // try to update rows that no longer exist and AG-Grid logs
        // error #4 for every one of them.
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
    setRefreshTick((t) => {
      // eslint-disable-next-line no-console
      console.log('[refresh] %c4. refreshTick++%c %d → %d (will trigger subscribe useEffect)',
        'color:#ec4899', '', t, t + 1);
      return t + 1;
    });
  }, [activeId, selection.mode, asOfDate, liveApi]);

  // ── Toolbar slot content ──────────────────────────────────────────
  //
  // Passed via `headerExtras`; null when the user has toggled the
  // toolbar off via Alt+Shift+P.
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
      onRefresh={refresh}
      onEdit={(id) => onEditProvider?.(id)}
    />
  ) : null;

  // ── Render ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Provider selected and cfg loaded → full data-attached grid.
  if (activeId && !activeRow.loading && rowIdField && columnDefs) {
    // Prepend a "Refresh" admin action so users can restart the live
    // provider without opening the toolbar. The action reuses the
    // same `refresh()` callback the picker's button
    // wires to, so behaviour is identical: re-attach with a fresh
    // `extra` payload, the worker turns it into provider.restart, and
    // the loading overlay re-shows until the next snapshot lands.
    const userAdminActions = (marketsGridProps as { adminActions?: import('@starui/markets-grid').AdminAction[] }).adminActions ?? [];
    const adminActionsWithRefresh: import('@starui/markets-grid').AdminAction[] = [
      {
        id: 'refresh-provider',
        label: 'Refresh',
        description: activeProviderName
          ? `Restart ${activeProviderName} and re-fetch the snapshot`
          : 'Restart the active provider and re-fetch the snapshot',
        icon: 'lucide:refresh-cw',
        onClick: refresh,
      },
      ...userAdminActions,
    ];
    return (
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
          onSavingChange={setIsSavingLayout}
        />
        {showLoadingOverlay && (
          <MarketsGridLoadingOverlay
            title={
              isSavingLayout
                ? 'Saving…'
                : activeProviderName
                  ? `Loading ${activeProviderName}`
                  : 'Loading market data'
            }
            message={isSavingLayout ? 'Persisting layout' : undefined}
            rowCount={isSavingLayout ? undefined : loadRowCount}
          />
        )}
      </div>
    );
  }

  // No provider selected (or cfg still resolving): mount MarketsGrid
  // with a sentinel rowIdField so the toolbar slot is reachable. The
  // toolbar is visible by default so the user can pick a provider;
  // Alt+Shift+P toggles it.
  return (
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
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}
