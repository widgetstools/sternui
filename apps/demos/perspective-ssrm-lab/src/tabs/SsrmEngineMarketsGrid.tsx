import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import {
  MarketsGrid,
  type MarketsGridHandle,
  type SsrmEngineMarketsGridSurfaceHandle,
} from '@starui/grid';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { STRESS_KEY_FIELD, STRESS_ROW_COUNT } from '../data/stressColumns';
import { STRESS_BOOK_ID } from '../data/stressBook';

/**
 * The SAME generated Stress book, on the SAME engine, under **MarketsGrid**.
 *
 * The SSRM Engine tab beside this one mounts a plain `AgGridReact`, and it stays
 * that way: it is the CONTROL. This is the treatment — identical book, identical
 * worker, identical tick rate, with the whole MarketsGrid platform (customizer,
 * toolbars, profiles, status bar, export) on top.
 *
 * **Two tabs rather than a toggle inside one**, and that is a measurement
 * requirement rather than a layout preference. The A/B that answers "what does
 * the platform cost the read path" has to ALTERNATE two addresses in one series
 * — both `browserSmokeProbe` and `providerBookProbe` are bimodal on identical
 * code, and two consecutive runs of one configuration is not a control. A
 * toggle gives a probe one page to load and no second address to interleave
 * with.
 *
 * Both tabs open the same book id on the same named SharedWorker, so they SHARE
 * one book. That removes "a second book was built" from the list of things a
 * difference between them could be.
 *
 * **The calculated columns are NOT passed in here.** They are seeded as
 * customizer state and travel the path a user's own column takes: the
 * calculated-columns module builds the colDefs, `useSsrmEngineCalcColumns`
 * plans them for the `ssrm-engine` backend, and the AST crosses the port. A
 * pre-built list handed to the surface would demonstrate the wiring and skip
 * the two stages most likely to be wrong.
 */

/** Stable empty array — `rowData` is required by the props type and unused here. */
const NO_ROWS: never[] = [];

/** Block round trips, kept for the probes. Bounded — this runs for minutes. */
const BLOCK_SAMPLE_CAP = 4_000;

export interface SsrmEngineMarketsGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Live tick interval, applied in the worker. 0 disables ticking. */
  tickMs?: number;
  statusBar?: unknown;
  sideBar?: unknown;
  storage?: unknown;
  gridId: string;
  defaultColDef?: ColDef;
  /** Seeded demo profiles — this is how the calculated columns get installed. */
  onProfilesReady?: (handle: MarketsGridHandle) => void;
  /** Told once the client is open and the measurement handle is published. */
  onReady?: () => void;
}

