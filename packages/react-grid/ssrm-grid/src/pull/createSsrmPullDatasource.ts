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
 *   columns the throttle degrades to `sweepThrottleWideMs` and the
 *   sweep refetches only the `WIDE_SWEEP_MAX_BLOCKS` most-recently-used
 *   blocks (≈ the viewport; off-screen blocks catch up via plain
 *   cache-miss reads when scrolled back). Narrow books keep the plain
 *   bare `on_update` → refetch-everything path, no row deltas.
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
  WIDE_SWEEP_MAX_BLOCKS,
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
  /** Viewport block LRU capacity. Default 12. */
  maxBlocks?: number;
  /** Tick→refetch trailing throttle. Default 250ms. */
  tickRefreshMs?: number;
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
  const blockCache = new BlockCache(opts.maxBlocks ?? 12);
  const viewCache = new ViewCache({
    maxViews: opts.maxViews ?? 8,
    onEvict: (_key, view) => {
      if (tickSub?.view === view) tickSub = null; // deletion kills its callbacks
    },
  });

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
  async function runTickRefresh(): Promise<void> {
    const snap = connection.state;
    if (destroyed || !api || !snap || snap.generation !== generation) return;
    const requestGen = generation;
    const visibleOnly =
      sweepGate().scope === 'visible-blocks'
        ? new Set(
            blockCache
              .recentEntries(requestGen, WIDE_SWEEP_MAX_BLOCKS)
              .map((entry) => `${entry.viewKey}#${entry.startRow}`),
          )
        : null;
    let rootTotal: number | null = null;
    for (const plan of planByKey.values()) {
      const pendingView = viewCache.peek(plan.key);
      if (!pendingView) continue;
      const entries = blockCache
        .entriesFor(plan.key, requestGen)
        .filter((entry) => visibleOnly === null || visibleOnly.has(`${plan.key}#${entry.startRow}`));
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
          read = await readPlanBlock(plan, view, startRow, block.endRow);
        } catch {
          break; // view evicted/deleted mid-read — the next tick repairs
        }
        if (destroyed || generation !== requestGen) return;
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
      now.generation === requestGen
    ) {
      api.setRowCount(rootTotal, true);
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

    const plan = buildQueryPlan(params.request, planOpts());
    if (plan.unsupportedFilters.length > 0 && !warnedPlans.has(plan.key)) {
      warnedPlans.add(plan.key);
      warn(`[ssrm-pull] unsupported filter clauses ignored: ${plan.unsupportedFilters.join('; ')}`);
    }
    planByKey.set(plan.key, plan);
    if (plan.route.length === 0) {
      rootPlan = plan;
      lastRootRequest = params.request;
    }

    // Grand total — root-level loads only; armed by AG's hint, kept
    // fresh on every later root load (filters/quick filter changes).
    let grandTotal: Record<string, unknown> | undefined;
    if (plan.route.length === 0 && (params.needsGrandTotal || rollup !== null)) {
      const rollupPlan = buildRollupPlan(params.request, planOpts());
      rollup = rollupPlan;
      if (rollupPlan) {
        const view = await acquireView(rollupPlan.key, rollupPlan.viewConfig, true);
        const totals = await readRollupRow(view);
        if (destroyed || generation !== requestGen) return; // fence: drop
        if (totals) grandTotal = totals;
      }
    }

    const startRow = params.request.startRow ?? 0;
    const endRow = params.request.endRow ?? startRow + defaultBlockSize;
    const cached = blockCache.get(plan.key, startRow, requestGen);
    if (cached) {
      finishLoad(params, plan, cached.rows, cached.total, requestGen, grandTotal);
      void refreshBlock(plan, startRow, endRow, requestGen).catch(() => undefined);
      return;
    }

    const view = await acquireView(plan.key, plan.viewConfig, plan.route.length === 0);
    const read = await readPlanBlock(plan, view, startRow, endRow);
    if (destroyed || generation !== requestGen) return; // fence: drop
    blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
    finishLoad(params, plan, read.rows, read.total, requestGen, grandTotal);
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
    if (isFlatRoot(plan)) params.api.setRowCount(total, true);
  }

  /** Serve-then-refresh: replace a cache-hit block with a fresh read. */
  async function refreshBlock(
    plan: QueryPlan,
    startRow: number,
    endRow: number,
    requestGen: number,
  ): Promise<void> {
    const view = await acquireView(plan.key, plan.viewConfig, plan.route.length === 0);
    const read = await readPlanBlock(plan, view, startRow, endRow);
    const snap = connection.state;
    if (destroyed || !api || generation !== requestGen) return;
    if (!snap || snap.generation !== requestGen) return;
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
    else if (isFlatRoot(plan)) api.setRowCount(read.total, true);
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
        // FLAT store: refresh SOFT — rows morph in place (no stub blank),
        // and finishLoad/refreshBlock enforce the shrunken/grown count via
        // setRowCount (a soft refresh alone never resizes the lazy store).
        // GROUPED/TREE store: purge — group membership/counts change
        // structurally and setRowCount is forbidden under grouping (AG #28).
        // An armed rollup rebuilds on the next root load either way.
        const grouped =
          (lastRootRequest?.rowGroupCols?.length ?? 0) > 0
          || (opts.treePathFields?.length ?? 0) > 0;
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
    destroy(): void {
      destroyed = true;
      offState();
      if (quickFilterTimer !== null) {
        clearTimeout(quickFilterTimer);
        quickFilterTimer = null;
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
