import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { MarketsGridHandle } from '@starui/grid';
import { usePerspectiveTable, type UsePerspectiveTableResult } from '@starui/grid';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import {
  buildLabPerspectiveProvider,
  labProviderId,
  LAB_PROVIDER_CFG_VERSION,
} from '../data/perspectiveProvider';
import { labRowFieldPatch } from '../data/rowDiff';
import { restartLabProvider } from '../data/restartLabProvider';
import type { LabRow } from '../data/types';
import { getScenarioById } from './scenarios';
import { useLabDemoRegistry } from './LabDemoContext';
import type { LabStreamOptions } from './types';

/**
 * The pull-path replacement for `useLabRows`.
 *
 * Same public shape, so a tab reads the same as it did on CSRM — but there is
 * no `rowData`. That is the whole point: the book lives in ONE Perspective
 * Table in the SharedWorker and this window opens a View against it, reading
 * only the blocks its viewport asks for. Rows never cross into the window as a
 * list, so there is nothing to hand `MarketsGrid` as `rowData`.
 *
 * Three things behave differently from the CSRM lab, all of them consequences
 * of the book not being here:
 *
 *   1. **Seeding is a config write, not a subscription.** The tab's provider
 *      row is upserted into the catalog, then `usePerspectiveTable` asks the
 *      hub to bind a ProxySession and opens the Table by name.
 *   2. **Row count comes from the Table**, not from a client-side array.
 *   3. **A scenario is an EDIT, not an overlay.** See `applyScenario`.
 */
export interface LabPerspectiveRowsResult {
  table: UsePerspectiveTableResult['table'];
  status: string;
  reason?: string;
  onReady: (handle: MarketsGridHandle) => void;
  tickMs: number;
  setTickMs: (ms: number) => void;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  scenarioId: string | null;
  applyScenario: (id: string) => void;
  clearScenario: () => void;
}

/** Rows this window currently holds — its loaded blocks, not the book. */
function loadedRows(api: GridApi | null): LabRow[] {
  if (!api) return [];
  const rows: LabRow[] = [];
  api.forEachNode((node) => {
    if (node.data) rows.push(node.data as LabRow);
  });
  return rows;
}

