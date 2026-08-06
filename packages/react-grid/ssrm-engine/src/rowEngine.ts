/**
 * The row engine a MarketsGrid surface mounts on `@starui/ssrm-engine`.
 *
 * Peer to `createPerspectiveRowEngine`, and deliberately much smaller. The
 * pieces that file spends most of its length on do not exist here:
 *
 *   - **no per-tick re-read.** Perspective's `on_update` does not say which
 *     rows moved, so a tick there is `refreshServerSide({purge:false})` over
 *     every loaded block plus a per-route cascade. This engine PUSHES the
 *     sparse patch it applied, so a tick is one transaction of exactly the
 *     cells that ticked. Everything built around that re-read — the throttle,
 *     the scroll pause, the route walk — has nothing to do here;
 *   - **no `rowCount` guesswork.** The engine holds the book, so every block
 *     answers with the exact size of its level. The Perspective rule about
 *     omitting `rowCount` (a 0 sets `isLastRowKnown` and caps the store
 *     forever) cannot arise;
 *   - **no View lifecycle.** There is no wasm value to borrow, so nothing here
 *     can be deleted while a read is in flight.
 *
 * What IS here is everything the MarketsGrid platform asks a server-side engine
 * for, and each of those was a separate bug on the Perspective path: set-filter
 * values, a quick search the grid cannot apply itself, status counts AG's own
 * panels cannot produce, a grand total that has to be created one way and
 * updated another, an export that reads the book rather than the block cache,
 * and a cell edit that has to reach the book or be painted over.
 *
 * Free of any AG Grid import, like the rest of this package: the grid is typed
 * structurally, so this is testable with three methods and no grid at all.
 */
import { createAsyncSsrmDatasource } from './asyncDatasource.js';
import { createSsrmRowPump, type SsrmRowPump, type SsrmRowPumpStats } from './rowPump.js';
import type { SsrmDatasourceLike } from './datasource.js';
import type { SsrmCalcColumnDef, SsrmExpressionNode } from './calcAst.js';
import type { SsrmCalcDiagnostic } from './calc.js';
import type { SsrmScalarAggregate } from './engine.js';
import {
  SSRM_GRAND_TOTAL_FLAG,
  SSRM_GRAND_TOTAL_ROW_ID,
  type SsrmFilterModel,
  type SsrmGetRowsRequest,
  type SsrmGetRowsResult,
  type SsrmRow,
} from './types.js';

/**
 * AG's own id for the grand total row, and the flag that marks the row the
 * engine builds as one. Defined in `types.ts` and re-exported here, where every
 * consumer already imports them from.
 */
export { SSRM_GRAND_TOTAL_FLAG, SSRM_GRAND_TOTAL_ROW_ID };

/** One expanded group's route — the ancestor keys, outermost first. */
export type SsrmRefreshRoute = string[];

/** A group node, as much of one as the route walk reads. */
export interface SsrmGroupNodeLike {
  group?: boolean;
  expanded?: boolean;
  level?: number;
  key?: string | null;
  parent?: SsrmGroupNodeLike | null;
}

/** The slice of AG's `GridApi` this engine drives. */
export interface SsrmGridApiLike {
  getRowNode(id: string): { data?: unknown } | null | undefined;
  applyServerSideTransaction(transaction: { update?: unknown[]; remove?: unknown[] }): unknown;
  refreshServerSide(params: { route?: string[]; purge?: boolean }): void;
  /** Illegal while grouping — AG error #28, and SILENT without ValidationModule. */
  setRowCount?(rows: number): void;
  isDestroyed?(): boolean;
  getFirstDisplayedRowIndex?(): number;
  getLastDisplayedRowIndex?(): number;
  /** Read rather than mirrored — see {@link SsrmEngineRowEngine} on the total. */
  getGridOption?(key: string): unknown;
  /**
   * Enumerates the row nodes this window holds — used to find the EXPANDED
   * ROUTES, and for nothing else.
   *
   * Never as the source of a count: it visits the loaded blocks, not the book,
   * and it does not traverse total rows at all. Every figure on this surface
   * comes from the worker.
   */
  forEachNode?(callback: (node: SsrmGroupNodeLike) => void): void;
}

/** What the window's handle on the worker-held book must provide. */
export interface SsrmEngineClientLike {
  readonly size: number;
  getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  grandTotal(request: SsrmGetRowsRequest): Promise<Record<string, unknown>>;
  countFiltered(request: SsrmGetRowsRequest): Promise<number>;
  distinctValues(field: string): Promise<unknown[] | null>;
  setQuickFilter(text: string): Promise<boolean>;
  setCalcColumns(columns: SsrmCalcColumnDef[]): Promise<boolean>;
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]>;
  countMatchingExpression(
    ast: SsrmExpressionNode,
    request?: SsrmGetRowsRequest,
  ): Promise<number | null>;
  aggregateScalar(field: string, aggregate: SsrmScalarAggregate): Promise<number | null>;
  setViewport(
    viewport: {
      request: SsrmGetRowsRequest;
      startRow: number;
      endRow: number;
      /** Absent means yes — see the protocol's `SsrmViewport`. */
      pushRows?: boolean;
    } | null,
  ): Promise<void>;
  applyUpdate(rows: SsrmRow[]): Promise<{ changed: unknown[]; removed: unknown[] }>;
  subscribe(listener: (delta: { rows: SsrmRow[]; removed: unknown[]; size: number }) => void): () => void;
}

