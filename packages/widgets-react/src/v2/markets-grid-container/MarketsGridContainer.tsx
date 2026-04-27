/**
 * MarketsGridContainer — v2.
 *
 *   - Two providers in the picker, ONE active at a time.
 *   - Picker toolbar is mounted INSIDE MarketsGrid via the
 *     `headerExtras` slot — it lives inside the grid's own chrome,
 *     not as a separate strip above it.
 *   - Toolbar visibility is dev-only, gated by Alt+Shift+P. The
 *     chord, the toolbar, and the very existence of the picker are
 *     intentionally NOT documented in the UI: end users see only the
 *     configured grid; support staff toggle the toolbar to reconfigure.
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
import { MarketsGrid } from '@marketsui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle, StorageAdapterFactory } from '@marketsui/markets-grid';
import type { StorageAdapter } from '@marketsui/core';
import {
  useProviderStream,
  useDataProviderConfig,
  useResolvedCfg,
  useDataProvidersList,
  useAppDataStore,
  useDataPlane,
} from '@marketsui/data-plane-react/v2';
import type { ProviderConfig } from '@marketsui/shared-types';
import { ProviderToolbar, type ProviderMode } from './ProviderToolbar.js';
import { useChordHotkey } from './useChordHotkey.js';

const EMPTY: never[] = [];

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

  const dp = useDataPlane();
  const appData = useAppDataStore();

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
  const [loaded, setLoaded] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
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
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSelection({ ...DEFAULT_SELECTION });
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [adapter, props.gridId]);

  // Persist on mutation. `lastSavedRef` skips the initial sync when
  // `loaded` flips (selection just came FROM disk; saving back would
  // be a no-op write) AND handles React StrictMode's double-effect
  // correctly across remounts.
  const lastSavedRef = useRef<ProviderSelection | null>(null);
  useEffect(() => {
    if (!loaded) return;
    // First post-load run: seed lastSaved with whatever just loaded
    // and bail out — no need to write the value we just read.
    if (lastSavedRef.current === null) {
      lastSavedRef.current = selection;
      return;
    }
    if (
      lastSavedRef.current.liveProviderId === selection.liveProviderId
      && lastSavedRef.current.historicalProviderId === selection.historicalProviderId
      && lastSavedRef.current.mode === selection.mode
    ) {
      return;
    }
    lastSavedRef.current = selection;
    if (adapter?.saveGridLevelData) {
      void adapter.saveGridLevelData(props.gridId, selection);
    }
  }, [selection, loaded, adapter, props.gridId]);

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
  // Alt+Shift+P toggles the picker. Intentionally undocumented in the
  // UI — the empty state shows nothing actionable so end users don't
  // discover the toolbar accidentally. Support staff and developers
  // know the chord; that's the audience.
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

  const rowIdField = activeRow.cfg
    ? (activeCfg as { keyColumn?: string } | null)?.keyColumn ?? null
    : null;

  const columnDefs = useMemo<ColDef<TData>[] | null>(() => {
    const defs = (activeCfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions;
    return defs && defs.length > 0 ? defs : null;
  }, [activeCfg]);

  // ── Grid → Hub attach gating ─────────────────────────────────────
  //
  // We DO NOT attach to the Hub until AG-Grid has finished initialising
  // AND the api we captured belongs to the CURRENT grid (the one
  // matching the active provider's cfg). Without this gate there is a
  // race on every page reload (and on every provider switch, since
  // the grid remounts via the `key` prop):
  //
  //   t=0   activeRow.cfg arrives → rowIdField flips null → real →
  //         render switches from the "no provider" empty-grid branch
  //         to the real branch → MarketsGrid remounts under a new key
  //   t=0+  effects run in declaration order. A `setGridApi(null)`
  //         reset effect schedules a re-render, but the in-progress
  //         commit's useProviderStream effect ALREADY captured the
  //         OLD (empty-grid) gridApi from state — and runs first,
  //         attaching with the new providerId
  //   t=ε   Hub posts the cached snapshot back (sub-ms when the
  //         SharedWorker is already running with a populated cache —
  //         exactly the page-refresh case)
  //   t=ε+  the listener uses the STILL-EMPTY grid's api (or, after
  //         microtask flush, no api at all because the cleanup
  //         already ran) — the snapshot is silently dropped
  //   t=Δ+  live ticks arrive next, the new grid is ready by then,
  //         add/update split fires applyTransaction({add: [tick]})
  //         for every row → the user sees rows materialise one-by-
  //         one instead of as a single snapshot reset
  //
  // Gating attach on a STAMPED gridApi (one paired with the key it
  // was created for) flips this around: an api carrying the empty
  // grid's stamp never matches the real grid's expected key, so
  // `liveApi` is null until the new mount's onReady fires AND
  // setStamped commits with a matching key. By that time the grid is
  // ready; the Hub's replay lands as exactly one
  // `setGridOption('rowData', rows)` call. Subsequent live ticks then
  // hit the populated grid for the add/update split.
  const expectedKey = (activeId && !activeRow.loading && rowIdField && columnDefs)
    ? `${activeId}::${rowIdField}`
    : null;

  const [stamped, setStamped] = useState<{ key: string; api: GridApi<TData> } | null>(null);

  // `expectedKeyRef` lets `onReady` read the current expected key
  // without depending on it (which would change the callback identity
  // every time `activeRow.loading` flips and re-fire MarketsGrid's
  // ready effect).
  const expectedKeyRef = useRef(expectedKey);
  useEffect(() => { expectedKeyRef.current = expectedKey; }, [expectedKey]);

  const onReady = useCallback((handle: MarketsGridHandle) => {
    const k = expectedKeyRef.current;
    // Only stamp when we're in the real-data branch. An onReady from
    // the "no provider" empty-grid branch (expectedKey === null) is
    // discarded — that grid's api isn't the one we want to attach to.
    if (k) {
      setStamped({ key: k, api: handle.gridApi as unknown as GridApi<TData> });
    }
    onReadyProp?.(handle);
  }, [onReadyProp]);

  // `liveApi` is non-null only when the stamped api's key matches the
  // current expected key. The comparison is computed synchronously
  // during render — no useEffect lag, no stale-state window.
  const liveApi = stamped && stamped.key === expectedKey ? stamped.api : null;

  // Snapshot vs. delta dispatch. See data-plane v2 docs for the
  // detailed contract — `replace: true` is a setRowData reset; without
  // it we split each batch into add/update by `getRowNode`.
  const stream = useProviderStream<TData>(
    liveApi ? activeId : null,
    liveApi ? activeCfg : null,
    {
      onDelta: (rows, replace) => {
        const api = liveApi; if (!api) return;
        if (replace) {
          api.setGridOption('rowData', rows.slice());
          return;
        }
        if (rows.length === 0) return;
        if (!rowIdField) {
          api.applyTransactionAsync({ update: rows.slice() });
          return;
        }
        const adds: TData[] = [];
        const updates: TData[] = [];
        for (const row of rows) {
          const raw = (row as Record<string, unknown>)[rowIdField];
          const id = raw === null || raw === undefined ? null : String(raw);
          if (id !== null && api.getRowNode(id)) updates.push(row);
          else adds.push(row);
        }
        api.applyTransactionAsync({ add: adds, update: updates });
      },
      onStatus: (_status, error) => {
        if (error) (onError ?? defaultOnError)(new Error(error));
      },
    },
  );

  const refresh = useCallback(() => {
    if (!activeId) return;
    if (selection.mode === 'historical' && asOfDate) {
      stream.refresh({ asOfDate });
    } else {
      stream.refresh();
    }
  }, [activeId, selection.mode, asOfDate, stream]);

  // ── Toolbar slot content ──────────────────────────────────────────
  //
  // Always pass via `headerExtras`; the slot is hidden when the
  // picker is closed. End users never see this; only Alt+Shift+P
  // surfaces it, and that chord is intentionally undocumented in
  // the UI.
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
    return (
      <MarketsGrid<TData>
        {...(marketsGridProps as MarketsGridProps<TData>)}
        key={`${activeId}::${rowIdField}`}
        rowData={EMPTY as TData[]}
        rowIdField={rowIdField}
        columnDefs={columnDefs}
        onReady={onReady}
        headerExtras={headerExtras}
      />
    );
  }

  // No provider selected (or cfg still resolving): mount MarketsGrid
  // with a sentinel rowIdField so the toolbar slot is reachable. End
  // users see an empty grid; support staff press Alt+Shift+P to pick
  // a provider. No keyboard hint is shown — the chord is dev-only.
  return (
    <MarketsGrid<TData>
      {...(marketsGridProps as MarketsGridProps<TData>)}
      key="__no_provider__"
      rowData={EMPTY as TData[]}
      rowIdField="__none__"
      columnDefs={EMPTY as unknown as ColDef<TData>[]}
      headerExtras={headerExtras}
    />
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}