export function useLabPerspectiveRows(
  tabId: string,
  tabProviderId: string,
  opts: LabStreamOptions = {},
  onGridMount?: (handle: MarketsGridHandle) => void,
): LabPerspectiveRowsResult {
  const { register } = useLabDemoRegistry();
  const { client, configStore } = useDataServices();
  const userId = useUserIdFromContext();

  const gridApiRef = useRef<GridApi | null>(null);
  const applyTxRef = useRef<MarketsGridHandle['applyDataTransactionAsync'] | null>(null);
  const scenarioIdRef = useRef<string | null>(null);

  const [seeded, setSeeded] = useState(false);
  const [tickMs, setTickMs] = useState(opts.updateIntervalMs ?? 500);
  const [paused, setPaused] = useState(opts.enableUpdates === false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  scenarioIdRef.current = scenarioId;

  const providerId = useMemo(() => labProviderId(tabProviderId), [tabProviderId]);

  /**
   * Write the tab's provider row before attaching.
   *
   * Versioned and keyed on a deterministic id, so this is idempotent under
   * StrictMode's double-invoked effect — two concurrent runs upsert the SAME
   * row rather than racing to create two.
   */
  useEffect(() => {
    let cancelled = false;
    const versionKey = `perspective-ssrm-lab:cfgv:${providerId}`;
    void (async () => {
      try {
        const draft = buildLabPerspectiveProvider(tabProviderId, opts);
        const rows = await configStore.list(userId, { subtype: 'mock-perspective' });
        const exists = rows.some((p) => p.providerId === providerId);
        const stale = localStorage.getItem(versionKey) !== String(LAB_PROVIDER_CFG_VERSION);
        if (!exists || stale) {
          await configStore.save(draft, userId);
          localStorage.setItem(versionKey, String(LAB_PROVIDER_CFG_VERSION));
          /**
           * Rewriting the catalog row is NOT enough, and this is the trap.
           *
           * The SharedWorker outlives the page. If this provider is already
           * running, it holds a Table built from the schema it started with,
           * and attaching just re-opens that Table — so a corrected
           * declaration has no effect on screen until the provider is
           * recreated, however many times the page reloads. Passing the new
           * cfg makes the hub compare it and rebuild the slot; an unchanged
           * cfg costs nothing (`providerCfgEqual` gates it).
           */
          if (exists) restartLabProvider(client, providerId, { __cfgVersion: LAB_PROVIDER_CFG_VERSION }, draft.config);
        }
      } catch {
        // Attaching will report the real reason; a failed seed must not throw
        // out of an effect and blank the tab.
      }
      if (!cancelled) setSeeded(true);
    })();
    return () => {
      cancelled = true;
    };
    // `opts` is captured on the first seed for this provider, exactly as the
    // hub captures cfg on first attach. Runtime changes go through `restart`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, configStore, userId, tabProviderId, client]);

  const { table, status, reason } = usePerspectiveTable(
    client as never,
    seeded ? providerId : null,
    { enabled: seeded },
  );

  /**
   * Row count reads the Table, because this window does not hold the book.
   *
   * Polled SLOWLY and on purpose. Every `size()` is a round trip on the same
   * ProxySession the block reads use, and the engine serializes requests — a
   * one-second poll puts a call in front of the blocks a scroll is waiting on,
   * for a number that only changes when the provider restarts. The Demo
   * Console reads it through `getRowCount()` on demand as well, so a stale
   * few seconds costs nothing visible.
   */
  useEffect(() => {
    if (!table) return;
    let live = true;
    const read = () => {
      void Promise.resolve(table.size?.()).then((n) => {
        // Identical values bail out of React's update, so a steady book does
        // not re-render the tab at all.
        if (live && typeof n === 'number') setRowCount(n);
      });
    };
    read();
    const timer = setInterval(read, 10_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [table]);

  /**
   * A scenario is an EDIT to the shared book, not a client-side overlay.
   *
   * On CSRM the lab patched its own copy of the rows and pushed a transaction
   * into the grid. There is no copy here, so the scenario is applied to the
   * rows this window currently holds and written back through
   * `applyDataTransactionAsync` — which the Perspective surface routes to
   * `table.update()`. Two consequences worth knowing rather than discovering:
   *
   *   - It lands in the Table, so every OTHER window on this provider sees it
   *     too. That is the pull path working as designed, not a leak.
   *   - It targets the LOADED rows, since those are the ones this window has.
   *     Every scenario picks rows by index or predicate from the top, which is
   *     what the user is looking at, so the visible effect is the same.
   */
  const applyScenarioRows = useCallback((id: string | null) => {
    const api = gridApiRef.current;
    const applyTx = applyTxRef.current;
    if (!api || !applyTx || !id) return;

    const scenario = getScenarioById(id);
    if (!scenario) return;

    const before = loadedRows(api);
    if (before.length === 0) return;
    const after = scenario.apply(before);

    const updates: LabRow[] = [];
    for (let i = 0; i < before.length; i++) {
      const patch = labRowFieldPatch(before[i], after[i]);
      if (patch) updates.push({ ...before[i], ...patch });
    }
    if (updates.length > 0) applyTx({ update: updates });
  }, []);

  const applyScenario = useCallback(
    (id: string) => {
      setScenarioId(id);
      applyScenarioRows(id);
    },
    [applyScenarioRows],
  );

  /**
   * Clearing is a RESTART, not an undo.
   *
   * The CSRM lab could re-emit its snapshot and drop the overlay. Here the
   * scenario is already in the Table, and the only thing that rebuilds it from
   * the generator is the provider restarting — which the feed's own `replace`
   * handling absorbs without tearing the Table down under attached windows.
   */
  const clearScenario = useCallback(() => {
    if (!scenarioIdRef.current) return;
    setScenarioId(null);
    scenarioIdRef.current = null;
    restartLabProvider(client, providerId, { __scenarioClear: 1 });
  }, [client, providerId]);

  /** Pause / tick-rate are provider-side here — the generator ticks, not us. */
  useEffect(() => {
    if (!seeded) return;
    restartLabProvider(client, providerId, {
      enableUpdates: !paused,
      updateIntervalMs: tickMs,
    });
    // Only on a deliberate change, never on mount — a restart on mount would
    // re-snapshot the book every time a tab is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, tickMs]);

  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi;
      applyTxRef.current = handle.applyDataTransactionAsync ?? null;
      onGridMount?.(handle);
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }
      if (scenarioIdRef.current) applyScenarioRows(scenarioIdRef.current);
    },
    [onGridMount, applyScenarioRows],
  );

  useEffect(() => {
    register({
      tabId,
      getRowCount: () => rowCount,
      snapshotRowCount: rowCount,
      paused,
      setPaused,
      tickMs,
      setTickMs,
      activeScenarioId: scenarioId,
      applyScenario,
      clearScenario,
    });
    return () => register(null);
  }, [
    tabId,
    rowCount,
    paused,
    tickMs,
    scenarioId,
    applyScenario,
    clearScenario,
    register,
  ]);

  return {
    table,
    status,
    reason,
    onReady,
    tickMs,
    setTickMs,
    paused,
    setPaused,
    scenarioId,
    applyScenario,
    clearScenario,
  };
}