/**
 * What a status bar can honestly say here.
 *
 * Every figure comes from the WORKER. AG's own row-count panels render nothing
 * under a server row model and `forEachNode` visits only the ~100 loaded rows,
 * so a panel that counted what this window holds would report a plausible wrong
 * number — which is the failure this whole path keeps producing.
 */
export interface SsrmGridStatus {
  /** Rows in the book, ignoring every filter. */
  bookRows: number | null;
  /**
   * Rows the grid's ROOT LEVEL holds — what AG sizes its store from, and under
   * grouping the number of top-level GROUPS rather than of rows.
   *
   * For "how many rows is the user looking at" use {@link leafRows}. Reading
   * this one on the Perspective path produced "9 of 50,000" over a book grouped
   * into nine asset classes; `engine.countFiltered` exists precisely because it
   * is NOT this number.
   */
  filteredRows: number | null;
  /** Rows of the filtered book ignoring grouping. Null until measured. */
  leafRows: number | null;
  /** True when a filter or the quick search is actually narrowing the book. */
  filtered: boolean;
  /** Applying pushed writes. */
  live: boolean;
  /** Blocks that failed; AG never retries one on its own. */
  failedBlocks: number;
}

/** One committed cell edit, as the grid reports it. */
export interface SsrmCellEdit {
  key: unknown;
  field: string;
  value: unknown;
}

export interface SsrmEngineRowEngineOpts {
  client: SsrmEngineClientLike;
  /** Index column — also labels the grand total row. */
  keyColumn: string;
  /**
   * Ceiling on an export. Above it `readAllRows` answers null rather than a
   * short file: a spreadsheet that stopped early is indistinguishable from a
   * complete one once it is open.
   */
  maxExportRows?: number;
  /**
   * Floor on how often the whole-book counts behind the status bar and the
   * grand total are recomputed.
   *
   * A write clears the engine's index cache, so each of these is a fresh
   * materialise — 1.5-15 ms at 20k rows, in the same worker the block the user
   * is waiting for has to be answered by. A count nobody acts on per tick does
   * not get to compete with that.
   */
  countMinIntervalMs?: number;
  /** Rows of slack either side of the declared viewport. See the surface. */
  viewportSlackRows?: number;
  /**
   * TREE DATA — the hierarchy this window views the book through.
   *
   * Stamped onto every request the datasource sends, because AG sends no
   * `rowGroupCols` in tree mode and the engine needs something to stand in for
   * them. On the request rather than on the engine so two windows can view one
   * worker-held book through different hierarchies; see `types.ts`.
   */
  treeFields?: readonly string[];
  /**
   * Floor on how often the expanded routes are re-read WHILE GROUPING.
   *
   * The push path is off under grouping (see {@link SsrmEngineRowEngine.groupRefreshStats}),
   * so this is the only thing keeping a grouped grid alive, and it re-reads one
   * block per expanded route plus the root. MEASURED on this engine at 50,000
   * rows: see the README. Perspective's equivalent throttles far harder because
   * a root block costs it 1.9-2.5 s; here it is milliseconds, which is the whole
   * reason a route refresh is an acceptable mechanism at all.
   */
  groupRefreshMinIntervalMs?: number;
  /** Block round trips, for a probe or a stats strip. */
  onBlock?(ms: number, outcome: 'ok' | 'fail', request: SsrmGetRowsRequest): void;
  /**
   * Every transaction the PUSH PATH hands AG, as it hands it.
   *
   * The seam a host needs to put the same rows on the platform's shared
   * row-change signal. Without it that signal carries only `full` changes on
   * this surface — MEASURED, 30 signals in 5 s and not one of them a delta —
   * and everything keyed on knowing WHICH cells moved is inert: the
   * conditional-styling timed activations (which is where the flash lives),
   * the alerts delta path, the incremental saved-filter counts.
   *
   * Ungrouped only, necessarily: under grouping this engine pushes no
   * transaction at all, so there is nothing to report and the flash is a cost
   * of the route-refresh mechanism rather than something withheld.
   */
  onTransaction?(transaction: { update?: unknown[]; remove?: unknown[] }): void;
  onError?(error: unknown): void;
}

