/**
 * createSsrmPullDatasource — AG Grid server-side datasource over the
 * SSRM provider's hosted Perspective table (the pull plane).
 *
 * Contracts (docs/SSRM_PROVIDER_V2_DESIGN.md, P2 + P4a):
 *
 * • **rowCount comes from DatasetState, never inferred.** While
 *   `seeding` blocks are delivered WITHOUT a final `rowCount` (and the
 *   store is immediately re-opened via `setRowCount(…, false)` because
 *   AG's lazy cache finalizes when a block under-fills); `live`/`empty`
 *   loads finalize with the view's exact count; `empty` is an honest 0;
 *   `error` fails the load.
 * • **Generation fencing.** Every request captures the generation at
 *   start; a response whose generation is stale is DROPPED (neither
 *   success nor fail) — the consumer remounts the grid on the new
 *   generation, so the dangling load dies with the old grid instance.
 * • **Viewport block LRU + serve-then-refresh** (design fact #6):
 *   cache hits answer instantly (no loading stubs on fling scroll),
 *   then the fresh read replaces the block in place
 *   (`applyServerSideRowData` — index-addressed, handles reorders,
 *   never purges).
 * • **Ticks never purge.** ONE live `on_update` subscription (kept on a
 *   root-route view — it observes the whole filtered set) triggers a
 *   throttled trailing refresh that refetches EVERY cached block of the
 *   current generation — flat blocks, group-level blocks, expanded-leaf
 *   blocks — and patches changed rows via
 *   `applyServerSideTransactionAsync({ route, update })`: leaf rows
 *   keyed by the provider's `keyColumn`, group rows keyed by their
 *   stamped path id (`GROUP_ID_FIELD`). The grid MUST set `getRowId`
 *   via `createSsrmRowIdGetter(keyColumn)`. Update transactions cannot
 *   re-order rows — ordering drift under an active sort between user
 *   refreshes is accepted (TODO(P4b): periodic ordered block refresh).
 * • **Row grouping (P4a).** Group-level requests are served from a
 *   Perspective `group_by` view on the request's next level (ancestor
 *   equality filters pin the route); group rows carry the group label,
 *   the requested `valueCols` aggregates, a leaf child count
 *   (`CHILD_COUNT_FIELD` → AG `getChildCount`) and their stable path id.
 * • **Grand total (P4a).** Root-level loads answering AG's
 *   `needsGrandTotal` hint (gridOption `grandTotalRow` — AG 36's native
 *   SSRM grand total; chosen over a hand-rolled pinned row because the
 *   grid owns the row's id `GRAND_TOTAL_ROW_ID` and accepts server data
 *   via `LoadSuccessParams.grandTotalData`) get a single-group rollup
 *   read over the SAME filtered set; ticks keep it live via
 *   `rowNode.updateData` on the grand-total node (the row lives outside
 *   every store, so transactions cannot reach it).
 * • **Quick filter (P4a; hardened for perf + correctness).**
 *   `setQuickFilter(text)` folds a case-insensitive multi-token match
 *   across `quickFilterColumns` into every plan (a boolean expression
 *   column, evaluated ENGINE-side — Perspective's own filter mechanism
 *   for multi-column OR, which its view-global `filter_op` cannot
 *   express as native clauses). Calls are DEBOUNCED
 *   (`quickFilterDebounceMs`, default 150ms trailing) — per-keystroke
 *   application built one full Perspective view per key. The settled
 *   change refreshes SOFT on flat stores (rows morph in place, no stub
 *   blank; `setRowCount` in finishLoad/refreshBlock enforces the new
 *   count — a soft refresh alone never resizes AG's lazy store) and
 *   PURGES on grouped/tree stores (membership changes structurally;
 *   `setRowCount` is forbidden under grouping, AG #28).
 * • **Tree data (P4b-2).** `treePathFields` synthesizes a serverSide
 *   tree from categorical fields — tree levels are served by the SAME
 *   group-level plans as row grouping (see `buildQueryPlan`), leaf
 *   routes by ancestor-filtered leaf reads; the grid wires AG 36's
 *   tree contract via `isSsrmServerSideGroup` /
 *   `getSsrmServerSideGroupKey` (`groupRows.ts`).
 * • **Calc columns (P4b-2).** `calcExpressions` attach to EVERY view
 *   built here (leaf, group-level, rollup, distinct-values, queryAll)
 *   so calc columns sort/filter/aggregate/export like real columns.
 * • **Wide-book delta gate (P4b-2, design fact #5).** The tick sweep
 *   is width-gated (`sweepGate.ts`): at/above `wideColumnThreshold`
 *   columns the throttle degrades to `sweepThrottleWideMs`. EVERY
 *   width's sweep is MRU-gated (`maxSweepBlocks` — wide 4, narrow 6):
 *   the block LRU's recency order is viewport order, so the sweep
 *   refetches ≈ the painted blocks; off-screen blocks catch up via
 *   serve-then-refresh cache hits when scrolled back.
 * • **Interactive-perf hardening (2026-07).**
 *   – *Plan-epoch fence*: the epoch bumps when the effective query
 *     shape changes (quick-filter apply; root filter/sort fingerprint
 *     change on a root load); every async read captures it and stale
 *     results are dropped everywhere they could touch the grid or the
 *     cache — in-flight old-shape reads can never repaint over the
 *     current shape (the transient-wrong-rows race). A root load whose
 *     shape went stale mid-read re-serves against the current shape.
 *   – *Scroll-aware sweep deferral*: the consumer wires AG's
 *     `onBodyScroll` → `datasource.onScroll()`; sweeps wait out the
 *     scroll (+`scrollSettleMs`) and any in-flight cold miss, then run
 *     ONE coalesced sweep on settle (idle ticks are never starved).
 *   – *Neighbor prefetch* (design fact #6): a resolved cold miss on a
 *     flat leaf plan warms its adjacent blocks into the BlockCache
 *     (cache-only) so directional scrolling stays a cache hit.
 */

import { GRAND_TOTAL_ROW_ID } from 'ag-grid-community';
import type {
  GridApi,
  IServerSideDatasource,
  IServerSideGetRowsParams,
  IServerSideGetRowsRequest,
  LoadSuccessParams,
} from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { BlockCache } from './BlockCache.js';
import {
  buildQueryPlan,
  buildRollupPlan,
  type QueryPlan,
  type QueryPlanOpts,
  type RollupPlan,
} from './buildQueryPlan.js';
import { GROUP_ID_FIELD, toGroupRowData } from './groupRows.js';
import {
  DEFAULT_SWEEP_THROTTLE_WIDE_MS,
  DEFAULT_WIDE_COLUMN_THRESHOLD,
  resolveSweepGate,
} from './sweepGate.js';
import { ViewCache } from './ViewCache.js';
import type { PullDatasourceConnection, PullView } from './types.js';

