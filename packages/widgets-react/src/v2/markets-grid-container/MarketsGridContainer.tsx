/**
 * MarketsGridContainer — v2.
 *
 * Replaces v1's 415-LOC container. Same imperative grid integration
 * (setRowData on replace, applyTransactionAsync({update}) on delta),
 * but driven by a much smaller substrate:
 *
 *   - Two providers in the picker, ONE active at a time.
 *   - Active provider's cfg is read from ConfigManager, then walked
 *     through `useResolvedCfg` to substitute `{{appdata.key}}`
 *     templates against the live AppData snapshot. When a templated
 *     key changes, the cfg identity flips, the hook re-attaches, and
 *     the Hub turns the second attach into a `provider.restart(extra)`.
 *   - Toolbar hidden by default. Shift+Ctrl+P toggles it. The
 *     listener is scoped to the container's root div so it doesn't
 *     fire across other routes.
 *   - Refresh button calls `useProviderStream`'s refresh(), which
 *     wraps a fresh `attach` with `extra: { __refresh: ts }`.
 *
 * The grid is gated on a resolved cfg + non-null keyColumn — AG-Grid's
 * `getRowId` is an INITIAL property and we avoid mounting until we
 * know what to set it to. Swapping providers (different keyColumn)
 * remounts via the `key` prop.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle } from '@marketsui/markets-grid';
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
  extends Omit<MarketsGridProps<TData>, 'rowData' | 'rowIdField' | 'columnDefs'> {
  /** Initial live provider id. May be null until the user picks. */
  initialLiveProviderId?: string | null;
  /** Initial historical provider id. Optional. */
  initialHistoricalProviderId?: string | null;
  /**
   * Where to write the historical date when the user picks one.
   * Format: `'appDataProviderName.key'` — e.g. `'positions.asOfDate'`.
   * The historical provider's cfg should reference this entry via
   * `{{positions.asOfDate}}` so the value flows through.
   * Required when a historical provider is supplied.
   */
  historicalDateAppDataRef?: string;
  /** Mode to start in. Defaults to `'live'`. */
  initialMode?: ProviderMode;
  /**
   * Called when the user clicks the toolbar's Edit button. The
   * consumer is expected to open the editor (typically as a popout
   * window via `data-plane-popout.ts`'s helper).
   */
  onEditProvider?(providerId: string): void;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
}

