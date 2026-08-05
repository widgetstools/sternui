import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  createAsyncSsrmDatasource,
  createSsrmRowPump,
  makeSsrmGetRowId,
  SSRM_CHILD_COUNT,
  type SsrmGetRowsRequest,
  type SsrmRow,
  type SsrmRowPump,
} from '@starui/ssrm-engine';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';

/**
 * An AG Grid driven by `@starui/ssrm-engine`, with the book in a SharedWorker.
 *
 * **The book is not in this window.** It was, until session 1: the engine was
 * synchronous and in-process, which is the memory shape that produced "Aw,
 * Snap · Out of Memory" on the Perspective path and made every figure recorded
 * for this engine a figure against a topology Perspective was never competing
 * on. What this window holds is a port, an async datasource and AG's own block
 * cache.
 *
 * WHICH worker is the caller's business — `openClient`. Two live in this app:
 * `SsrmEngineStressGrid` opens a generated book in the app's own
 * `ssrmBookWorker`; `SsrmProviderGrid` attaches to a book FED by a provider in
 * the data-services worker, which is where that provider's rows already are.
 * Everything else is shared on purpose, so a figure taken on one surface means
 * something on the other.
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

/**
 * Rows of slack either side of the declared viewport.
 *
 * The viewport is reported on a scroll, and a scroll moves faster than the
 * report. Without slack a row that scrolled into view a frame ago would miss
 * its tick and sit stale until the next report — visibly, on a price. 50 rows
 * is roughly two screens at this row height and still an order of magnitude
 * narrower than AG's own block cache, which is what the narrowing is measured
 * against.
 */
const VIEWPORT_SLACK_ROWS = 50;

export interface SsrmEngineGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Field carrying the row key — the same one the book is indexed on. */
  keyField: string;
  /**
   * Get a client for the book this grid renders.
   *
   * The one thing that differs between a GENERATED book in the app's own
   * `ssrmBookWorker` and a book FED by a provider in the data-services worker.
   * Everything below — the datasource, the push pump, the viewport reporting,
   * the measurement handle — is identical, and keeping it identical is what
   * makes a figure taken on one surface mean anything on the other.
   *
   * Must be stable across renders: it is the effect's only dependency, and an
   * unstable one would re-open the book on every render.
   */
  openClient: () => Promise<SsrmEngineClient>;
  /**
   * Calculated columns to install in the worker, as StarUI expression ASTs.
   *
   * The AST and nothing else crosses the port: it is plain data, so it
   * structured-clones, where a compiled closure could not cross at all. The
   * engine computes the value where the BOOK is, which is what lets a
   * calculated column be sorted, filtered, grouped and aggregated on rather
   * than only displayed.
   *
   * Must be stable across renders — it is an effect dependency.
   */
  calcColumns?: readonly { colId: string; ast: unknown }[];
  /**
   * Handed the same handle `__ssrmEngineGrid` carries, once the grid is ready.
   *
   * The global exists for PROBES, which run outside React and cannot be handed
   * anything. A surface rendered inside the app should not have to read a
   * global to drive its own grid, so it gets a callback — and both go through
   * the same object, because two handles that drift is how a probe ends up
   * measuring something the screen is not doing.
   */
  onSurfaceReady?: (handle: SsrmEngineGridHandle) => void;
}

/** What a surface (and every probe) can do with the mounted grid. */
export interface SsrmEngineGridHandle {
  api: GridApi;
  client: SsrmEngineClient;
  engine: { readonly size: number };
  blocks: () => { ms: number[]; served: number; failed: number };
  rpc: () => ReturnType<SsrmEngineClient['stats']>;
  pump: () => ReturnType<SsrmRowPump['stats']> | null;
  open: () => { ms: number; clientsAtOpen: number } | null;
  viewportReporting: (on: boolean) => void;
  introspect: () => ReturnType<SsrmEngineClient['introspect']>;
  /** What the engine made of the installed expressions. Empty is the good case. */
  calcDiagnostics: () => unknown[];
}