export interface SsrmPullDatasourceOpts {
  connection: PullDatasourceConnection;
  /**
   * Row identity — the provider config's `keyColumn`. The consuming
   * grid MUST set `getRowId: createSsrmRowIdGetter(keyColumn)` (tick
   * patches are keyed update transactions; group rows use path ids).
   */
  keyColumn: string;
  /** Columns to read per block; omit for every table column. */
  columns?: string[];
  /** String columns the quick filter matches against. */
  quickFilterColumns?: string[];
  /**
   * Trailing debounce for `setQuickFilter` so per-keystroke input
   * collapses into ONE view build + ONE store refresh. `0` applies
   * synchronously (tests / programmatic callers). Default 150ms.
   *
   * DO NOT remove this to make the filter "feel quicker" — it is the
   * only thing standing between typing and multi-second stalls. Every
   * distinct term is a whole new Perspective view, and the build is the
   * entire cost. Measured, seven keystrokes with no debounce:
   * 613ms @ 20k x 12 cols, 2.9s @ 100k x 34, 5.9s @ 100k x 158.
   * Debounced, the user pays ONE build (116ms / 359ms / 750ms) and the
   * pre-warm in `setQuickFilter` overlaps most of it with AG's refresh.
   */
  quickFilterDebounceMs?: number;
  /**
   * Calc/expression columns (name → Perspective expression over real
   * columns), attached to every view — the config's `calcExpressions`.
   */
  calcExpressions?: Record<string, string>;
  /**
   * Server-side TREE data: ordered categorical fields synthesizing the
   * hierarchy — the config's `treePathFields`. The grid must set
   * `treeData: true` + `isServerSideGroup`/`getServerSideGroupKey`
   * (see `groupRows.ts`). Mutually exclusive with row grouping.
   */
  treePathFields?: string[];
  /**
   * Weighted-mean sources: value field → WEIGHT field, for columns the
   * grid aggregates with `aggFunc: 'wavg'` (OAS by DV01, WAL by
   * notional). AG's `valueCols` has no weight slot, so it comes from
   * here; Perspective serves it natively as
   * `['weighted mean', [weightField]]`. A `wavg` column with no entry is
   * reported as unsupported, never downgraded to a plain average.
   */
  weightedAggregates?: Record<string, string>;
  /** Live-view LRU capacity. Default 8. */
  maxViews?: number;
  /**
   * Viewport block LRU capacity. Default 32 — sized ABOVE the grid's
   * `maxBlocksInCache` so AG evicting a block never implies the
   * datasource lost it too (an AG re-request after eviction should be
   * a serve-then-refresh cache hit, not a cold stub read).
   */
  maxBlocks?: number;
  /** Tick→refetch trailing throttle. Default 250ms. */
  tickRefreshMs?: number;
  /**
   * Scroll settle window (ms): after the last `onScroll()` signal the
   * tick sweep stays deferred this long (coalesced to ONE sweep on
   * settle) so user-facing block reads own the worker. Default 300.
   */
  scrollSettleMs?: number;
  /**
   * Wide-book delta gate (design fact #5): column count at/above which
   * tick sweeps degrade to `sweepThrottleWideMs` + visible-blocks-only.
   * Default 80.
   */
  wideColumnThreshold?: number;
  /** Degraded tick sweep throttle for wide books. Default 1000ms. */
  sweepThrottleWideMs?: number;
  /** Seeding rowCount growth trailing throttle. Default 200ms. */
  seedCountRefreshMs?: number;
  /** Block span when the grid omits `endRow`. Default 100. */
  defaultBlockSize?: number;
  warn?: (message: string) => void;
}

export interface QueryAllOpts {
  /** Rows per windowed read (bounded chunks). Default 10_000. */
  chunkSize?: number;
  /** Columns to read; defaults to the datasource's configured columns. */
  columns?: string[];
  /**
   * Streaming consumer — called once per chunk, in order. When given,
   * the resolved `rows` array is EMPTY (bounded memory: only one chunk
   * is ever held here).
   */
  onChunk?: (
    rows: Record<string, unknown>[],
    info: { startRow: number; total: number },
  ) => void;
}

export interface QueryAllResult {
  /** Every filtered+sorted leaf row (empty when `onChunk` streams them). */
  rows: Record<string, unknown>[];
  /** Exact filtered row count of the view at read time. */
  total: number;
  /** THE generation the read was fenced against. */
  generation: number;
}

/** Internal read/paint counters — perf probes + unit-test assertions. */
export interface SsrmPullDatasourceStats {
  /** Tick sweeps that actually ran (past the destroyed/gen guards). */
  sweepRuns: number;
  /** Block refetches issued by tick sweeps. */
  sweepBlockReads: number;
  /** Cold `getRows` block reads (cache miss). */
  missReads: number;
  /** Serve-then-refresh background block reads (cache hit). */
  refreshReads: number;
  /** Neighbor blocks prefetched after a cold miss. */
  prefetchReads: number;
  /** Async reads re-planned because the generation/query shape moved. */
  droppedStale: number;
  /** Sweep cycles deferred because the user was scrolling / a miss was in flight. */
  sweepDeferrals: number;
  /** `getRows` calls that exhausted their re-plan attempts and answered stale. */
  serveExhausted: number;
  /**
   * Last flat-root total delivered to the grid — i.e. the size of the
   * CURRENT server-side filtered set, not of the loaded blocks. `null`
   * before the first root load, or while grouping (the root then holds
   * group rows, whose count is not the leaf count). Drives the status
   * bar's "Rows: x of y".
   */
  rootRowCount: number | null;
}

export interface SsrmPullDatasource extends IServerSideDatasource {
  /**
   * Quick filter: matches every whitespace-separated token
   * case-insensitively against `quickFilterColumns`; null/empty clears.
   * Debounced (`quickFilterDebounceMs`). The settled change refreshes
   * SOFT on flat stores (in-place repaint + `setRowCount` keeps the
   * count authoritative) and purges on grouped/tree stores (AG #28).
   */
  setQuickFilter(text: string | null): void;
  /**
   * Distinct values of `field` over the WHOLE table (unfiltered — AG
   * set-filter convention), via a transient Perspective group_by read.
   * May include `null`.
   */
  getDistinctValues(field: string): Promise<unknown[]>;
  /**
   * P4b — the ENTIRE current filtered+sorted set (leaf rows; grouping
   * stripped, filters/sort/quick filter kept), read in bounded windowed
   * chunks over a TRANSIENT Perspective view. This is the data plane
   * for full-set export and charting — AG's own SSRM export/charts see
   * only loaded blocks. Rejects when the generation changes mid-read.
   */
  queryAll(opts?: QueryAllOpts): Promise<QueryAllResult>;
  /**
   * Scroll signal from the consuming grid (wire AG's `onBodyScroll`).
   * While scrolling (and for a short settle window) tick sweeps are
   * DEFERRED — user-facing block reads keep the worker to themselves;
   * one coalesced sweep runs on settle so ticks are never starved.
   */
  onScroll(): void;
  /** Live counters (monotonic) — perf probes and tests. */
  getStats(): SsrmPullDatasourceStats;
  destroy(): void;
}

