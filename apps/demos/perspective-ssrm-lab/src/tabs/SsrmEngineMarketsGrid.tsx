import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ColDef } from 'ag-grid-community';
import {
  MarketsGrid,
  type MarketsGridHandle,
  type MarketsGridProps,
  type SsrmEngineMarketsGridSurfaceHandle,
} from '@starui/grid';
import { STRESS_KEY_FIELD } from '../data/stressColumns';
import { useStressSsrmClient } from '../data/useStressSsrmClient';

/**
 * The generated Stress book under **MarketsGrid**, on `@starui/ssrm-engine`.
 *
 * Two tabs mount this:
 *
 *   - **SSRM Engine · MarketsGrid** — the discoverable showcase, with the six
 *     calculated columns seeded as customizer state;
 *   - **Stress Test** on `?engine=ssrm&surface=marketsgrid` — the bake-off
 *     branch, which shares the Perspective branch's profile, columns and grid
 *     options so the ONLY difference between them is `rowModel`.
 *
 * The second one is why every piece of chrome is a prop rather than a constant.
 * The Stress tab's seeded profile carries conditional styling, column groups,
 * calculated columns, saved filters, grouping and totals; comparing that
 * against a bare grid would measure the profiles and report it as an engine
 * difference, which is the confound session 8 exists to remove.
 */

/** Stable empty array — `rowData` is required by the props type and unused here. */
const NO_ROWS: never[] = [];

/** Block round trips, kept for the probes. Bounded — this runs for minutes. */
const BLOCK_SAMPLE_CAP = 4_000;

export interface SsrmEngineMarketsGridProps {
  columnDefs: ColDef[];
  gridId: string;
  rowHeight?: number;
  /** Live tick interval, applied in the worker. 0 disables ticking. */
  tickMs?: number;
  defaultColDef?: ColDef;
  componentName?: string;
  /**
   * Everything else MarketsGrid takes — the toolbars, the side bar, the status
   * bar, the storage adapter. Passed as one object so a caller can hand over
   * the same `config.grid` the Perspective branch uses without this component
   * growing a prop per flag and drifting from it.
   */
  chrome?: Partial<MarketsGridProps>;
  /** Seeded demo profiles — how the calculated columns get installed. */
  onProfilesReady?: (handle: MarketsGridHandle) => void;
  /** Told once the client is open and the measurement handle is published. */
  onReady?: () => void;
}

export function SsrmEngineMarketsGrid({
  columnDefs,
  gridId,
  rowHeight = 28,
  tickMs = 200,
  defaultColDef,
  componentName = 'SSRM Engine (MarketsGrid)',
  chrome,
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
  const { client, fault, openCost } = useStressSsrmClient(tickMs);
  const surfaceRef = useRef<SsrmEngineMarketsGridSurfaceHandle | null>(null);
  const blocksRef = useRef<{ ms: number[]; served: number; failed: number }>({
    ms: [],
    served: 0,
    failed: 0,
  });

  const onBlock = useCallback((ms: number, outcome: 'ok' | 'fail') => {
    const blocks = blocksRef.current;
    if (outcome === 'ok') blocks.served += 1;
    else blocks.failed += 1;
    if (blocks.ms.length < BLOCK_SAMPLE_CAP) blocks.ms.push(ms);
  }, []);

  /**
   * The measurement handle, under the SAME global the plain surface publishes.
   *
   * That is what lets `browserSmokeProbe` and `workerBoundaryProbe` run against
   * any of the three surfaces unchanged, which is what an alternating A/B
   * needs. Unconditional rather than DEV-only, because every measurement here
   * is taken against a PRODUCTION build and a DEV-gated handle is one no probe
   * can ever reach.
   *
   * `viewportReporting` is deliberately ABSENT rather than a no-op: it is the
   * switch a viewport A/B flips, and a stub that silently did nothing would
   * make that comparison agree with itself.
   */
  useEffect(() => {
    if (!client) return;
    (globalThis as Record<string, unknown>).__ssrmEngineGrid = {
      get api() {
        return surfaceRef.current?.getApi() ?? null;
      },
      engine: {
        get size() {
          return client.size;
        },
      },
      client,
      /** Which surface answered. A probe that cannot tell is a probe that can
       *  report the control's numbers as the treatment's. */
      surface: 'marketsgrid',
      blocks: () => ({ ...blocksRef.current, ms: [...blocksRef.current.ms] }),
      rpc: () => client.stats(),
      pump: () => surfaceRef.current?.pumpStats() ?? null,
      /**
       * The GROUPED live path's counters, which are a different mechanism from
       * the pump's: under grouping this surface pushes nothing and re-reads the
       * expanded routes instead. A probe that read only `pump` would report a
       * grouped grid as dead.
       */
      groupRefresh: () => surfaceRef.current?.groupRefreshStats() ?? null,
      /**
       * One route-refresh pass, on demand. What a probe times to find out what
       * the grouped live path COSTS on this book — the number the throttle has
       * to be chosen against, and one that cannot be carried over from 20k.
       */
      refresh: () => surfaceRef.current?.refresh(),
      /**
       * Pause applying pushed writes — which under grouping also stops the
       * automatic route refresh. Without it, timing one pass is impossible: the
       * feed keeps triggering more and the block count never goes quiet.
       */
      setLive: (live: boolean) => surfaceRef.current?.setLive(live),
      open: () => openCost(),
      introspect: () => client.introspect(),
      calcDiagnostics: () => surfaceRef.current?.calcDiagnostics() ?? Promise.resolve([]),
    };
    onReady?.();
  }, [client, onReady, openCost]);

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
        {...(chrome as MarketsGridProps)}
        gridId={gridId}
        // Required by the props type and UNUSED on this path: the rows come
        // from the worker-held book.
        rowData={NO_ROWS}
        rowModel="ssrm-engine"
        ssrmEngineClient={client}
        ssrmEngineKeyColumn={STRESS_KEY_FIELD}
        ssrmEngineOnBlock={onBlock}
        ssrmEngineSurfaceRef={surfaceRef}
        componentName={componentName}
        columnDefs={columnDefs}
        defaultColDef={gridDefaults}
        rowIdField={STRESS_KEY_FIELD}
        rowHeight={rowHeight}
        animateRows={false}
        onReady={onProfilesReady}
      />
    </div>
  );
}
