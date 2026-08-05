import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  createAsyncSsrmDatasource,
  makeSsrmGetRowId,
  SSRM_CHILD_COUNT,
  type SsrmRow,
} from '@starui/ssrm-engine';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import { STRESS_KEY_FIELD, STRESS_ROW_COUNT } from '../data/stressColumns';
import { STRESS_BOOK_ID } from '../data/stressBook';

/**
 * The Stress book on `@starui/ssrm-engine`, hosted in a **SharedWorker**.
 *
 * Reached with `?engine=ssrm`. Same row count, same 120 columns, same types and
 * the same tick rate as the Perspective surface beside it, so the probes that
 * measure that path — `rendererProcessProbe.mjs`, `stubVisibilityProbe.mjs` —
 * apply here unchanged and the numbers line up.
 *
 * **The book is not in this window.** It was, until session 1: the engine was
 * synchronous and in-process, which is the memory shape that produced "Aw,
 * Snap · Out of Memory" on the Perspective path and made every figure recorded
 * for this engine a figure against a topology Perspective was never competing
 * on. What this window now holds is a port, an async datasource and AG's own
 * block cache.
 *
 * Plain `AgGridReact` rather than `MarketsGrid`: the customizer, profiles,
 * toolbars and alerts all bind to the platform, and none of that is wired to
 * this engine. What is being tested is the row supply.
 */

/**
 * The SAME module set the rest of the lab uses, and registering a subset is not
 * an option.
 *
 * MEASURED the hard way, twice. First the surface mounted with no rows at all
 * and the only signal was AG **error #200 — missing ServerSideRowModelModule**,
 * because the lab registers its modules on the MarketsGrid path and this one
 * deliberately does not go through it. Registering three modules by hand fixed
 * the rows and produced a subtler failure: `getColumns()` and
 * `getDisplayedRowCount()` returned **null and undefined on a live, undestroyed
 * api** while 28 rows were painted on screen. AG Grid 36 gates its API surface
 * behind modules, so an unregistered one leaves the method present and inert.
 *
 * A silently inert api is exactly the kind of thing that makes a probe report a
 * confident zero, so this registers the whole enterprise bundle — the same thing
 * `ensureAgGridModules` does for `MarketsGrid` — rather than a hand-picked list.
 * Registration is idempotent, so doing it twice costs nothing.
 *
 * Imported straight from `ag-grid-enterprise` rather than through the
 * `@starui/grid` barrel: pulling that barrel in at module scope changed what
 * loads at app boot and left the Stress tab rendering nothing at all, with no
 * console error to say so.
 */
ModuleRegistry.registerModules([AllEnterpriseModule]);

/** Block round trips, kept for the probes. Bounded — this runs for minutes. */
const BLOCK_SAMPLE_CAP = 4_000;

export interface SsrmEngineStressGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Live tick interval, applied in the worker. 0 disables ticking. */
  tickMs?: number;
}