export interface SsrmEngineRowEngine {
  datasource: SsrmDatasourceLike;
  /** Connect the grid once it exists; pass null to disconnect. */
  setApi(api: SsrmGridApiLike | null): void;
  readonly status: SsrmGridStatus;
  subscribe(listener: (status: SsrmGridStatus) => void): () => void;
  readonly live: boolean;
  setLive(live: boolean): void;
  /** Re-read every level now. For an out-of-band change only. */
  refreshNow(): void;
  /**
   * Rows the whole book matches under an AG filter model — a saved-filter
   * pill's badge.
   *
   * The engine answers every model it can answer for a block, so unlike the
   * Perspective path there is no "cannot be translated exactly" case and this
   * never resolves null for that reason. It IS measured with the quick search
   * applied, because the quick search is engine state rather than part of the
   * request; a pill therefore reads "how many rows this filter would show",
   * which is what a badge beside a search box should mean.
   */
  countMatching(filterModel: SsrmFilterModel | null | undefined): Promise<number | null>;
  /** Every distinct value in a column, for a set filter. Null = no honest list. */
  distinctValues(colId: string): Promise<unknown[] | null>;
  /**
   * Rows of the FILTERED book matching a boolean expression — a conditional-
   * styling rule's "does any row match?", which decides a header badge.
   *
   * Throttled and cached here rather than in the worker: the painter re-asks on
   * every row signal, and on a ticking book that is five times a second per
   * rule for an answer nobody reads that fast. `null` means REFUSED and is not
   * 0 — a caller must paint nothing rather than unlight the header.
   */
  countMatchingExpression(ast: SsrmExpressionNode): Promise<number | null>;
  /**
   * One column's aggregate over the WHOLE book, filter and quick search
   * deliberately dropped. See the engine for the decision and its known cost.
   */
  aggregateScalar(colId: string, aggregate: SsrmScalarAggregate): Promise<number | null>;
  /**
   * The quick search. AG's `quickFilterText` is a client-side-row-model option
   * and does nothing under `serverSide`, so the text has to be handed here.
   * Purges only when the engine says something changed.
   */
  setQuickFilter(text: string): Promise<void>;
  /** Install the calculated columns, as expression ASTs. Purges when they move. */
  setCalcColumns(columns: readonly SsrmCalcColumnDef[]): Promise<void>;
  /** Refusals, runtime failures and named columns the book does not have. */
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]>;
  /**
   * The whole filtered, sorted book — for an export. Null above the ceiling,
   * because a short file reads as a complete one.
   */
  readAllRows(): Promise<Record<string, unknown>[] | null>;
  /**
   * Rows of the book matching a set of field values — MASTER/DETAIL.
   *
   * `CustomSSRMGrid` answers this from a client-side mirror that holds every
   * row; this window holds only the blocks in view, so it has to ask the book.
   *
   * **Deliberately NOT scoped to the grid's filter or its sort.** A master row
   * expands onto the same children whatever else is on screen — filtering the
   * parent grid to EMEA must not silently empty a detail panel, and a detail
   * grid has its own column state and its own ordering. That is the same
   * decision the Perspective surface took, for the same reason.
   */
  readMatchingRows(
    match: Record<string, unknown>,
    limit?: number,
  ): Promise<Record<string, unknown>[]>;
  /** A committed cell edit. Coalesced per row so one keystroke is one write. */
  applyEdit(edit: SsrmCellEdit): void;
  /** Tell the worker what this window can see, so a tick carries only those rows. */
  reportViewport(): void;
  /** Pump counters — how much the push path did. */
  pumpStats(): SsrmRowPumpStats | null;
  /**
   * The GROUPED live path's counters, which are a different mechanism from the
   * pump's and have to be readable separately.
   *
   * `writes` is frames that arrived while grouping — each one a write the pump
   * did NOT see, because under grouping this engine stops pushing transactions
   * and re-reads the expanded routes instead. A `writes` climbing with
   * `refreshes` flat means the throttle is holding; `refreshes` at 0 with
   * `writes` climbing means the refresh path is not running at all.
   */
  groupRefreshStats(): SsrmGroupRefreshStats;
  close(): void;
}

export interface SsrmGroupRefreshStats {
  /** Writes that arrived while grouping — every one of them skipped the pump. */
  writes: number;
  /** Route-refresh passes actually run. */
  refreshes: number;
  /** Expanded routes refreshed, summed over every pass. The root is extra. */
  routes: number;
  /** Milliseconds the last pass spent issuing its refreshes. */
  lastMs: number;
  /**
   * Passes held off because the previous one's blocks were still in flight.
   *
   * A `deferred` that climbs with `refreshes` flat means the pass costs more
   * than its floor allows and the grid is saturated — the number to watch if a
   * deployment opens many routes at once.
   */
  deferred: number;
}

const EMPTY_REQUEST: SsrmGetRowsRequest = {};

/** Nothing in a filter model, or nothing left in it. */
function hasFilter(model: SsrmFilterModel | null | undefined): boolean {
  return !!model && Object.keys(model).length > 0;
}