interface TickSubscription {
  key: string;
  view: PullView;
  id: number | null;
}

/**
 * How many times one `getRows` will re-plan when the query shape changes
 * mid-read before it gives up and answers with what it has. Bounded so a
 * pathological shape-churn loop cannot spin forever.
 */
const MAX_SERVE_ATTEMPTS = 4;

/**
 * Blocks per GROUP LEVEL that always join the tick sweep, on top of the
 * global MRU window — and the total across all levels.
 *
 * Group rows carry the aggregates the user is watching, there is
 * typically ONE block per expanded level, and every level is on screen
 * at once. Leaf blocks are the numerous ones the MRU window exists to
 * bound. Reserving only the ROOT level fixed the top of the tree and
 * left `Region > Book > Trader` with a dead middle: scrolling leaves
 * inside an expanded trader evicted the Book-level block.
 */
const GROUP_SWEEP_BLOCKS_PER_LEVEL = 2;
const GROUP_SWEEP_RESERVE_TOTAL = 8;

/**
 * Deep-copy an AG request. `IServerSideGetRowsRequest` handed to the
 * datasource is a live reference into the grid's ONE mutable
 * `ssrmParams` object, which AG's sort/filter listeners rewrite in
 * place. Anything we retain past the call must be a copy, or we corrupt
 * the `oldSortModel` AG diffs against on the next sort (group levels
 * then compute an empty `changedColumns` and skip the refresh entirely).
 */
function cloneRequest(request: IServerSideGetRowsRequest): IServerSideGetRowsRequest {
  // structuredClone (not JSON) so Date values inside date filter models
  // survive as Dates.
  try {
    return structuredClone(request);
  } catch {
    return JSON.parse(JSON.stringify(request)) as IServerSideGetRowsRequest;
  }
}