export function SsrmEngineGrid({
  columnDefs,
  rowHeight = 28,
  keyField,
  openClient,
  calcColumns,
  onSurfaceReady,
}: SsrmEngineGridProps) {
  const apiRef = useRef<GridApi | null>(null);
  const blocksRef = useRef<{ ms: number[]; served: number; failed: number }>({
    ms: [],
    served: 0,
    failed: 0,
  });
  /**
   * The shape AG is currently pulling with — sort, filter, grouping.
   *
   * Read off the requests the datasource actually served rather than
   * reconstructed from the grid's state, because it is the served shape that
   * the worker's index is keyed on. A viewport built from a different shape
   * would name display positions in an index nobody is reading.
   */
  const lastRequestRef = useRef<SsrmGetRowsRequest | null>(null);
  const pumpRef = useRef<SsrmRowPump | null>(null);
  const openRef = useRef<{ ms: number; clientsAtOpen: number } | null>(null);
  const viewportEnabledRef = useRef(true);
  const [client, setClient] = useState<SsrmEngineClient | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: SsrmEngineClient | null = null;

    /**
     * How long GETTING THE BOOK took, separately from booting the app.
     *
     * This is the only part of a window's open that sharing can affect: the
     * first client builds 20,000 x 121, every later one is answered from the
     * engine that already exists. Time-to-first-row conflates it with the app
     * bundle, React, AG Grid and the column defs, which are the same work in
     * every window whatever holds the book — so a claim about the second window
     * opening faster has to be made against this number, not that one.
     */
    const openStarted = performance.now();

    openClient().then(
      (next) => {
        if (cancelled) {
          void next.close();
          return;
        }
        opened = next;
        openRef.current = {
          ms: performance.now() - openStarted,
          // 1 means this window is the one that BUILT the book.
          clientsAtOpen: next.clientsAtOpen,
        };
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
  }, [openClient]);

  /**
   * Install the calculated columns BEFORE the grid mounts, and read back what
   * the engine made of them.
   *
   * The read-back is not decoration. A refused column is not installed at all —
   * it falls back to its field binding, which for a colId naming no field is a
   * column of blanks — and `console.warn` inside a SharedWorker reaches no
   * console anywhere, so without `calcDiagnostics()` a refusal is a blank
   * column and no way to ask why. That is how `LOG10` was found to not exist
   * upstream after rendering empty on the CSRM surface for months.
   */
  const [calcReady, setCalcReady] = useState(calcColumns === undefined);
  useEffect(() => {
    if (!client) return;
    if (calcColumns === undefined || calcColumns.length === 0) {
      setCalcReady(true);
      return;
    }
    let cancelled = false;
    void client
      .setCalcColumns(calcColumns as never)
      .then(() => client.calcDiagnostics())
      .then((diagnostics) => {
        if (cancelled) return;
        for (const entry of diagnostics) {
          // eslint-disable-next-line no-console
          console.warn(`[ssrm-engine] ${entry.colId} (${entry.phase} x${entry.count}): ${entry.message}`);
        }
        (globalThis as Record<string, unknown>).__ssrmCalcDiagnostics = diagnostics;
        setCalcReady(true);
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine] could not install the calculated columns', error);
        if (!cancelled) setCalcReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, calcColumns]);

  const datasource = useMemo(() => {
    if (!client) return null;
    return createAsyncSsrmDatasource(client, {
      onError: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine] block failed', error);
      },
      onBlock: (ms, outcome, request) => {
        const blocks = blocksRef.current;
        if (outcome === 'ok') blocks.served += 1;
        else blocks.failed += 1;
        if (blocks.ms.length < BLOCK_SAMPLE_CAP) blocks.ms.push(ms);
        lastRequestRef.current = request;
      },
    });
  }, [client]);

  const getRowId = useMemo(() => makeSsrmGetRowId(keyField), [keyField]);

  /**
   * The live path: the worker PUSHES what changed, this window applies it.
   *
   * The whole point of the engine reporting a delta. On the Perspective surface
   * a tick had to re-read the viewport because `on_update` does not say which
   * rows moved; here the worker sends the sparse patch it applied and a tick is
   * one transaction of exactly the cells that ticked — no invalidation, no
   * re-request, and therefore no stub rows.
   *
   * Through a pump rather than straight into `applyServerSideTransaction`: it
   * conflates by row id so several frames touching one row are one transaction,
   * and it spends at most `sliceBudgetMs` per flush so a burst becomes latency
   * instead of a dropped frame.
   */
  useEffect(() => {
    if (!client) return;
    const pump = createSsrmRowPump(
      {
        getRowNode: (id) => apiRef.current?.getRowNode(id) ?? null,
        applyServerSideTransaction: (tx) =>
          apiRef.current?.applyServerSideTransaction(tx as never) ?? null,
        isDestroyed: () => apiRef.current?.isDestroyed?.() !== false,
      },
      { keyField, sliceBudgetMs: 4 },
    );
    pumpRef.current = pump;
    const unsubscribe = client.subscribe((delta) => pump.push(delta));
    return () => {
      unsubscribe();
      pump.dispose();
      pumpRef.current = null;
    };
  }, [client]);

  /**
   * Tell the worker what this window can see, so a tick carries only those rows.
   *
   * Reported on a settled scroll and on every model change, and re-sent only
   * when the range or the query shape actually moved — this is an RPC on the
   * same port the block reads use, and the read path is the one thing a push
   * optimisation must not make more expensive.
   */
  useEffect(() => {
    if (!client) return;
    let last = '';
    let disposed = false;

    const report = () => {
      const api = apiRef.current;
      if (disposed || !api || api.isDestroyed?.()) return;

      if (!viewportEnabledRef.current) {
        // Clear it ONCE, then leave the worker sending everything.
        if (last === '') return;
        last = '';
        void client.setViewport(null).catch(() => {});
        return;
      }

      const first = api.getFirstDisplayedRowIndex?.();
      const lastRow = api.getLastDisplayedRowIndex?.();
      const request = lastRequestRef.current;
      if (typeof first !== 'number' || typeof lastRow !== 'number' || first < 0 || !request) return;

      const viewport = {
        // Only the SHAPE. Carrying the block's own `startRow`/`endRow` would
        // put a stale block range on the wire beside the live one.
        request: {
          ...request,
          startRow: 0,
          endRow: 0,
        },
        startRow: Math.max(0, first - VIEWPORT_SLACK_ROWS),
        endRow: lastRow + 1 + VIEWPORT_SLACK_ROWS,
      };
      const signature = JSON.stringify(viewport);
      if (signature === last) return;
      last = signature;
      void client.setViewport(viewport).catch(() => {
        // A viewport that did not land costs this window a narrower push, not
        // its updates: the worker's default is to send everything.
        last = '';
      });
    };

    const timer = setInterval(report, 250);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [client]);

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }} data-testid="ssrm-engine-grid">
      {fault && (
        <div className="p-4 text-sm text-[var(--bn-status-negative,#b91c1c)]">
          The worker-held book did not open: {fault}
        </div>
      )}
      {datasource && client && calcReady && (
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
              /** Conflation and slice counters — how much the push path did. */
              pump: () => pumpRef.current?.stats() ?? null,
              /** Cost of GETTING THE BOOK, apart from booting the app. */
              open: () => openRef.current,
              /**
               * Turn the per-subscriber narrowing off and on.
               *
               * For an A/B on ONE window against ONE feed: comparing a narrowed
               * window with a different un-narrowed window would compare two
               * viewports, two scroll positions and two block caches as well.
               */
              viewportReporting: (on: boolean) => {
                viewportEnabledRef.current = on;
              },
              /** What the WORKER says it holds. The multi-window check. */
              introspect: () => client.introspect(),
              /**
               * What the engine made of the installed expressions.
               *
               * Read back rather than assumed: a REFUSED column is not
               * installed at all, so it renders as a column of blanks, and
               * `console.warn` inside a SharedWorker reaches no console
               * anywhere. An empty array is the good case and a surface should
               * be able to say so out loud.
               */
              calcDiagnostics: () =>
                (globalThis as Record<string, unknown>).__ssrmCalcDiagnostics ?? [],
            };
            // The same object the probes read — see `onSurfaceReady`.
            onSurfaceReady?.(
              (globalThis as Record<string, unknown>)
                .__ssrmEngineGrid as SsrmEngineGridHandle,
            );
          }}
        />
      )}
    </div>
  );
}