export function createSsrmEngineRowEngine(
  opts: SsrmEngineRowEngineOpts,
): SsrmEngineRowEngine {
  const { client, keyColumn } = opts;
  const maxExportRows = opts.maxExportRows ?? 200_000;
  const countMinIntervalMs = opts.countMinIntervalMs ?? 500;
  const viewportSlack = opts.viewportSlackRows ?? 50;
  const groupRefreshMs = opts.groupRefreshMinIntervalMs ?? 250;

  let api: SsrmGridApiLike | null = null;
  let closed = false;
  let live = true;
  let pump: SsrmRowPump | null = null;
  let unsubscribeDelta: (() => void) | null = null;

  /**
   * The shape AG is currently pulling with, read off the requests the
   * datasource actually SERVED.
   *
   * Not reconstructed from the grid's column state: the served shape is what
   * the worker's index is keyed on, and a viewport or a count built from a
   * different one names positions in an index nobody is reading.
   */
  let lastRequest: SsrmGetRowsRequest = EMPTY_REQUEST;
  /** The last ROOT request — the one a grand total belongs to. */
  let lastRootRequest: SsrmGetRowsRequest = EMPTY_REQUEST;
  let quickFilterText = '';

  let bookRows: number | null = client.size;
  let filteredRows: number | null = null;
  let leafRows: number | null = null;
  let failedBlocks = 0;

  const listeners = new Set<(status: SsrmGridStatus) => void>();

  function currentStatus(): SsrmGridStatus {
    return {
      bookRows,
      filteredRows,
      leafRows,
      filtered: hasFilter(lastRequest.filterModel) || quickFilterText !== '',
      live,
      failedBlocks,
    };
  }

  function announce(): void {
    if (listeners.size === 0) return;
    const status = currentStatus();
    for (const listener of listeners) listener(status);
  }

  /**
   * True while the grid is showing a TREE OF LEVELS rather than a flat list —
   * by row grouping OR by tree data.
   *
   * **Tree data counts, and leaving it out was a defect with four separate
   * symptoms.** AG sends no `rowGroupCols` at all in tree mode, so a predicate
   * that reads only that field calls a tree "flat", and everything gated on it
   * then does the wrong thing:
   *
   *   1. `setRowCount` — illegal while grouping (AG error #28, SILENT without
   *      ValidationModule) and equally illegal here. MEASURED: it set 50,000 on
   *      a tree store and the grid rendered 50,001 flat rows with no hierarchy
   *      at all, while `treeData` was on and the engine was returning correct
   *      parent rows;
   *   2. the PUSH PATH — a leaf id under a tree is its path, exactly as it is
   *      under grouping, so a pushed patch cannot name one;
   *   3. the viewport's `pushRows` declaration, which follows the push path;
   *   4. `filteredRows`, which under any tree is a count of top-level nodes and
   *      not of rows.
   */
  function grouped(request: SsrmGetRowsRequest): boolean {
    return (
      (request.rowGroupCols?.length ?? 0) > 0 || (request.treeFields?.length ?? 0) > 0
    );
  }

  /**
   * Whole-book questions, coalesced onto one trailing timer.
   *
   * Both of them clear-and-rebuild an index in the worker, and both are asked
   * again by every pushed tick. Running them per tick would put a 1.5-15 ms
   * materialise in front of the block the user is scrolling towards, five times
   * a second, for figures nobody reads that fast.
   */
  let countTimer: ReturnType<typeof setTimeout> | null = null;
  let countPending = false;
  function scheduleWholeBookReads(): void {
    if (closed || countTimer !== null) {
      countPending = countTimer !== null;
      return;
    }
    countTimer = setTimeout(() => {
      countTimer = null;
      const again = countPending;
      countPending = false;
      void wholeBookReads();
      if (again) scheduleWholeBookReads();
    }, countMinIntervalMs);
    (countTimer as unknown as { unref?(): void }).unref?.();
  }

  /**
   * ONE whole-book count per tick, feeding both the status bar and the store.
   *
   * The status bar's `leafRows` and the store's row count are the SAME number —
   * `countFiltered` strips `rowGroupCols`/`groupKeys` itself, so both were
   * issuing an identical RPC and the worker was materialising the index twice
   * for one figure. It is a synchronous engine behind a serialized port, so the
   * second pass sits in front of the block the user is scrolling towards.
   *
   * MEASURED: two passes per tick against one took AG's end-to-end `getRows`
   * from a 2.8-3.0 ms median on the plain control to **6.6-12.2 ms** on the
   * MarketsGrid surface, with a 35-214 ms p90. Asking twice for one number was
   * most of the difference the platform appeared to cost.
   */
  async function wholeBookReads(): Promise<void> {
    if (closed) return;
    await Promise.all([measureLeafRows(), pushGrandTotal()]);
    announce();
  }

  /**
   * `leafRows`, and — while ungrouped — the store's row count with it.
   *
   * `countFiltered` is NOT a grouped level's `rowCount`: that is the number of
   * top-level GROUPS, and reading it in a status bar is what produced "9 of
   * 50,000".
   *
   * Skipped entirely when nothing is listening AND there is no api to size: a
   * grid with no status bar should not pay a whole-book pass for a figure
   * nothing reads.
   */
  async function measureLeafRows(): Promise<void> {
    if (listeners.size === 0 && api === null) return;
    try {
      const next = await client.countFiltered(lastRequest);
      if (closed) return;
      leafRows = next;
      bookRows = client.size;
      syncRowCount(next);
    } catch (error) {
      opts.onError?.(error);
    }
  }

  /**
   * Keep the grand total moving.
   *
   * `grandTotalData` on a block response CREATES that row and does NOT update
   * it — MEASURED on the Perspective path across five refreshes, where five
   * fresh totals left the row showing the first. The documented way to move an
   * existing one is a transaction whose row id is the grand total's, so both
   * paths are needed and they answer different moments.
   *
   * Free when there is no total row: the lookup below is the first thing it
   * does, and a grid without `grandTotalRow` never gets past it.
   */
  async function pushGrandTotal(): Promise<void> {
    if (api === null || closed) return;
    if (!api.getRowNode(SSRM_GRAND_TOTAL_ROW_ID)) return;
    const request = lastRootRequest;
    const total = await grandTotalFor(request);
    if (
      total &&
      api !== null &&
      !closed &&
      request === lastRootRequest &&
      api.getRowNode(SSRM_GRAND_TOTAL_ROW_ID)
    ) {
      api.applyServerSideTransaction({ update: [total] });
    }
  }

  /**
   * Does this grid HAVE a totals row?
   *
   * Asked of the grid rather than mirrored from a prop, so it cannot drift from
   * what is on screen — and asked at all because a grand total is a whole-book
   * materialise and aggregate, awaited before the ROOT block settles.
   *
   * MEASURED on the lab's 20,000 x 126 book, which has no totals row: fetching
   * it anyway took AG's end-to-end `getRows` from a 2.6-3.2 ms median to a
   * **69 ms p90 and a 79 ms max** — a whole-book aggregate on every root block,
   * for a row that does not exist. Before this check the platform looked like it
   * cost the read path an order of magnitude; it does not, and that was the
   * measurement worth taking.
   */
  function wantsGrandTotal(): boolean {
    return Boolean(api?.getGridOption?.('grandTotalRow'));
  }

  async function grandTotalFor(
    request: SsrmGetRowsRequest,
  ): Promise<Record<string, unknown> | null> {
    if (!wantsGrandTotal()) return null;
    try {
      const total = await client.grandTotal(request);
      // The caption goes on the KEY column: it is the one AG never hides, where
      // a grouped column disappears and the auto-group column renders nothing
      // for a total row.
      return { ...total, [keyColumn]: 'GRAND TOTAL', [SSRM_GRAND_TOTAL_FLAG]: true };
    } catch (error) {
      opts.onError?.(error);
      return null;
    }
  }

  /**
   * A row inserted or removed outside every viewport still moves the book, and
   * nothing re-reads a block to tell AG so.
   *
   * **Never while grouping.** `setRowCount` raises AG error #28 whenever a
   * row-group column exists, and without `ValidationModule` registered that
   * error is SILENT — so the guard is the only thing standing between this and
   * a store that stops responding for reasons nothing reports.
   */
  function syncRowCount(rows: number): void {
    if (api === null || closed || grouped(lastRequest)) return;
    if (rows === filteredRows) return;
    filteredRows = rows;
    api.setRowCount?.(rows);
  }

  /**
   * The AG boundary, with the two things a host has to add around it: the
   * served request shape, and the grand total a root block CREATES.
   */
  /**
   * Blocks AG has asked for and not yet been answered.
   *
   * Used by the grouped refresh to defer rather than pile on: MEASURED at
   * 50,000 rows with two levels expanded, one route-refresh pass issues 3
   * blocks that settle in 171 ms, against a 250 ms floor — so a pass and its
   * successor very nearly overlap, and every additional expanded route makes
   * that worse linearly. Re-requesting a range already in flight makes the
   * queue longer and the answer no fresher.
   */
  let blocksInFlight = 0;

  const inner = createAsyncSsrmDatasource(client, {
    ...(opts.onError ? { onError: (error: unknown) => opts.onError?.(error) } : {}),
    onBlock: (ms, outcome, request) => {
      lastRequest = request;
      if ((request.groupKeys?.length ?? 0) === 0) lastRootRequest = request;
      if (outcome === 'fail') failedBlocks += 1;
      opts.onBlock?.(ms, outcome, request);
    },
  });

  const treeFields = opts.treeFields ?? [];

  const datasource: SsrmDatasourceLike = {
    getRows(params) {
      /**
       * The tree hierarchy is stamped on HERE, once, rather than by every
       * caller. AG sends no `rowGroupCols` in tree mode, so without this the
       * engine sees a flat request and answers the leaf level — a tree that
       * renders every row at depth 0 and no parents at all.
       */
      const request: SsrmGetRowsRequest =
        treeFields.length > 0 ? { ...params.request, treeFields } : params.request;
      const isRoot = (request.groupKeys?.length ?? 0) === 0;
      params = { ...params, request };
      // Counted HERE rather than in `onBlock`, which only fires on completion.
      // Decremented in both settle paths below, and the async datasource
      // guarantees exactly one of them runs — which is the rule that makes a
      // counter like this safe rather than a slow leak into a wedged grid.
      blocksInFlight += 1;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        blocksInFlight = Math.max(0, blocksInFlight - 1);
      };
      inner.getRows({
        ...params,
        fail: () => {
          done();
          params.fail();
        },
        success: (result) => {
          done();
          // The root level of an UNGROUPED request is the only level whose row
          // count is a count of rows; grouped, it is the number of top-level
          // groups, and calling that "rows" is what produced "9 of 50,000".
          if (isRoot && !grouped(request)) filteredRows = result.rowCount;
          if (!isRoot || closed || !wantsGrandTotal()) {
            params.success(result);
            announce();
            return;
          }
          // A missing total must never cost the block — rule 1. Either way the
          // rows settle exactly once.
          void grandTotalFor(request).then(
            (total) => {
              params.success(total ? { ...result, grandTotalData: total } : result);
              announce();
              scheduleWholeBookReads();
            },
            () => {
              params.success(result);
              announce();
            },
          );
        },
      });
    },
  };

  /**
   * ══ UNDER GROUPING THE PUSH PATH IS OFF, AND THE ROUTES ARE RE-READ ══
   *
   * MEASURED (`scripts/groupedTickProbe.mjs`, 50,000 rows, two group levels,
   * 25 s): the pump received 34,447 rows, applied 0 and DROPPED 34,447, group
   * and subgroup aggregates never moved, and one leaf of 101 moved — by a block
   * re-read, not by the push.
   *
   * The cause is not a bug in the pump and cannot be fixed inside it. A row id
   * under grouping is the PATH (`Alpha/Energy/POS-123`, AG's own documented
   * form — see `rowId.ts`), and a pushed patch is SPARSE: the cells that moved
   * plus the key, with no group columns in it. The path is not reconstructible
   * from the frame, so the pump cannot name the node even in principle.
   *
   * And even if it could, it would fix half the problem: a leaf transaction does
   * not move the GROUP row above it. Under a server row model an aggregate is
   * whatever the last block for that level said, so the only thing that moves it
   * is re-reading that level.
   *
   * So: one mechanism for both. Every EXPANDED ROUTE is refreshed, on a
   * throttle. Four AG rules bound it and all four are load-bearing:
   *
   *   - **`refreshServerSide` does NOT cascade into child stores.** Refreshing
   *     the root alone leaves the group rows ticking and the book rows under
   *     them frozen — an aggregate that looks live at the top and is stale one
   *     row down, which is worse than obviously not updating. Hence
   *     {@link expandedRoutes};
   *   - **`forEachNode` does not traverse total rows**, and is used here for
   *     ROUTE ENUMERATION only. Nothing counts with it;
   *   - **`setRowCount` is illegal while grouping** (AG error #28, SILENT
   *     without ValidationModule) — {@link syncRowCount} already refuses;
   *   - **`grandTotalData` CREATES the grand total and does not UPDATE it**, so
   *     {@link pushGrandTotal}'s transaction stays exactly as it was. That path
   *     already works under grouping, because it addresses AG's own row id.
   */
  const groupStats: SsrmGroupRefreshStats = { writes: 0, refreshes: 0, routes: 0, lastMs: 0, deferred: 0 };
  let groupRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let groupRefreshPending = false;

  /** Every expanded group's route, outermost key first. */
  function expandedRoutes(): SsrmRefreshRoute[] {
    const routes: SsrmRefreshRoute[] = [];
    api?.forEachNode?.((node) => {
      if (node.group !== true || node.expanded !== true) return;
      const route: string[] = [];
      let walk: SsrmGroupNodeLike | null | undefined = node;
      while (walk && (walk.level ?? -1) >= 0) {
        if (typeof walk.key === 'string') route.unshift(walk.key);
        walk = walk.parent;
      }
      routes.push(route);
    });
    return routes;
  }

  /**
   * Re-read the root level and every expanded route.
   *
   * `purge: false` throughout: a purge discards the store, and with it the
   * user's scroll position, the expanded tree and the selection — which is worse
   * than the stale aggregate it would fix.
   */
  function refreshExpandedRoutes(): void {
    if (api === null || closed) return;
    const started = Date.now();
    api.refreshServerSide({ purge: false });
    const routes = expandedRoutes();
    for (const route of routes) api.refreshServerSide({ route, purge: false });
    groupStats.refreshes += 1;
    groupStats.routes += routes.length;
    groupStats.lastMs = Date.now() - started;
  }

  /**
   * How long a pass may be held off by blocks still in flight before it goes
   * anyway.
   *
   * Bounded for the same reason the Perspective path bounds its own: a grid
   * busy enough never to be idle would otherwise stop refreshing altogether,
   * which is the failure this whole mechanism exists to remove.
   */
  const GROUP_REFRESH_DEFER_MAX_MS = 2_000;
  let groupRefreshDeferringSince = 0;

  function scheduleGroupRefresh(): void {
    if (closed || api === null) return;
    if (groupRefreshTimer !== null) {
      groupRefreshPending = true;
      return;
    }
    groupRefreshTimer = setTimeout(() => {
      groupRefreshTimer = null;
      const again = groupRefreshPending;
      groupRefreshPending = false;
      // DEFER while the previous pass is still being answered. MEASURED at
      // 50,000 rows with two levels expanded: one pass issues 3 blocks that
      // settle in 171 ms against a 250 ms floor, so the two very nearly
      // overlap — and each additional expanded route adds a block. Piling a
      // second pass on top makes the queue longer and the answer no fresher.
      if (blocksInFlight > 0 && Date.now() - groupRefreshDeferringSince < GROUP_REFRESH_DEFER_MAX_MS) {
        groupStats.deferred += 1;
        groupRefreshPending = true;
        scheduleGroupRefresh();
        return;
      }
      groupRefreshDeferringSince = Date.now();
      if (live) refreshExpandedRoutes();
      if (again) scheduleGroupRefresh();
    }, groupRefreshMs);
    (groupRefreshTimer as unknown as { unref?(): void }).unref?.();
  }

  /**
   * The live path: the worker PUSHES what changed, this window applies it.
   *
   * Through a pump rather than straight into `applyServerSideTransaction` — it
   * conflates by row id so several frames touching one row are one transaction,
   * and spends at most `sliceBudgetMs` per flush so a burst becomes latency
   * instead of a dropped frame.
   *
   * Grouped, the frame carries no rows at all: the surface declares
   * `pushRows: false` on its viewport, so the worker stops putting patches on
   * the wire for this port and sends the size mirror alone. That is the decision
   * taken over "drop them on arrival" — 34,447 rows were being structured-cloned
   * across the port per 25 s to be discarded, and the client can say so once
   * instead of paying for it per tick.
   */
  function attachPump(): void {
    detachPump();
    pump = createSsrmRowPump(
      {
        getRowNode: (id) => api?.getRowNode(id) ?? null,
        applyServerSideTransaction: (tx) => {
          const result = api?.applyServerSideTransaction(tx) ?? null;
          // Reported AFTER AG has it, so a host publishing this to the shared
          // row signal cannot describe a transaction that was refused.
          opts.onTransaction?.(tx);
          return result;
        },
        isDestroyed: () => api === null || api.isDestroyed?.() === true,
      },
      { keyField: keyColumn, sliceBudgetMs: 4 },
    );
    unsubscribeDelta = client.subscribe((delta) => {
      if (!live) return;
      bookRows = delta.size;
      if (grouped(lastRequest)) {
        groupStats.writes += 1;
        scheduleGroupRefresh();
      } else {
        pump?.push(delta);
      }
      // A write moves the counts and the total, and neither is carried by the
      // patch. Coalesced rather than asked per frame.
      scheduleWholeBookReads();
    });
  }

  function detachPump(): void {
    unsubscribeDelta?.();
    unsubscribeDelta = null;
    pump?.dispose();
    pump = null;
  }

  /**
   * Committed edits, coalesced per row.
   *
   * A cell editor writes one field at a time and AG commits each on blur, so
   * three edits to one row would otherwise be three worker round trips and
   * three broadcasts to every peer window. The flush is a microtask: a single
   * edit still lands in the same turn the user finished it.
   */
  const pendingEdits = new Map<unknown, SsrmRow>();
  let editFlushScheduled = false;
  function flushEdits(): void {
    editFlushScheduled = false;
    if (closed || pendingEdits.size === 0) return;
    const rows = [...pendingEdits.values()];
    pendingEdits.clear();
    void client.applyUpdate(rows).catch((error: unknown) => opts.onError?.(error));
  }

  /** Viewport reporting — see `setViewport`'s contract on the client. */
  let lastViewport = '';
  function reportViewport(): void {
    if (api === null || closed || api.isDestroyed?.() === true) return;
    const first = api.getFirstDisplayedRowIndex?.();
    const last = api.getLastDisplayedRowIndex?.();
    if (typeof first !== 'number' || typeof last !== 'number' || first < 0) return;
    const viewport = {
      // Only the SHAPE. Carrying the block's own `startRow`/`endRow` would put
      // a stale block range on the wire beside the live one.
      request: { ...lastRequest, startRow: 0, endRow: 0 },
      startRow: Math.max(0, first - viewportSlack),
      endRow: last + 1 + viewportSlack,
      // Grouped, this window applies no pushed row at all — see `attachPump`.
      // Declaring it stops the worker cloning patches across the port for a
      // consumer that has none, while the size mirror and the write signal keep
      // arriving.
      ...(grouped(lastRequest) ? { pushRows: false } : {}),
    };
    const signature = JSON.stringify(viewport);
    if (signature === lastViewport) return;
    lastViewport = signature;
    void client.setViewport(viewport).catch(() => {
      // A viewport that did not land costs this window a narrower push, not its
      // updates: the worker's default is to send everything.
      lastViewport = '';
    });
  }

  function purge(): void {
    if (api === null || closed) return;
    api.refreshServerSide({ purge: true });
  }

  /**
   * Whole-book style-rule answers, cached per question and floored in time.
   *
   * `headerPainter` re-asks on every row signal and every filter change, which
   * on a ticking book is several times a second per rule — and each answer is a
   * pass over the filtered index evaluating a compiled expression, in the same
   * worker the block the user is scrolling towards has to come out of. The floor
   * is the same one the status counts use, for the same reason.
   *
   * Bounded rather than unbounded: the key carries the filter model, so a user
   * clicking through saved filters would otherwise accumulate an entry per
   * filter per rule for the life of the grid.
   */
  const RULE_CACHE_MAX = 64;
  const ruleCache = new Map<string, { at: number; value: Promise<number | null> }>();
  function ruleAnswer(key: string, ask: () => Promise<number | null>): Promise<number | null> {
    const at = Date.now();
    const held = ruleCache.get(key);
    if (held !== undefined && at - held.at < countMinIntervalMs) return held.value;
    const value = ask().catch((error: unknown) => {
      opts.onError?.(error);
      return null;
    });
    if (ruleCache.size >= RULE_CACHE_MAX) ruleCache.clear();
    ruleCache.set(key, { at, value });
    return value;
  }

  return {
    datasource,

    setApi(next) {
      api = next;
      if (next === null) {
        detachPump();
        return;
      }
      attachPump();
      announce();
    },

    get status() {
      return currentStatus();
    },

    subscribe(listener) {
      listeners.add(listener);
      // Measured on first interest rather than at construction: a grid with no
      // status bar should not pay for a figure nothing reads.
      void wholeBookReads();
      listener(currentStatus());
      return () => {
        listeners.delete(listener);
      };
    },

    get live() {
      return live;
    },

    setLive(next) {
      if (next === live) return;
      live = next;
      announce();
    },

    refreshNow() {
      // Every level, not just the root — `refreshServerSide` does not cascade,
      // and an out-of-band change moves a group's aggregate as readily as a
      // leaf's cell. Ungrouped there are no expanded routes and this is the
      // single root refresh it always was.
      refreshExpandedRoutes();
      scheduleWholeBookReads();
    },

    async countMatching(filterModel) {
      try {
        return await client.countFiltered(
          hasFilter(filterModel) ? { filterModel: filterModel as SsrmFilterModel } : {},
        );
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    async distinctValues(colId) {
      try {
        return await client.distinctValues(colId);
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    countMatchingExpression(ast) {
      // Cached on the AST **and the filter model**: the same rule under a
      // different filter is a different question, and the count is the one half
      // of this seam that follows the filter.
      const key = `${JSON.stringify(ast)} ${JSON.stringify(lastRequest.filterModel ?? null)} ${quickFilterText}`;
      return ruleAnswer(key, () =>
        client.countMatchingExpression(
          ast,
          lastRequest.filterModel ? { filterModel: lastRequest.filterModel } : {},
        ),
      );
    },

    aggregateScalar(field, aggregate) {
      // No filter in the key, because there is none in the question.
      return ruleAnswer(`agg ${field} ${aggregate}`, () =>
        client.aggregateScalar(field, aggregate),
      );
    },

    async setQuickFilter(text) {
      const next = (text ?? '').trim();
      try {
        // The ENGINE decides whether anything changed, and a caller only purges
        // when it did — a purge that was not needed re-reads every loaded block
        // and, since a purge fires `modelUpdated`, the bridge that called this
        // would hear its own echo.
        const changed = await client.setQuickFilter(next);
        quickFilterText = next;
        if (!changed) return;
        purge();
        scheduleWholeBookReads();
      } catch (error) {
        opts.onError?.(error);
      }
    },

    async setCalcColumns(columns) {
      try {
        const changed = await client.setCalcColumns([...columns]);
        if (!changed) return;
        // An index materialised under the previous expressions is a permutation
        // of the book by values that no longer exist, and AG's request carries
        // no calculated columns at all — so nothing else would invalidate it.
        purge();
        scheduleWholeBookReads();
      } catch (error) {
        opts.onError?.(error);
      }
    },

    calcDiagnostics() {
      return client.calcDiagnostics().catch((error: unknown) => {
        opts.onError?.(error);
        return [];
      });
    },

    async readAllRows() {
      // Flat, filtered and sorted: an export is the rows the user is looking at
      // in the order they are looking at them, not the group tree.
      const flat: SsrmGetRowsRequest = {
        ...(lastRequest.filterModel ? { filterModel: lastRequest.filterModel } : {}),
        ...(lastRequest.sortModel ? { sortModel: lastRequest.sortModel } : {}),
      };
      try {
        const rows = await client.countFiltered(flat);
        // REFUSE rather than truncate. A spreadsheet that stopped early is
        // indistinguishable from a complete one once it is open, and there is
        // no "there is more" affordance in a file.
        if (rows > maxExportRows) return null;
        const result = await client.getRows({ ...flat, startRow: 0, endRow: rows });
        return result.rowData;
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },

    async readMatchingRows(match, limit = 500) {
      const fields = Object.entries(match);
      // An empty match would select the WHOLE BOOK and hand it to a detail
      // grid. Answer nothing instead: a master row with no match fields has no
      // children by definition, and 50,000 rows in a detail panel is not a
      // degraded answer, it is a hung tab.
      if (fields.length === 0) return [];
      const filterModel: SsrmFilterModel = {};
      for (const [field, value] of fields) {
        filterModel[field] =
          value === null || value === undefined
            ? { type: 'blank' }
            : typeof value === 'number'
              ? { filterType: 'number', type: 'equals', filter: value }
              : { filterType: 'text', type: 'equals', filter: String(value) };
      }
      try {
        const result = await client.getRows({ filterModel, startRow: 0, endRow: limit });
        return result.rowData;
      } catch (error) {
        opts.onError?.(error);
        // AG's detail callback must be called exactly once, and a rejection
        // that reached it as nothing would spin the panel forever. The empty
        // list is the honest answer here and the error is reported separately.
        return [];
      }
    },

    applyEdit(edit) {
      if (closed || edit.key === undefined || edit.key === null) return;
      const held = pendingEdits.get(edit.key);
      if (held === undefined) {
        pendingEdits.set(edit.key, { [keyColumn]: edit.key, [edit.field]: edit.value });
      } else {
        held[edit.field] = edit.value;
      }
      if (editFlushScheduled) return;
      editFlushScheduled = true;
      queueMicrotask(flushEdits);
    },

    reportViewport,

    pumpStats: () => pump?.stats() ?? null,

    groupRefreshStats: () => ({ ...groupStats }),

    close() {
      closed = true;
      detachPump();
      if (countTimer !== null) clearTimeout(countTimer);
      countTimer = null;
      if (groupRefreshTimer !== null) clearTimeout(groupRefreshTimer);
      groupRefreshTimer = null;
      listeners.clear();
      pendingEdits.clear();
      ruleCache.clear();
      api = null;
    },
  };
}