export function createSsrmPullDatasource(opts: SsrmPullDatasourceOpts): SsrmPullDatasource {
  const { connection, keyColumn } = opts;
  const defaultBlockSize = opts.defaultBlockSize ?? 100;
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  const blockCache = new BlockCache(opts.maxBlocks ?? 32);
  const viewCache = new ViewCache({
    maxViews: opts.maxViews ?? 4,
    onRetire: (_key, view) => {
      if (tickSub?.view === view) tickSub = null; // deletion kills its callbacks
    },
  });

  const stats: SsrmPullDatasourceStats = {
    sweepRuns: 0,
    sweepBlockReads: 0,
    missReads: 0,
    refreshReads: 0,
    prefetchReads: 0,
    droppedStale: 0,
    sweepDeferrals: 0,
    serveExhausted: 0,
    rootRowCount: null,
  };
  let lastScrollAt = 0;
  /** In-flight cold `getRows` reads — sweeps yield while any is pending. */
  let pendingMissReads = 0;
  /** Coalesced deferred-sweep retry (one at a time). */
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const scrollSettleMs = opts.scrollSettleMs ?? 300;
  /**
   * Plan epoch — bumped whenever the effective QUERY SHAPE changes
   * (quick-filter apply; root filter/sort fingerprint change observed
   * on a root load). Every async block read captures the epoch at
   * start; results from an older epoch are DROPPED (cache writes,
   * `applyServerSideRowData`, transactions and `setRowCount` are all
   * fenced) — an in-flight read for a superseded shape can never paint
   * over the current one (the transient-wrong-rows race).
   */
  let planEpoch = 0;
  /** Last flat-root total delivered — the shrink-redraw trigger. */
  let lastRootTotal: number | null = null;

  let api: GridApi | null = null;
  let generation = connection.state?.generation ?? 0;
  let tickSub: TickSubscription | null = null;
  let destroyed = false;
  let quickFilter: string | undefined;
  /** setQuickFilter debounce: the value awaiting apply + its timer. */
  let pendingQuickFilter: string | undefined;
  let quickFilterTimer: ReturnType<typeof setTimeout> | null = null;
  /** Plans with (potentially) cached blocks — the tick-refresh sweep set. */
  const planByKey = new Map<string, QueryPlan>();
  /** The most recent root-route plan — owns the root store's rowCount. */
  let rootPlan: QueryPlan | null = null;
  /** The most recent root-route AG request — queryAll rebuilds a FLAT plan from it. */
  let lastRootRequest: IServerSideGetRowsParams['request'] | null = null;
  /** Active grand-total rollup (null until AG asks via needsGrandTotal). */
  let rollup: RollupPlan | null = null;
  const warnedPlans = new Set<string>();

  const planOpts = (): QueryPlanOpts => ({
    keyColumn,
    ...(opts.columns ? { columns: opts.columns } : {}),
    ...(quickFilter ? { quickFilter } : {}),
    ...(opts.quickFilterColumns ? { quickFilterColumns: opts.quickFilterColumns } : {}),
    ...(opts.calcExpressions ? { calcExpressions: opts.calcExpressions } : {}),
    ...(opts.treePathFields ? { treePathFields: opts.treePathFields } : {}),
    ...(opts.weightedAggregates ? { weightedAggregates: opts.weightedAggregates } : {}),
  });

  // ─── wide-book delta gate (design fact #5) ────────────────────────

  const gateConfig = {
    tickRefreshMs: opts.tickRefreshMs ?? 250,
    wideColumnThreshold: opts.wideColumnThreshold ?? DEFAULT_WIDE_COLUMN_THRESHOLD,
    sweepThrottleWideMs: opts.sweepThrottleWideMs ?? DEFAULT_SWEEP_THROTTLE_WIDE_MS,
  };
  /**
   * Book width: configured columns (+ key + calc columns) when given,
   * else observed from the first leaf read; null = not yet known.
   */
  let observedColumnCount: number | null = opts.columns
    ? new Set([
        keyColumn,
        ...opts.columns,
        ...Object.keys(opts.calcExpressions ?? {}),
      ]).size
    : null;
  const sweepGate = () => resolveSweepGate(observedColumnCount, gateConfig);

  // ─── shared async helpers ───────────────────────────────────────

  /**
   * Pending `stateWhere` waiters. `destroy()` settles every one of them:
   * a `getRows` blocked here would otherwise never answer, and an
   * unanswered `getRows` permanently burns one of AG's TWO global
   * datasource-request slots (see the contract note on `getRows`).
   */
  const stateWaiters = new Set<() => void>();

  /** Resolves with the first accepted state, or `null` if we were torn down. */
  const stateWhere = (
    accept: (state: DatasetStateSnapshot) => boolean,
  ): Promise<DatasetStateSnapshot | null> =>
    new Promise((resolve) => {
      // onState replays the latest snapshot synchronously — the
      // unsubscribe handle may not exist yet inside the listener.
      let off: (() => void) | null = null;
      let settled = false;
      const finish = (value: DatasetStateSnapshot | null): void => {
        if (settled) return;
        settled = true;
        off?.();
        stateWaiters.delete(abort);
        resolve(value);
      };
      const abort = (): void => finish(connection.state ?? null);
      stateWaiters.add(abort);
      off = connection.onState((state) => {
        if (accept(state)) finish(state);
      });
      if (settled) off();
    });

  /**
   * Read one AG block through `plan`'s view. For group-level plans the
   * window shifts past Perspective's leading total row, `total` is the
   * group count, and rows are materialized as AG group row data.
   */
  const readPlanBlock = async (
    plan: QueryPlan,
    view: PullView,
    startRow: number,
    endRow: number,
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
    const numRows = await view.num_rows();
    if (plan.kind === 'group-level') {
      const total = Math.max(0, numRows - 1); // row 0 is the total row
      const raw =
        startRow >= total
          ? []
          : ((await view.to_json({ start_row: startRow + 1, end_row: endRow + 1 })) as Record<
              string,
              unknown
            >[]);
      const keyCountField = plan.viewConfig.aggregates?.[keyColumn] === 'count' ? keyColumn : null;
      return { rows: toGroupRowData(raw, plan.group!, plan.route, keyCountField), total };
    }
    const rows =
      startRow >= numRows
        ? []
        : ((await view.to_json({ start_row: startRow, end_row: endRow })) as Record<
            string,
            unknown
          >[]);
    if (observedColumnCount === null && rows.length > 0) {
      observedColumnCount = Object.keys(rows[0]!).length; // width, once, from a leaf read
    }
    return { rows, total: numRows };
  };

  const viewFactory = async (config: QueryPlan['viewConfig']): Promise<PullView> => {
    const table = await connection.openTable();
    return table.view(config);
  };

  /**
   * Run `use` against the view for a plan, holding a LEASE for its whole
   * duration so the view cannot be deleted mid-read (which would leak it
   * permanently — see ViewCache). Every read in this file goes through
   * here or `tryWithView`; nothing holds a bare view across an await.
   */
  const withPlanView = <T>(
    key: string,
    viewConfig: QueryPlan['viewConfig'],
    isRootShape: boolean,
    use: (view: PullView) => Promise<T>,
  ): Promise<T> =>
    viewCache.withView(key, viewConfig, viewFactory, async (view) => {
      // The tick signal lives on a root-route view — it observes the
      // whole filtered set, so leaf/child reads never steal the
      // subscription onto a slice that might sit out a tick.
      if (isRootShape || tickSub === null) await ensureTickSubscription(key, view);
      return use(view);
    });

  /**
   * Drop a tick subscription UNDER A LEASE.
   *
   * `remove_update` is an async `&self` call that borrows the view for
   * its whole duration. Deleting the view concurrently throws
   * "attempted to take ownership of Rust value while it was borrowed"
   * from a wasm microtask — uncatchable at the call site, never settles,
   * and leaks the view. Going through the cache means any concurrent
   * retire waits for the unsubscribe to finish. `tryWithView` resolves
   * undefined if the shape is already gone, which is fine: a deleted
   * view has no callbacks left to remove.
   */
  const unsubscribeTick = (sub: TickSubscription): void => {
    if (sub.id === null) return;
    const id = sub.id;
    sub.id = null;
    void viewCache.tryWithView(sub.key, (view) => view.remove_update(id)).catch(() => undefined);
  };

  /** Exactly one live `on_update` subscription — on the root shape. */
  const ensureTickSubscription = async (key: string, view: PullView): Promise<void> => {
    if (tickSub && tickSub.key === key && tickSub.view === view) return;
    const previous = tickSub;
    if (previous) unsubscribeTick(previous);
    const next: TickSubscription = { key, view, id: null };
    tickSub = next;
    const id = await view.on_update(() => scheduleTickRefresh());
    if (tickSub === next && !destroyed) next.id = id;
    else void view.remove_update(id).catch(() => undefined);
  };

  // ─── tick refresh (throttled trailing) ────────────────────────────

  const scheduleTickRefresh = throttleTrailing(
    () => void runTickRefresh().catch(() => undefined),
    () => sweepGate().throttleMs, // wide books degrade (design fact #5)
  );

  /**
   * Refetch the cached blocks of the current generation (all shapes —
   * flat, group-level, expanded leaves) and patch changed rows via
   * keyed update transactions; then refresh the grand total. Views are
   * only PEEKED — a tick never resurrects an evicted shape. On WIDE
   * books the sweep is gated to the MRU `WIDE_SWEEP_MAX_BLOCKS` blocks
   * (≈ the viewport — see `sweepGate.ts`).
   */
  /** One coalesced sweep retry once the scroll/miss pressure clears. */
  function scheduleSettleSweep(delayMs: number): void {
    if (settleTimer !== null || destroyed) return;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      void runTickRefresh().catch(() => undefined);
    }, Math.max(delayMs, 50));
  }

  async function runTickRefresh(): Promise<void> {
    const snap = connection.state;
    if (destroyed || !api || !snap || snap.generation !== generation) return;
    const gridApi = api; // narrowed once; `api` is nulled by destroy()
    // Scroll-aware deferral: while the user scrolls (settle window) or a
    // cold getRows read is in flight, the sweep yields the worker —
    // coalescing to ONE retry on settle, so idle ticks are never starved.
    const sinceScroll = Date.now() - lastScrollAt;
    if (sinceScroll < scrollSettleMs || pendingMissReads > 0) {
      stats.sweepDeferrals += 1;
      scheduleSettleSweep(scrollSettleMs - sinceScroll);
      // The BLOCK sweep defers — but the grand total does not. It is a
      // single one-row read off an already-built rollup view, and it is
      // the most visible number on the screen. Leaving it behind the
      // sweep's scroll/miss budget froze it for as long as the user kept
      // scrolling or blocks kept loading.
      await refreshGrandTotal(generation);
      return;
    }
    const requestGen = generation;
    const requestEpoch = planEpoch;
    stats.sweepRuns += 1;
    // MRU gate for EVERY width (narrow books formerly refetched every
    // cached block per cycle): the block LRU's recency order is viewport
    // order, so this slice ≈ what is painted + the latest neighborhood.
    const gate = sweepGate();
    const sweepSet = new Set(
      blockCache
        .recentEntries(requestGen, gate.maxSweepBlocks)
        .map((entry) => `${entry.viewKey}#${entry.startRow}`),
    );
    // EVERY group level always sweeps, on top of the MRU window — root
    // AND intermediate. With `Region > Book > Trader` expanded, the Book
    // rows live at route ['APAC']: not the root, so reserving the root
    // alone left them in the global MRU window, where scrolling a
    // trader's leaves evicted them and the Book aggregates froze while
    // the Region row above and the Trader rows below kept ticking.
    //
    // Cheap to guarantee: one block per expanded level, all on screen.
    // Bounded per level and in total so a deep tree cannot crowd out the
    // leaf blocks the MRU window is there to serve.
    //
    // Deliberately NOT done for flat ('rows') plans: their blocks ARE
    // the viewport blocks and are already MRU, so reserving would only
    // drag the OLDEST ones back in and defeat the wide-book gate.
    let groupReserved = 0;
    for (const plan of planByKey.values()) {
      if (groupReserved >= GROUP_SWEEP_RESERVE_TOTAL) break;
      if (plan.kind !== 'group-level') continue;
      for (const entry of blockCache
        .entriesFor(plan.key, requestGen)
        .slice(0, GROUP_SWEEP_BLOCKS_PER_LEVEL)) {
        sweepSet.add(`${plan.key}#${entry.startRow}`);
        groupReserved += 1;
        if (groupReserved >= GROUP_SWEEP_RESERVE_TOTAL) break;
      }
    }
    let rootTotal: number | null = null;
    for (const plan of planByKey.values()) {
      const entries = blockCache
        .entriesFor(plan.key, requestGen)
        .filter((entry) => sweepSet.has(`${plan.key}#${entry.startRow}`));
      if (entries.length === 0) continue;
      const idField = plan.kind === 'group-level' ? GROUP_ID_FIELD : keyColumn;
      // ONE lease for the plan's whole slice of the sweep. tryWithView
      // never creates and never refreshes recency, so a background sweep
      // cannot resurrect (or keep alive) a shape the user left behind —
      // but for as long as it IS reading, the view cannot be deleted.
      const aborted = await viewCache.tryWithView(plan.key, async (view) => {
        for (const { startRow, block } of entries) {
          let read: { rows: Record<string, unknown>[]; total: number };
          try {
            stats.sweepBlockReads += 1;
            read = await readPlanBlock(plan, view, startRow, block.endRow);
          } catch {
            return false; // read failed — the next tick repairs
          }
          if (destroyed || generation !== requestGen) return true;
          if (planEpoch !== requestEpoch) {
            stats.droppedStale += 1;
            return true; // shape changed mid-sweep — stale rows, drop all
          }
          blockCache.set(plan.key, startRow, {
            ...read,
            generation: requestGen,
            endRow: block.endRow,
          });
          const changed = diffRowsByKey(block.rows, read.rows, idField);
          if (changed.length > 0) {
            gridApi.applyServerSideTransactionAsync({ route: plan.route, update: changed });
          }
          if (plan === rootPlan) rootTotal = read.total;
        }
        return false;
      });
      // The block sweep gives up (generation or query shape moved), but
      // the grand total is read against the CURRENT state below, so it
      // must not be skipped with it.
      if (aborted) break;
    }
    const now = connection.state;
    // AG error #28: setRowCount is forbidden while row grouping is
    // active — group/child store counts ride on load successes instead.
    // GROWTH ONLY (see growFlatRootCount): live ticks insert keys, and a
    // fully-loaded store issues no further getRows to carry the count.
    // A shrink here would strand orphan nodes; it is left to the next
    // load's `success({rowCount})`, which cleans up properly.
    if (
      rootTotal !== null &&
      rootPlan?.kind === 'rows' &&
      now?.phase === 'live' &&
      now.generation === requestGen &&
      planEpoch === requestEpoch
    ) {
      growFlatRootCount(api, rootTotal);
    }
    await refreshGrandTotal(requestGen);
    prunePlans();
  }

  /** Live grand total: refetch the rollup, patch the grand-total node. */
  async function refreshGrandTotal(requestGen: number): Promise<void> {
    if (!rollup || !api || destroyed) return;
    let totals: Record<string, unknown> | null | undefined;
    try {
      totals = await viewCache.tryWithView(rollup.key, (view) => readRollupRow(view));
    } catch {
      return;
    }
    if (totals === undefined) return; // shape no longer cached
    if (!totals || destroyed || generation !== requestGen || !api) return;
    const node = api.getRowNode(GRAND_TOTAL_ROW_ID);
    if (!node) return;
    node.updateData({ ...(node.data as Record<string, unknown>), ...totals });
    api.refreshCells({ rowNodes: [node], force: true });
  }

  /** Row 0 of a rollup view = Perspective's total row over the filtered set. */
  const readRollupRow = async (view: PullView): Promise<Record<string, unknown> | null> => {
    const raw = (await view.to_json({ start_row: 0, end_row: 1 })) as Record<string, unknown>[];
    if (raw.length === 0) return null;
    const { __ROW_PATH__: _path, ...totals } = raw[0]!;
    return totals;
  };

  /** Keep the sweep set bounded: drop plans with no cached blocks. */
  function prunePlans(): void {
    if (planByKey.size <= 32) return;
    for (const [key, plan] of planByKey) {
      if (plan !== rootPlan && blockCache.entriesFor(key, generation).length === 0) {
        planByKey.delete(key);
      }
    }
  }

  // ─── DatasetState wiring ──────────────────────────────────────────

  const scheduleSeedCount = throttleTrailing(() => {
    const snap = connection.state;
    if (destroyed || !api || !snap) return;
    // Only a FLAT root store takes its count from the seed's leaf-row
    // count; under grouping the root holds GROUP rows (counted by the
    // group-view reads) and AG forbids setRowCount outright (error #28).
    if (rootPlan?.kind !== 'rows') return;
    if (snap.generation === generation && snap.phase === 'seeding') {
      // One-arg growth: the seed only ever adds rows, and the two-arg
      // `false` variant would ALSO add a phantom discovery row
      // (`numberOfRows = n; numberOfRows += 1`).
      growFlatRootCount(api, snap.rowCount);
    }
  }, opts.seedCountRefreshMs ?? 200);

  let previousState: DatasetStateSnapshot | null = null;
  const offState = connection.onState((state) => {
    const previous = previousState;
    previousState = state;
    if (state.generation !== generation) {
      // New generation: every cached row and view belongs to the dead
      // one. The consumer remounts the grid; we just stop serving stale.
      generation = state.generation;
      blockCache.clear();
      // RETIRE, not delete-now: a restart is exactly when reads are most
      // likely in flight, and deleting a view under a live read leaks it
      // permanently (uncatchable, never settles). Leased views are
      // deleted as their reads finish.
      viewCache.retireAll();
      planByKey.clear();
      rootPlan = null;
      rollup = null;
      tickSub = null;
      lastRootTotal = null;
      return;
    }
    if (!api) return;
    if (state.phase === 'seeding') scheduleSeedCount();
    const becameLive =
      state.phase === 'live' &&
      previous !== null &&
      previous.generation === state.generation &&
      previous.phase !== 'live';
    if (becameLive) {
      // Seed finished: refresh every loaded block WITHOUT purging (rows
      // stay on screen — no stub flicker) and let the loads finalize.
      blockCache.clear();
      api.refreshServerSide({ purge: false });
    }
  });

  // ─── the datasource ───────────────────────────────────────────────

  async function serveRows(
    params: IServerSideGetRowsParams,
    succeed: (result: LoadSuccessParams) => void,
    fail: () => void,
  ): Promise<void> {
    api ??= params.api;
    let snap = connection.state ?? (await stateWhere(() => true));
    if (snap?.phase === 'connecting') {
      snap = await stateWhere((state) => state.phase !== 'connecting');
    }
    // NOTE: a generation change while we waited is NOT a reason to drop.
    // We re-snapshot and serve the CURRENT book — dropping would leave
    // AG's request slot burned (see the `getRows` contract note).
    if (destroyed || !snap) {
      fail();
      return;
    }
    if (snap.phase === 'error') {
      fail();
      return;
    }
    if (snap.phase === 'empty') {
      succeed({ rowData: [], rowCount: 0 });
      return;
    }
    let requestGen = snap.generation;

    // The plan-epoch fence may demand a re-serve: if the query shape
    // changed while THIS load was reading (quick filter settled), the
    // stale read is dropped and the load re-plans against the current
    // shape — AG's callback is always answered with current-shape rows.
    // The LAST rows we managed to read, whatever shape they were for.
    // If the query shape churns faster than we can read it we still owe
    // AG an answer, and slightly-stale rows beat a dead grid: a shape
    // change always purges/refreshes the store, so AG re-requests.
    let lastRead: { rows: Record<string, unknown>[]; total: number } | null = null;
    let lastPlan: QueryPlan | null = null;

    for (let attempt = 0; attempt < MAX_SERVE_ATTEMPTS; attempt += 1) {
      // Re-planned from `params.request` EVERY attempt on purpose: AG
      // mutates that object in place, so a re-read reflects the current
      // sort/filter rather than the shape we were first called for.
      const plan = buildQueryPlan(params.request, planOpts());
      if (plan.unsupportedFilters.length > 0 && !warnedPlans.has(plan.key)) {
        warnedPlans.add(plan.key);
        warn(`[ssrm-pull] unsupported filter clauses ignored: ${plan.unsupportedFilters.join('; ')}`);
      }
      planByKey.set(plan.key, plan);
      const isRoot = plan.route.length === 0;
      if (isRoot) {
        // Root shape fingerprint changed (filter/sort model, quick
        // filter, grouping) — bump the epoch so in-flight reads for the
        // PREVIOUS shape can never land after this one.
        if (rootPlan !== null && rootPlan.key !== plan.key) planEpoch += 1;
        rootPlan = plan;
        // CLONE: `request` is a live reference into AG's single mutable
        // ssrmParams. Retaining it corrupts the `oldSortModel` AG diffs
        // against, which makes group-level sorts stop refreshing.
        lastRootRequest = cloneRequest(params.request);
      }
      const requestEpoch = planEpoch;

      // Grand total — root-level loads only; armed by AG's hint, kept
      // fresh on every later root load (filters/quick filter changes).
      let grandTotal: Record<string, unknown> | undefined;
      if (isRoot && (params.needsGrandTotal || rollup !== null)) {
        const rollupPlan = buildRollupPlan(params.request, planOpts());
        rollup = rollupPlan;
        if (rollupPlan) {
          const totals = await withPlanView(rollupPlan.key, rollupPlan.viewConfig, true, (view) =>
            readRollupRow(view),
          );
          if (destroyed) {
            fail();
            return;
          }
          if (totals) grandTotal = totals;
        }
      }

      // Book replaced under us — adopt the new generation and re-read
      // rather than dropping the load on the floor.
      if (generation !== requestGen) {
        stats.droppedStale += 1;
        requestGen = generation;
        continue;
      }
      if (planEpoch !== requestEpoch) {
        stats.droppedStale += 1;
        continue; // shape changed during the rollup read — re-plan
      }

      const startRow = params.request.startRow ?? 0;
      const endRow = params.request.endRow ?? startRow + defaultBlockSize;
      let read: { rows: Record<string, unknown>[]; total: number };
      let cacheHit = false;
      const cached = blockCache.get(plan.key, startRow, requestGen);
      if (cached) {
        read = cached;
        cacheHit = true;
      } else {
        stats.missReads += 1;
        pendingMissReads += 1;
        try {
          read = await withPlanView(plan.key, plan.viewConfig, isRoot, (view) =>
            readPlanBlock(plan, view, startRow, endRow),
          );
        } finally {
          pendingMissReads -= 1;
        }
      }
      lastRead = read;
      lastPlan = plan;
      if (destroyed) {
        fail();
        return;
      }
      if (generation !== requestGen) {
        stats.droppedStale += 1;
        requestGen = generation;
        continue; // re-read against the live book
      }
      if (planEpoch !== requestEpoch) {
        stats.droppedStale += 1;
        continue; // re-read against the current shape
      }
      if (!cacheHit) blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
      finishLoad(params, succeed, plan, read.rows, read.total, requestGen, grandTotal);
      if (cacheHit) {
        void refreshBlock(plan, startRow, endRow, requestGen, requestEpoch).catch(() => undefined);
      } else {
        prefetchNeighbors(plan, startRow, endRow, read.total, requestGen, requestEpoch);
      }
      return;
    }

    // Shape churned every attempt. Answer anyway — an unanswered
    // getRows costs one of AG's two global request slots permanently.
    stats.serveExhausted += 1;
    if (lastRead && lastPlan) {
      finishLoad(params, succeed, lastPlan, lastRead.rows, lastRead.total, requestGen);
    } else {
      fail();
    }
  }

  /**
   * Neighbor prefetch (design fact #6): after a COLD miss resolves on a
   * flat leaf plan, warm the adjacent block(s) into the BlockCache so
   * directional scrolling stays a serve-then-refresh cache hit. Cache
   * write ONLY — AG has not asked for these rows, nothing is painted.
   * Best-effort: skipped while another user miss is already in flight.
   */
  function prefetchNeighbors(
    plan: QueryPlan,
    startRow: number,
    endRow: number,
    total: number,
    requestGen: number,
    requestEpoch: number,
  ): void {
    if (plan.kind !== 'rows') return; // leaf plans only
    const span = Math.max(1, endRow - startRow);
    for (const neighborStart of [startRow + span, startRow - span]) {
      if (neighborStart < 0 || neighborStart >= total) continue;
      if (blockCache.has(plan.key, neighborStart, requestGen)) continue;
      if (pendingMissReads > 0) return; // user demand owns the worker
      void (async () => {
        if (destroyed || generation !== requestGen || planEpoch !== requestEpoch) return;
        stats.prefetchReads += 1;
        const read = await withPlanView(
          plan.key,
          plan.viewConfig,
          plan.route.length === 0,
          (view) => readPlanBlock(plan, view, neighborStart, neighborStart + span),
        );
        if (destroyed || generation !== requestGen || planEpoch !== requestEpoch) {
          stats.droppedStale += 1;
          return;
        }
        blockCache.set(plan.key, neighborStart, {
          ...read,
          generation: requestGen,
          endRow: neighborStart + span,
        });
      })().catch(() => undefined);
    }
  }

  /** A flat root store — the only store `setRowCount` may touch (AG #28). */
  const isFlatRoot = (plan: QueryPlan): boolean =>
    plan.kind === 'rows' && plan.route.length === 0;

  /**
   * Deliver one block honoring the DatasetState rowCount contract.
   * ALWAYS answers: a generation change here used to `return` silently,
   * which stranded AG's request slot. Rows read against a superseded
   * generation are harmless — the store is rebuilt on remount, and AG
   * discards deliveries into a dead cache on its own.
   */
  function finishLoad(
    params: IServerSideGetRowsParams,
    succeed: (result: LoadSuccessParams) => void,
    plan: QueryPlan,
    rows: Record<string, unknown>[],
    total: number,
    requestGen: number,
    grandTotal?: Record<string, unknown>,
  ): void {
    const snap = connection.state;
    const extra = grandTotal !== undefined ? { grandTotalData: grandTotal } : {};
    if (!snap || snap.generation !== requestGen) {
      succeed({ rowData: rows, rowCount: total, ...extra });
      return;
    }
    // `rowCount` on EVERY success is the whole resize strategy. In AG 36
    // a success carrying rowCount is an UNGATED assignment followed by
    // the past-the-end node cleanup, so the store self-corrects in both
    // directions AND sheds orphan nodes. `setRowCount` does neither: it
    // never cleans up (in either variant), and the `true` variant arms
    // the sort deadlock. So this datasource no longer resizes with it —
    // growth between loads goes through the one-arg form only.
    succeed({ rowData: rows, rowCount: total, ...extra });
    if (isFlatRoot(plan)) lastRootTotal = total;
  }

  /**
   * GROWTH-ONLY resize between loads — the live feed adds keys without
   * any user action, and a fully-loaded known store issues no further
   * `getRows` (no stubs), so nothing would otherwise carry the new
   * total. The ONE-ARG form is the only count channel that leaves
   * `isLastRowKnown` untouched (`if (isLastRowIndexKnown != null)`
   * skips the whole flag block), so it can neither arm the sort
   * deadlock nor reopen a finalized store.
   *
   * SHRINKS ARE NEVER APPLIED HERE. `setRowCount` performs no
   * past-the-end node cleanup in EITHER variant, so shrinking through
   * it strands orphan nodes and drives `setDisplayIndexes` to a
   * negative skip count — stale painted rows over a correct model.
   * Shrink is owned by `success({rowCount})` (which does clean up) and
   * by the purge on membership change.
   */
  function growFlatRootCount(gridApi: GridApi, total: number): void {
    const before = lastRootTotal;
    if (before !== null && total <= before) return;
    lastRootTotal = total;
    gridApi.setRowCount(total);
  }

  /** Serve-then-refresh: replace a cache-hit block with a fresh read. */
  async function refreshBlock(
    plan: QueryPlan,
    startRow: number,
    endRow: number,
    requestGen: number,
    requestEpoch: number,
  ): Promise<void> {
    stats.refreshReads += 1;
    const read = await withPlanView(plan.key, plan.viewConfig, plan.route.length === 0, (view) =>
      readPlanBlock(plan, view, startRow, endRow),
    );
    const snap = connection.state;
    if (destroyed || !api || generation !== requestGen) return;
    if (!snap || snap.generation !== requestGen) return;
    if (planEpoch !== requestEpoch) {
      stats.droppedStale += 1;
      return; // epoch fence: stale-shape rows never paint over current
    }
    blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
    // Index-addressed replacement: fills, reorders and updates the
    // block in place — loaded rows stay visible (never a purge).
    // `rowCount` rides along here too: applyServerSideRowData passes
    // `expectedRows = rowData.length`, so the short-block "last row
    // known" inference can never misfire from it, and the count keeps
    // the store self-correcting (and orphan-free) in both directions.
    api.applyServerSideRowData({
      startRow,
      route: plan.route,
      successParams: { rowData: read.rows, rowCount: read.total },
    });
    if (isFlatRoot(plan)) lastRootTotal = read.total;
  }

  return {
    /**
     * CONTRACT (AG Grid 36, verified in the shipped bundle): the grid
     * increments a GRID-GLOBAL `outboundRequests` counter before calling
     * this, and decrements it ONLY from inside `success`/`fail`. With
     * `maxConcurrentDatasourceRequests` defaulting to 2, TWO calls that
     * never answer reduce the grid's load bandwidth to zero — for every
     * store, permanently. Purging does not recover it. So: every path
     * out of here answers exactly once, and the `finally` below is a
     * structural backstop, not decoration.
     */
    getRows(params: IServerSideGetRowsParams): void {
      let answered = false;
      const succeed = (result: LoadSuccessParams): void => {
        if (answered) return;
        answered = true;
        try {
          params.success(result);
        } catch (err) {
          warn(`[ssrm-pull] success() threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      const fail = (): void => {
        if (answered) return;
        answered = true;
        try {
          params.fail();
        } catch {
          /* grid already torn down */
        }
      };
      void serveRows(params, succeed, fail)
        .catch((err) => {
          warn(`[ssrm-pull] getRows failed: ${err instanceof Error ? err.message : String(err)}`);
          fail();
        })
        .finally(() => {
          if (answered) return;
          warn('[ssrm-pull] BUG: getRows completed without answering — failing to free the slot');
          fail();
        });
    },
    setQuickFilter(text: string | null): void {
      const next = text?.trim() || undefined;
      pendingQuickFilter = next;
      if (quickFilterTimer !== null) {
        clearTimeout(quickFilterTimer);
        quickFilterTimer = null;
      }
      const apply = (): void => {
        quickFilterTimer = null;
        if (destroyed || pendingQuickFilter === quickFilter) return;
        quickFilter = pendingQuickFilter;
        // Epoch fence: every in-flight read for the pre-change shape is
        // now stale — bump BEFORE the refresh so none of them can paint.
        planEpoch += 1;
        // FLAT store: refresh SOFT (purge:false). Rows stay on screen and
        // in place while the new view builds, the scroll position holds,
        // and no loading stubs flash. Correctness comes from `rowCount`
        // riding EVERY success: that is an ungated assignment followed by
        // AG's past-the-end node cleanup, so the store shrinks AND sheds
        // orphans on its own.
        //
        // It was `setRowCount` that made a soft shrink leave the whole
        // unfiltered book painted (no cleanup in either variant), not
        // `purge:false`. With setRowCount gone, soft is both correct and
        // the fast path — purging here was an over-correction that cost
        // a loading flash and a jump to the top of the book on every
        // keystroke AND on clear.
        //
        // GROUPED/TREE store: still PURGE. A membership change restructures
        // the group set itself, so cached group-level blocks are not merely
        // stale but wrong, and `setRowCount` is illegal under grouping
        // (AG #28) so the count cannot be corrected in place.
        const grouped =
          (lastRootRequest?.rowGroupCols?.length ?? 0) > 0 ||
          (opts.treePathFields?.length ?? 0) > 0;
        // Pre-warm the NEW shape's view while AG spins up its refresh
        // cycle. Measured, this is the ONLY meaningful cost of a quick
        // filter: building the expression view over the whole book runs
        // 116ms @ 20k x 12 cols and 750ms @ 100k x 158, while counting
        // and reading a block are 0.1-11ms. Overlapping the build with
        // AG's refresh takes it off the first block's critical path.
        // (Memoized by key — the real loads reuse this very view.)
        const warmPlan = buildQueryPlan(lastRootRequest ?? EMPTY_ROOT_REQUEST, planOpts());
        void viewCache.warm(warmPlan.key, warmPlan.viewConfig, viewFactory).catch(() => undefined);
        api?.refreshServerSide({ route: [], purge: grouped });
      };
      const debounceMs = opts.quickFilterDebounceMs ?? 150;
      if (debounceMs <= 0) apply();
      else quickFilterTimer = setTimeout(apply, debounceMs);
    },
    async queryAll(o: QueryAllOpts = {}): Promise<QueryAllResult> {
      const snap = connection.state;
      if (!snap || snap.phase === 'connecting') {
        throw new Error('[ssrm-pull] queryAll before the dataset is ready');
      }
      if (snap.phase === 'error') {
        throw new Error(`[ssrm-pull] queryAll refused: dataset error ${snap.error ?? ''}`.trim());
      }
      const requestGen = snap.generation;
      if (snap.phase === 'empty') return { rows: [], total: 0, generation: requestGen };
      const chunkSize = Math.max(1, o.chunkSize ?? 10_000);
      // Leaf rows of the CURRENT root shape: grouping/aggregation
      // stripped, filter model + sort model + quick filter kept
      // (rowsSort drops the auto-column sort — constant across leaves).
      // `treePathFields: []` strips TREE levels the same way grouping
      // is stripped — queryAll always reads leaves.
      const flatRequest: IServerSideGetRowsParams['request'] = {
        ...(lastRootRequest ?? EMPTY_ROOT_REQUEST),
        rowGroupCols: [],
        groupKeys: [],
        valueCols: [],
        pivotCols: [],
        pivotMode: false,
        startRow: 0,
        endRow: 0,
      };
      const plan = buildQueryPlan(flatRequest, {
        ...planOpts(),
        ...(o.columns ? { columns: o.columns } : {}),
        treePathFields: [],
      });
      // TRANSIENT view — never the LRU: a full-set read must not evict
      // hot viewport views or steal the tick subscription.
      const table = await connection.openTable();
      const view = await table.view(plan.viewConfig);
      try {
        const fence = (): void => {
          if (destroyed || generation !== requestGen) {
            throw new Error('[ssrm-pull] queryAll aborted: generation changed mid-read');
          }
        };
        fence();
        const total = await view.num_rows();
        const rows: Record<string, unknown>[] = [];
        for (let start = 0; start < total; start += chunkSize) {
          fence();
          const chunk = (await view.to_json({
            start_row: start,
            end_row: Math.min(start + chunkSize, total),
          })) as Record<string, unknown>[];
          if (o.onChunk) o.onChunk(chunk, { startRow: start, total });
          else rows.push(...chunk);
        }
        fence();
        return { rows, total, generation: requestGen };
      } finally {
        void view.delete().catch(() => undefined);
      }
    },
    async getDistinctValues(field: string): Promise<unknown[]> {
      const table = await connection.openTable();
      // Calc columns group_by their alias like real columns — the view
      // just needs the expression defined (engine-verified). Real
      // columns skip the expression map (no per-row calc compute).
      const calcExpr = opts.calcExpressions?.[field];
      const view = await table.view({
        group_by: [field],
        columns: [],
        ...(calcExpr !== undefined ? { expressions: { [field]: calcExpr } } : {}),
      });
      try {
        const rows = (await view.to_json()) as Array<{ __ROW_PATH__?: unknown[] }>;
        return rows
          .map((row) => row.__ROW_PATH__ ?? [])
          .filter((path) => path.length > 0)
          .map((path) => path[path.length - 1]);
      } finally {
        void view.delete().catch(() => undefined);
      }
    },
    onScroll(): void {
      lastScrollAt = Date.now();
    },
    getStats(): SsrmPullDatasourceStats {
      return { ...stats, rootRowCount: lastRootTotal };
    },
    destroy(): void {
      destroyed = true;
      offState();
      // Settle anything parked in `stateWhere` FIRST: a getRows waiting
      // on a state transition would otherwise never answer, and an
      // unanswered getRows permanently burns an AG request slot.
      for (const abort of [...stateWaiters]) abort();
      stateWaiters.clear();
      if (quickFilterTimer !== null) {
        clearTimeout(quickFilterTimer);
        quickFilterTimer = null;
      }
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      // Under a lease — see unsubscribeTick. The retireAll() below then
      // waits for it instead of deleting the view mid-borrow.
      if (tickSub) unsubscribeTick(tickSub);
      tickSub = null;
      // Retire rather than delete: an in-flight read still holds a lease,
      // and yanking its view leaks the view for the life of the worker.
      viewCache.retireAll();
      blockCache.clear();
      planByKey.clear();
      rootPlan = null;
      lastRootRequest = null;
      rollup = null;
      api = null;
    },
  };
}

// ─── small pure helpers ──────────────────────────────────────────────

/** queryAll's base when no root load has happened yet (no filters/sort). */
const EMPTY_ROOT_REQUEST: IServerSideGetRowsParams['request'] = {
  startRow: 0,
  endRow: 0,
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
  groupKeys: [],
  filterModel: null,
  sortModel: [],
};

/**
 * Trailing-edge throttle: at most one `fn` per `ms`, always deferred.
 * `ms` may be a getter — evaluated when each cycle is scheduled, so the
 * wide-book gate can change the cadence without rebuilding the throttle.
 */
function throttleTrailing(fn: () => void, ms: number | (() => number)): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) return;
    timer = setTimeout(
      () => {
        timer = null;
        fn();
      },
      typeof ms === 'function' ? ms() : ms,
    );
  };
}

/** Fresh rows whose key existed before but whose cells changed. */
export function diffRowsByKey(
  previousRows: Record<string, unknown>[],
  nextRows: Record<string, unknown>[],
  keyColumn: string,
): Record<string, unknown>[] {
  const byKey = new Map<unknown, Record<string, unknown>>();
  for (const row of previousRows) byKey.set(row[keyColumn], row);
  const changed: Record<string, unknown>[] = [];
  for (const row of nextRows) {
    const previous = byKey.get(row[keyColumn]);
    if (previous && !shallowRowEquals(previous, row)) changed.push(row);
  }
  return changed;
}

function shallowRowEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
