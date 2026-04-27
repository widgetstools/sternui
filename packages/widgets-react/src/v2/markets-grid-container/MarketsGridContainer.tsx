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

  // Imperative grid handles + row pump.
  const apiRef = useRef<GridApi<TData> | null>(null);
  const onReady = useCallback((handle: MarketsGridHandle) => {
    apiRef.current = handle.gridApi as unknown as GridApi<TData>;
    onReadyProp?.(handle);
  }, [onReadyProp]);

  // Snapshot vs. delta dispatch. See data-plane v2 docs for the
  // detailed contract — `replace: true` is a setRowData reset; without
  // it we split each batch into add/update by `getRowNode`.
  const stream = useProviderStream<TData>(activeId, activeCfg, {
    onDelta: (rows, replace) => {
      const api = apiRef.current; if (!api) return;
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
  });

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