export function SsrmEngineStressGrid({
  columnDefs,
  rowHeight = 28,
  tickMs = 200,
}: SsrmEngineStressGridProps) {
  const apiRef = useRef<GridApi | null>(null);
  const blocksRef = useRef<{ ms: number[]; served: number; failed: number }>({
    ms: [],
    served: 0,
    failed: 0,
  });
  const [client, setClient] = useState<SsrmEngineClient | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  /**
   * Open the book.
   *
   * `new URL(..., import.meta.url)` is what makes Vite emit the worker as its
   * own chunk; a string path would be shipped verbatim and 404 in a production
   * build. `name` matters too — a SharedWorker is identified by script URL AND
   * name, so every window naming the same pair lands on ONE worker, which is
   * the entire point.
   */
  useEffect(() => {
    let cancelled = false;
    let opened: SsrmEngineClient | null = null;

    const worker = new SharedWorker(new URL('../workers/ssrmBookWorker.ts', import.meta.url), {
      type: 'module',
      name: 'starui-ssrm-book',
    });

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
        setClient(next);
      },
      (error: unknown) => {
        // A book that never opens is a blank tab. Say why, on the surface and
        // in the console — this is the failure a SharedWorker hides best.
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

  const datasource = useMemo(() => {
    if (!client) return null;
    return createAsyncSsrmDatasource(client, {
      onError: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine] block failed', error);
      },
      onBlock: (ms, outcome) => {
        const blocks = blocksRef.current;
        if (outcome === 'ok') blocks.served += 1;
        else blocks.failed += 1;
        if (blocks.ms.length < BLOCK_SAMPLE_CAP) blocks.ms.push(ms);
      },
    });
  }, [client]);

  const getRowId = useMemo(() => makeSsrmGetRowId(STRESS_KEY_FIELD), []);

  /**
   * The live path: the worker PUSHES what changed, this window applies it.
   *
   * The whole point of the engine reporting a delta. On the Perspective surface
   * a tick had to re-read the viewport because `on_update` does not say which
   * rows moved; here the worker sends the sparse patch it applied and a tick is
   * one transaction of exactly the cells that ticked — no invalidation, no
   * re-request, and therefore no stub rows.
   */
  useEffect(() => {
    if (!client) return;
    return client.subscribe((delta) => {
      const api = apiRef.current;
      if (!api || api.isDestroyed?.()) return;

      // Only rows AG actually holds are worth pushing — a transaction for a row
      // outside the block cache is ignored, and building it is wasted work.
      const update: SsrmRow[] = [];
      for (const patch of delta.rows) {
        const node = api.getRowNode(String(patch[STRESS_KEY_FIELD]));
        if (node?.data) update.push({ ...(node.data as SsrmRow), ...patch });
      }
      if (update.length > 0) api.applyServerSideTransaction({ update });
    });
  }, [client]);

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }} data-testid="ssrm-engine-grid">
      {fault && (
        <div className="p-4 text-sm text-[var(--bn-status-negative,#b91c1c)]">
          The worker-held book did not open: {fault}
        </div>
      )}
      {datasource && client && (
        <AgGridReact
          columnDefs={columnDefs}
          rowModelType="serverSide"
          serverSideDatasource={datasource as never}
          getRowId={getRowId as never}
          rowHeight={rowHeight}
          cacheBlockSize={100}
          maxBlocksInCache={100}
          blockLoadDebounceMillis={40}
          animateRows={false}
          suppressAggFuncInHeader
          /**
           * Must match the engine's `pivotResultFieldSeparator`. AG rebuilds its
           * secondary columns by SPLITTING each `pivotResultFields` entry on
           * this, so a mismatch does not error — it silently carves the field
           * name in the wrong place and produces columns named after fragments.
           */
          serverSidePivotResultFieldSeparator="_"
          sideBar={{ toolPanels: ['columns', 'filters'] }}
          rowGroupPanelShow="always"
          pivotPanelShow="always"
          getChildCount={(data: SsrmRow) => data?.[SSRM_CHILD_COUNT] as number}
          onGridReady={(event) => {
            apiRef.current = event.api;
            /**
             * A measurement handle, the same affordance `useLabPerspectiveRows`
             * gives the MarketsGrid path through `__labGrid`.
             *
             * Unconditional rather than DEV-only: every measurement on this path
             * is taken against a PRODUCTION build (the dev server serves hundreds
             * of modules per window and a third window never finishes loading), so
             * a DEV-gated handle is a handle that no probe can ever reach. Walking
             * `__reactFiber$` finds the api on the MarketsGrid surface but not on a
             * plain `AgGridReact`, which is what made this necessary.
             *
             * `engine` is a SHIM, and deliberately a live one: the book is in the
             * worker, so `size` is the worker's last word rather than a local
             * count. It is set by `open` and moved by every delta push, so a
             * worker that stopped answering shows a size that stops moving —
             * which is the honest thing for it to show.
             */
            (globalThis as Record<string, unknown>).__ssrmEngineGrid = {
              api: event.api,
              engine: {
                get size() {
                  return client.size;
                },
              },
              client,
              /** Boundary cost: entry to `getRows` until AG is answered. */
              blocks: () => ({ ...blocksRef.current, ms: [...blocksRef.current.ms] }),
              rpc: () => client.stats(),
            };
          }}
        />
      )}
    </div>
  );
}
