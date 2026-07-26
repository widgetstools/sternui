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
  /** Async results dropped by the generation/plan-epoch fences. */
  droppedStale: number;
  /** Full-row-DOM rebuilds issued by the shrink path. */
  redraws: number;
  /** Sweep cycles deferred because the user was scrolling / a miss was in flight. */
  sweepDeferrals: number;
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

export function createSsrmPullDatasource(opts: SsrmPullDatasourceOpts): SsrmPullDatasource {
  const { connection, keyColumn } = opts;
  const defaultBlockSize = opts.defaultBlockSize ?? 100;
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  const blockCache = new BlockCache(opts.maxBlocks ?? 32);
  const viewCache = new ViewCache({
    maxViews: opts.maxViews ?? 8,
    onEvict: (_key, view) => {
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
    redraws: 0,
    sweepDeferrals: 0,
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

  const stateWhere = (
    accept: (state: DatasetStateSnapshot) => boolean,
  ): Promise<DatasetStateSnapshot> =>
    new Promise((resolve) => {
      // onState replays the latest snapshot synchronously — the
      // unsubscribe handle may not exist yet inside the listener.
      let off: (() => void) | null = null;
      let settled = false;
      off = connection.onState((state) => {
        if (settled || (!accept(state) && !destroyed)) return;
        settled = true;
        off?.();
        resolve(state);
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

  const acquireView = async (
    key: string,
    viewConfig: QueryPlan['viewConfig'],
    isRootShape: boolean,
  ): Promise<PullView> => {
    const view = await viewCache.acquire(key, viewConfig, async (config) => {
      const table = await connection.openTable();
      return table.view(config);
    });
    // The tick signal lives on a root-route view — it observes the whole
    // filtered set, so leaf/child acquires never steal the subscription
    // onto a slice that might sit out a tick.
    if (isRootShape || tickSub === null) await ensureTickSubscription(key, view);
    return view;
  };

  /** Exactly one live `on_update` subscription — on the root shape. */
  const ensureTickSubscription = async (key: string, view: PullView): Promise<void> => {
    if (tickSub && tickSub.key === key && tickSub.view === view) return;
    const previous = tickSub;
    if (previous?.id != null) {
      void previous.view.remove_update(previous.id).catch(() => undefined);
    }
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
    // Scroll-aware deferral: while the user scrolls (settle window) or a
    // cold getRows read is in flight, the sweep yields the worker —
    // coalescing to ONE retry on settle, so idle ticks are never starved.
    const sinceScroll = Date.now() - lastScrollAt;
    if (sinceScroll < scrollSettleMs || pendingMissReads > 0) {
      stats.sweepDeferrals += 1;
      scheduleSettleSweep(scrollSettleMs - sinceScroll);
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
    let rootTotal: number | null = null;
    for (const plan of planByKey.values()) {
      const pendingView = viewCache.peek(plan.key);
      if (!pendingView) continue;
      const entries = blockCache
        .entriesFor(plan.key, requestGen)
        .filter((entry) => sweepSet.has(`${plan.key}#${entry.startRow}`));
      if (entries.length === 0) continue;
      let view: PullView;
      try {
        view = await pendingView;
      } catch {
        continue;
      }
      const idField = plan.kind === 'group-level' ? GROUP_ID_FIELD : keyColumn;
      for (const { startRow, block } of entries) {
        let read: { rows: Record<string, unknown>[]; total: number };
        try {
          stats.sweepBlockReads += 1;
          read = await readPlanBlock(plan, view, startRow, block.endRow);
        } catch {
          break; // view evicted/deleted mid-read — the next tick repairs
        }
        if (destroyed || generation !== requestGen) return;
        if (planEpoch !== requestEpoch) {
          stats.droppedStale += 1;
          return; // query shape changed mid-sweep — stale rows, drop all
        }
        blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow: block.endRow });
        const changed = diffRowsByKey(block.rows, read.rows, idField);
        if (changed.length > 0) {
          api.applyServerSideTransactionAsync({ route: plan.route, update: changed });
        }
        if (plan === rootPlan) rootTotal = read.total;
      }
    }
    const now = connection.state;
    // AG error #28: setRowCount is forbidden while row grouping is
    // active — group/child store counts ride on load successes instead.
    if (
      rootTotal !== null &&
      rootPlan?.kind === 'rows' &&
      now?.phase === 'live' &&
      now.generation === requestGen &&
      planEpoch === requestEpoch
    ) {
      enforceFlatRootCount(api, rootTotal);
    }
    await refreshGrandTotal(requestGen);
    prunePlans();
  }

  /** Live grand total: refetch the rollup, patch the grand-total node. */
  async function refreshGrandTotal(requestGen: number): Promise<void> {
    if (!rollup || !api || destroyed) return;
    const pendingView = viewCache.peek(rollup.key);
    if (!pendingView) return;
    let totals: Record<string, unknown> | null;
    try {
      totals = await readRollupRow(await pendingView);
    } catch {
      return;
    }
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
      api.setRowCount(snap.rowCount, false);
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
      viewCache.clear();
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

  async function serveRows(params: IServerSideGetRowsParams): Promise<void> {
    api ??= params.api;
    let snap = connection.state ?? (await stateWhere(() => true));
    if (destroyed) return;
    const requestGen = snap.generation;
    if (snap.phase === 'connecting') {
      snap = await stateWhere((state) => state.phase !== 'connecting');
      if (destroyed || snap.generation !== requestGen) return; // dropped
    }
    if (snap.phase === 'error') {
      params.fail();
      return;
    }
    if (snap.phase === 'empty') {
      params.success({ rowData: [], rowCount: 0 });
      return;
    }

    // The plan-epoch fence may demand a re-serve: if the query shape
    // changed while THIS load was reading (quick filter settled), the
    // stale read is dropped and the load re-plans against the current
    // shape — AG's callback is always answered with current-shape rows.
    for (let attempt = 0; attempt < 4; attempt += 1) {
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
        lastRootRequest = params.request;
      }
      const requestEpoch = planEpoch;

      // Grand total — root-level loads only; armed by AG's hint, kept
      // fresh on every later root load (filters/quick filter changes).
      let grandTotal: Record<string, unknown> | undefined;
      if (isRoot && (params.needsGrandTotal || rollup !== null)) {
        const rollupPlan = buildRollupPlan(params.request, planOpts());
        rollup = rollupPlan;
        if (rollupPlan) {
          const view = await acquireView(rollupPlan.key, rollupPlan.viewConfig, true);
          const totals = await readRollupRow(view);
          if (destroyed || generation !== requestGen) return; // fence: drop
          if (totals) grandTotal = totals;
        }
      }

      if (planEpoch !== requestEpoch) {
        // Shape changed during the rollup read — re-plan before reading.
        stats.droppedStale += 1;
        if (isRoot && rootPlan === plan) continue;
        return;
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
          const view = await acquireView(plan.key, plan.viewConfig, isRoot);
          read = await readPlanBlock(plan, view, startRow, endRow);
        } finally {
          pendingMissReads -= 1;
        }
        if (destroyed || generation !== requestGen) {
          stats.droppedStale += 1;
          return; // generation fence: the grid remounts — drop
        }
      }
      if (planEpoch !== requestEpoch) {
        stats.droppedStale += 1;
        // Shape changed mid-read. If this load still owns the root
        // store, re-serve it against the CURRENT shape (quick-filter
        // soft refresh keeps the store — its callback must be answered
        // with current rows). If a newer root load took over, drop —
        // that load answers with fresh data.
        if (isRoot && rootPlan === plan) continue;
        return;
      }
      if (!cacheHit) blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
      finishLoad(params, plan, read.rows, read.total, requestGen, grandTotal);
      if (cacheHit) {
        void refreshBlock(plan, startRow, endRow, requestGen, requestEpoch).catch(() => undefined);
      } else {
        prefetchNeighbors(plan, startRow, endRow, read.total, requestGen, requestEpoch);
      }
      return;
    }
    params.fail(); // shape churned 4 times mid-flight — let AG retry
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
        const view = await acquireView(plan.key, plan.viewConfig, plan.route.length === 0);
        const read = await readPlanBlock(plan, view, neighborStart, neighborStart + span);
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

  /** Deliver one block honoring the DatasetState rowCount contract. */
  function finishLoad(
    params: IServerSideGetRowsParams,
    plan: QueryPlan,
    rows: Record<string, unknown>[],
    total: number,
    requestGen: number,
    grandTotal?: Record<string, unknown>,
  ): void {
    const snap = connection.state;
    if (!snap || snap.generation !== requestGen) return; // fence: drop
    const extra = grandTotal !== undefined ? { grandTotalData: grandTotal } : {};
    if (snap.phase === 'seeding' && isFlatRoot(plan)) {
      params.success({ rowData: rows, ...extra });
      // An under-filled block makes AG's lazy cache mark the row count
      // final — reopen it; the seed is still growing the book.
      params.api.setRowCount(total, false);
      return;
    }
    // Group-level and routed child stores always finalize with the
    // view's exact count — a count that grows mid-seed is refreshed by
    // the seeding→live no-purge refresh (and by later user loads).
    params.success({ rowData: rows, rowCount: total, ...extra });
    // Flat root at live/empty: ENFORCE the count. AG's lazy store never
    // SHRINKS from a success rowCount alone (a soft refresh after a
    // quick-filter change left the scrollbar on the unfiltered total),
    // and never grows from one either once marked final. setRowCount is
    // authoritative both ways and legal only here (AG #28 under grouping).
    if (isFlatRoot(plan)) enforceFlatRootCount(params.api, total);
  }

  /**
   * setRowCount + stale-DOM cleanup. Shrinking the row MODEL does not
   * remove already-RENDERED row DOM (field report: quick filter "did
   * nothing" — the API said 1 row while the screen still painted the
   * whole unfiltered book). On shrink, redrawRows() rebuilds the row DOM
   * from the model. SHRINK-ONLY, judged against the last total THIS
   * datasource delivered — never against `getDisplayedRowCount()`,
   * which counts footer/loading rows and would over-fire the (full-DOM,
   * expensive) redraw on the steady serve-then-refresh path.
   */
  function enforceFlatRootCount(gridApi: GridApi, total: number): void {
    const before = lastRootTotal;
    lastRootTotal = total;
    gridApi.setRowCount(total, true);
    if (before !== null && total < before) {
      stats.redraws += 1;
      (gridApi as { redrawRows?: () => void }).redrawRows?.();
    }
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
    const view = await acquireView(plan.key, plan.viewConfig, plan.route.length === 0);
    const read = await readPlanBlock(plan, view, startRow, endRow);
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
    const seedingFlatRoot = snap.phase === 'seeding' && isFlatRoot(plan);
    api.applyServerSideRowData({
      startRow,
      route: plan.route,
      successParams: seedingFlatRoot
        ? { rowData: read.rows }
        : { rowData: read.rows, rowCount: read.total },
    });
    // Flat root: keep the store count authoritative on refreshes too —
    // shrink (filter narrowed) and growth (live inserts) both apply.
    if (seedingFlatRoot) api.setRowCount(read.total, false);
    else if (isFlatRoot(plan)) enforceFlatRootCount(api, read.total);
  }

  return {
    getRows(params: IServerSideGetRowsParams): void {
      void serveRows(params).catch((err) => {
        if (destroyed) return;
        warn(`[ssrm-pull] getRows failed: ${err instanceof Error ? err.message : String(err)}`);
        params.fail();
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
        // FLAT store: refresh SOFT — rows morph in place (no stub blank),
        // and finishLoad/refreshBlock enforce the shrunken/grown count via
        // setRowCount (a soft refresh alone never resizes the lazy store).
        // GROUPED/TREE store: purge — group membership/counts change
        // structurally and setRowCount is forbidden under grouping (AG #28).
        // An armed rollup rebuilds on the next root load either way.
        const grouped =
          (lastRootRequest?.rowGroupCols?.length ?? 0) > 0
          || (opts.treePathFields?.length ?? 0) > 0;
        // Pre-warm the NEW shape's view while AG spins up its refresh
        // cycle: building the quick-filter expression view over the
        // whole book is the long pole of the first post-change read —
        // overlapping it with AG's store refresh takes it off the
        // first block's critical path. (Memoized by key: the real
        // loads reuse this very view.)
        const warmPlan = buildQueryPlan(lastRootRequest ?? EMPTY_ROOT_REQUEST, planOpts());
        void acquireView(warmPlan.key, warmPlan.viewConfig, true).catch(() => undefined);
        api?.refreshServerSide({ purge: grouped });
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
      return { ...stats };
    },
    destroy(): void {
      destroyed = true;
      offState();
      if (quickFilterTimer !== null) {
        clearTimeout(quickFilterTimer);
        quickFilterTimer = null;
      }
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (tickSub?.id != null) {
        void tickSub.view.remove_update(tickSub.id).catch(() => undefined);
      }
      tickSub = null;
      viewCache.clear();
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