export function SsrmEngineMarketsGrid({
  columnDefs,
  rowHeight = 28,
  tickMs = 200,
  statusBar,
  sideBar,
  storage,
  gridId,
  defaultColDef,
  onProfilesReady,
  onReady,
}: SsrmEngineMarketsGridProps) {
  /**
   * `null` while the book is being opened, which the host reads as "mount NO
   * grid" — see `resolveGridSurface`. A CSRM stand-in in that window fires
   * `onGridReady`, then `onGridPreDestroyed` → `platform.destroy()`, and the
   * real grid lands on a destroyed platform with every platform-driven feature
   * silently dead. Three separate "the toolbar is broken" bugs came from that.
   */
  const [client, setClient] = useState<SsrmEngineClient | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const surfaceRef = useRef<SsrmEngineMarketsGridSurfaceHandle | null>(null);
  const blocksRef = useRef<{ ms: number[]; served: number; failed: number }>({
    ms: [],
    served: 0,
    failed: 0,
  });
  const openRef = useRef<{ ms: number; clientsAtOpen: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: SsrmEngineClient | null = null;
    /**
     * `new URL(..., import.meta.url)` is what makes Vite emit the worker as its
     * own chunk. `name` matters too — a SharedWorker is identified by script
     * URL AND name, so this window lands on the same worker the control tab
     * opens, which is the point.
     */
    const worker = new SharedWorker(new URL('../workers/ssrmBookWorker.ts', import.meta.url), {
      type: 'module',
      name: 'starui-ssrm-book',
    });
    const startedAt = performance.now();
    SsrmEngineClient.open(worker.port, STRESS_BOOK_ID, {
      bookOptions: { rows: STRESS_ROW_COUNT, tickMs },
      onFault: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine worker]', error);
      },
    }).then(
      (next) => {
        if (cancelled) {
          void next.close();
          return;
        }
        opened = next;
        openRef.current = {
          ms: performance.now() - startedAt,
          // 1 means this window is the one that BUILT the book.
          clientsAtOpen: next.clientsAtOpen,
        };
        setClient(next);
      },
      (error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine] could not open the book', error);
        if (!cancelled) setFault(String(error));
      },
    );
    return () => {
      cancelled = true;
      // The worker OUTLIVES this page. A book nobody detaches from survives a
      // reload, and the next load builds a second one beside it.
      void opened?.close();
    };
  }, [tickMs]);

  const onBlock = useCallback((ms: number, outcome: 'ok' | 'fail') => {
    const blocks = blocksRef.current;
    if (outcome === 'ok') blocks.served += 1;
    else blocks.failed += 1;
    if (blocks.ms.length < BLOCK_SAMPLE_CAP) blocks.ms.push(ms);
  }, []);

  /**
   * The measurement handle, under the SAME global the control publishes.
   *
   * That is what lets `browserSmokeProbe` and `workerBoundaryProbe` run against
   * either tab unchanged, which is what an alternating A/B needs. Unconditional
   * rather than DEV-only, because every measurement here is taken against a
   * PRODUCTION build and a DEV-gated handle is one no probe can ever reach.
   *
   * `viewportReporting` is deliberately ABSENT rather than a no-op: it is the
   * switch a viewport A/B flips, and a stub that silently did nothing would make
   * that comparison agree with itself. A probe needing it fails loudly here.
   */
  useEffect(() => {
    if (!client) return;
    (globalThis as Record<string, unknown>).__ssrmEngineGrid = {
      /** Read through the surface handle: the api arrives after the client. */
      get api() {
        return surfaceRef.current?.getApi() ?? null;
      },
      engine: {
        get size() {
          return client.size;
        },
      },
      client,
      /** Which of the two tabs answered. A probe that cannot tell is a probe
       *  that can report the control's numbers as the treatment's. */
      surface: 'marketsgrid',
      blocks: () => ({ ...blocksRef.current, ms: [...blocksRef.current.ms] }),
      rpc: () => client.stats(),
      pump: () => surfaceRef.current?.pumpStats() ?? null,
      open: () => openRef.current,
      introspect: () => client.introspect(),
      calcDiagnostics: () => surfaceRef.current?.calcDiagnostics() ?? Promise.resolve([]),
    };
    onReady?.();
  }, [client, onReady]);

  const gridDefaults = useMemo(
    () => defaultColDef ?? { sortable: true, filter: true, resizable: true },
    [defaultColDef],
  );

  if (fault) {
    return (
      <div className="p-4 text-sm text-[var(--bn-status-negative,#b91c1c)]">
        The worker-held book did not open: {fault}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }} data-testid="ssrm-engine-marketsgrid">
      <MarketsGrid
        gridId={gridId}
        // Required by the props type and UNUSED on this path: the rows come
        // from the worker-held book.
        rowData={NO_ROWS}
        rowModel="ssrm-engine"
        ssrmEngineClient={client}
        ssrmEngineKeyColumn={STRESS_KEY_FIELD}
        ssrmEngineOnBlock={onBlock}
        ssrmEngineSurfaceRef={surfaceRef}
        componentName="SSRM Engine (MarketsGrid)"
        columnDefs={columnDefs}
        defaultColDef={gridDefaults}
        rowIdField={STRESS_KEY_FIELD}
        rowHeight={rowHeight}
        animateRows={false}
        sideBar={sideBar as never}
        statusBar={statusBar as never}
        storage={storage as never}
        onReady={onProfilesReady}
        showProfileSelector
        showSaveButton
        showSettingsButton
        showVisualExcelExport
      />
    </div>
  );
}