export function MarketsGridContainer<TData extends Record<string, unknown> = Record<string, unknown>>(
  props: MarketsGridContainerProps<TData>,
) {
  const {
    initialLiveProviderId = null,
    initialHistoricalProviderId = null,
    historicalDateAppDataRef,
    initialMode = 'live',
    onEditProvider,
    onError,
    onReady: onReadyProp,
    ...marketsGridProps
  } = props;

  const dp = useDataPlane();
  const appData = useAppDataStore();

  // Picker state — toolbar hidden by default.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(initialLiveProviderId);
  const [historicalId, setHistoricalId] = useState<string | null>(initialHistoricalProviderId);
  const [mode, setMode] = useState<ProviderMode>(initialMode);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);

  // List of available providers per slot. Subtype filter could be
  // tightened (live=stomp, historical=rest) but keeping it open is
  // friendlier — the user might want a Mock for either slot in dev.
  const liveList = useDataProvidersList();
  const histList = useDataProvidersList();

  // Hotkey: toggle the toolbar globally while the container is mounted.
  // The listener attaches to document so it fires regardless of focus
  // (the grid often has focus and we don't want it to swallow the chord).
  //
  // Chord choice: Alt+Shift+P. The original plan called for
  // Ctrl+Shift+P but every major browser binds that to "open
  // incognito / private window" — Chromium intercepts it before the
  // page-level keydown listener runs, so the toolbar never reveals
  // in plain browser AND in OpenFin (Chromium under the hood). Alt+
  // Shift+P is unbound in Chrome / Firefox / Edge / Safari / OpenFin
  // and is mnemonic for "Provider".
  const toggleToolbar = useCallback(() => setPickerVisible((v) => !v), []);
  useChordHotkey('Alt+Shift+P', (e) => {
    e.preventDefault();
    toggleToolbar();
  });

  // Active provider: the selected one for the current mode.
  const activeId = mode === 'live' ? liveId : historicalId;
  const activeRow = useDataProviderConfig(activeId);
  const activeCfg = useResolvedCfg(activeRow.cfg?.config ?? null);

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

  // Use the active provider's keyColumn for `rowIdField` and its
  // saved columnDefinitions for the grid layout. Both are read from
  // the saved DataProviderConfig — never authored at the blotter
  // level (see CLAUDE history: "Could not find row id" errors when
  // those drift).
  const rowIdField = activeRow.cfg
    ? (activeCfg as { keyColumn?: string } | null)?.keyColumn ?? null
    : null;

  // Imperative grid handles + row pump.
  const apiRef = useRef<GridApi<TData> | null>(null);
  const onReady = useCallback((handle: MarketsGridHandle) => {
    apiRef.current = handle.gridApi as unknown as GridApi<TData>;
    onReadyProp?.(handle);
  }, [onReadyProp]);

  // Snapshot vs. delta dispatch.
  //
  //   • `replace: true`  → `setGridOption('rowData', ...)`. Resets the
  //     grid to the supplied set in one go. Used for the first emit on
  //     attach (Hub replays its cache) and on `provider.restart()`.
  //
  //   • `replace: false` → keyed upserts via `applyTransactionAsync`.
  //     AG Grid's transaction API distinguishes `add` (row id NOT in
  //     the grid) from `update` (row id IS in the grid). Sending a row
  //     to `update` whose id the grid doesn't know about throws AG Grid
  //     error #4 ("Could not find row id ..."). We split the incoming
  //     batch by querying `api.getRowNode(id)` per row and routing
  //     accordingly. New rows that arrive after the snapshot (e.g. a
  //     freshly opened position on a STOMP feed) take the `add` branch;
  //     ticks on rows we already have take `update`.
  const stream = useProviderStream<TData>(activeId, activeCfg, {
    onDelta: (rows, replace) => {
      const api = apiRef.current; if (!api) return;
      if (replace) {
        api.setGridOption('rowData', rows.slice());
        return;
      }
      if (rows.length === 0) return;
      // Without a key column we can't distinguish add vs update; fall
      // back to update-only and let AG Grid surface error #4 for any
      // rows it can't match. This shouldn't happen in practice — the
      // editor enforces a non-empty keyColumn before save.
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
    if (mode === 'historical' && asOfDate) {
      stream.refresh({ asOfDate });
    } else {
      stream.refresh();
    }
  }, [activeId, mode, asOfDate, stream]);
  const columnDefs = useMemo<ColDef<TData>[] | null>(() => {
    const defs = (activeCfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions;
    return defs && defs.length > 0 ? defs : null;
  }, [activeCfg]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {pickerVisible && (
        <ProviderToolbar
          liveProviders={liveList.configs}
          historicalProviders={histList.configs}
          liveProviderId={liveId}
          historicalProviderId={historicalId}
          mode={mode}
          asOfDate={asOfDate}
          onLiveChange={setLiveId}
          onHistoricalChange={setHistoricalId}
          onModeChange={setMode}
          onAsOfDateChange={setAsOfDateAndPersist}
          onRefresh={refresh}
          onEdit={(id) => onEditProvider?.(id)}
        />
      )}

      <div className="flex-1 min-h-0">
        {!activeId ? (
          <EmptyState onReveal={() => setPickerVisible(true)} />
        ) : !activeRow.loading && rowIdField && columnDefs ? (
          <MarketsGrid<TData>
            {...(marketsGridProps as MarketsGridProps<TData>)}
            key={`${activeId}::${rowIdField}`}
            rowData={EMPTY as TData[]}
            rowIdField={rowIdField}
            columnDefs={columnDefs}
            onReady={onReady}
          />
        ) : (
          <LoadingState status={stream.status} />
        )}
      </div>

      {/* keep ref to dp for future expansion (stop button, etc.) */}
      <span className="sr-only" data-dataplane-ready>{dp ? 'ok' : '–'}</span>
    </div>
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}

function EmptyState({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="flex items-center justify-center h-full p-8 text-center">
      <div className="max-w-md">
        <div className="text-sm font-medium mb-1">No data provider selected</div>
        <div className="text-xs text-muted-foreground mb-3">
          Press <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">Alt</kbd>+<kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">Shift</kbd>+<kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">P</kbd> to reveal the provider toolbar, then pick a Live (and optionally Historical) provider.
        </div>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={onReveal}
        >
          Show toolbar now
        </button>
      </div>
    </div>
  );
}

function LoadingState({ status }: { status: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
      {status === 'error' ? 'Provider error — check the editor diagnostics.' : 'Loading…'}
    </div>
  );
}
