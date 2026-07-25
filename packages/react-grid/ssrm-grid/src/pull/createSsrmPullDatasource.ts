/**
 * createSsrmPullDatasource — AG Grid server-side datasource over the
 * SSRM provider's hosted Perspective table (the pull plane).
 *
 * Contracts (docs/SSRM_PROVIDER_V2_DESIGN.md, P2):
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
 * • **Ticks never purge.** `view.on_update` (throttled trailing)
 *   refetches the cached blocks of the active query shape and patches
 *   changed rows via `applyServerSideTransactionAsync`, keyed by the
 *   provider's `keyColumn` (the grid MUST set `getRowId` accordingly).
 *   Update transactions cannot re-order rows — ordering drift under an
 *   active sort between user refreshes is accepted in P2 (TODO(P4):
 *   periodic ordered block refresh).
 * • Row-delta materialization is width-gated by design fact #5 — the
 *   plain path here uses bare `on_update` → refetch, no row deltas.
 */

import type {
  GridApi,
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { BlockCache } from './BlockCache.js';
import { buildQueryPlan, type QueryPlan } from './buildQueryPlan.js';
import { ViewCache } from './ViewCache.js';
import type { PullDatasourceConnection, PullView } from './types.js';

export interface SsrmPullDatasourceOpts {
  connection: PullDatasourceConnection;
  /**
   * Row identity — the provider config's `keyColumn`. The consuming
   * grid MUST set `getRowId: ({ data }) => String(data[keyColumn])`
   * (tick patches are keyed update transactions).
   */
  keyColumn: string;
  /** Columns to read per block; omit for every table column. */
  columns?: string[];
  /** Live-view LRU capacity. Default 8. */
  maxViews?: number;
  /** Viewport block LRU capacity. Default 12. */
  maxBlocks?: number;
  /** Tick→refetch trailing throttle. Default 250ms. */
  tickRefreshMs?: number;
  /** Seeding rowCount growth trailing throttle. Default 200ms. */
  seedCountRefreshMs?: number;
  /** Block span when the grid omits `endRow`. Default 100. */
  defaultBlockSize?: number;
  warn?: (message: string) => void;
}

export interface SsrmPullDatasource extends IServerSideDatasource {
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
  const warnedPlans = new Set<string>();

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

  const readRange = async (
    view: PullView,
    startRow: number,
    endRow: number,
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
    const total = await view.num_rows();
    const rows =
      startRow >= total
        ? []
        : ((await view.to_json({ start_row: startRow, end_row: endRow })) as Record<
            string,
            unknown
          >[]);
    return { rows, total };
  };

  const acquireView = async (plan: QueryPlan): Promise<PullView> => {
    const view = await viewCache.acquire(plan.key, plan.viewConfig, async (config) => {
      const table = await connection.openTable();
      return table.view(config);
    });
    await ensureTickSubscription(plan.key, view);
    return view;
  };

  /** Exactly one live `on_update` subscription — on the active shape. */
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
    opts.tickRefreshMs ?? 250,
  );

  async function runTickRefresh(): Promise<void> {
    const sub = tickSub;
    const snap = connection.state;
    if (destroyed || !api || !sub || !snap || snap.generation !== generation) return;
    const requestGen = generation;
    let latestTotal: number | null = null;
    for (const { startRow, block } of blockCache.entriesFor(sub.key, requestGen)) {
      let read: { rows: Record<string, unknown>[]; total: number };
      try {
        read = await readRange(sub.view, startRow, block.endRow);
      } catch {
        return; // view evicted/deleted mid-read — the next tick repairs
      }
      if (destroyed || generation !== requestGen) return;
      blockCache.set(sub.key, startRow, { ...read, generation: requestGen, endRow: block.endRow });
      const changed = diffRowsByKey(block.rows, read.rows, keyColumn);
      if (changed.length > 0) api.applyServerSideTransactionAsync({ update: changed });
      latestTotal = read.total;
    }
    const now = connection.state;
    if (latestTotal !== null && now?.phase === 'live' && now.generation === requestGen) {
      api.setRowCount(latestTotal, true);
    }
  }

  // ─── DatasetState wiring ──────────────────────────────────────────

  const scheduleSeedCount = throttleTrailing(() => {
    const snap = connection.state;
    if (destroyed || !api || !snap) return;
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

    const plan = buildQueryPlan(params.request, {
      keyColumn,
      ...(opts.columns ? { columns: opts.columns } : {}),
    });
    if (plan.unsupportedFilters.length > 0 && !warnedPlans.has(plan.key)) {
      warnedPlans.add(plan.key);
      warn(`[ssrm-pull] unsupported filter clauses ignored (P4): ${plan.unsupportedFilters.join('; ')}`);
    }
    if (plan.kind === 'group-level') {
      // TODO(P4): serve group rows via Perspective group_by + aggregates.
      warn('[ssrm-pull] row-group level requests are not served yet (P4) — failing the load');
      params.fail();
      return;
    }

    const startRow = params.request.startRow ?? 0;
    const endRow = params.request.endRow ?? startRow + defaultBlockSize;
    const cached = blockCache.get(plan.key, startRow, requestGen);
    if (cached) {
      finishLoad(params, cached.rows, cached.total, requestGen);
      void refreshBlock(plan, startRow, endRow, requestGen).catch(() => undefined);
      return;
    }

    const view = await acquireView(plan);
    const read = await readRange(view, startRow, endRow);
    if (destroyed || generation !== requestGen) return; // fence: drop
    blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
    finishLoad(params, read.rows, read.total, requestGen);
  }

  /** Deliver one block honoring the DatasetState rowCount contract. */
  function finishLoad(
    params: IServerSideGetRowsParams,
    rows: Record<string, unknown>[],
    total: number,
    requestGen: number,
  ): void {
    const snap = connection.state;
    if (!snap || snap.generation !== requestGen) return; // fence: drop
    if (snap.phase === 'seeding') {
      params.success({ rowData: rows });
      // An under-filled block makes AG's lazy cache mark the row count
      // final — reopen it; the seed is still growing the book.
      params.api.setRowCount(total, false);
      return;
    }
    params.success({ rowData: rows, rowCount: total });
  }

  /** Serve-then-refresh: replace a cache-hit block with a fresh read. */
  async function refreshBlock(
    plan: QueryPlan,
    startRow: number,
    endRow: number,
    requestGen: number,
  ): Promise<void> {
    const view = await acquireView(plan);
    const read = await readRange(view, startRow, endRow);
    const snap = connection.state;
    if (destroyed || !api || generation !== requestGen) return;
    if (!snap || snap.generation !== requestGen) return;
    blockCache.set(plan.key, startRow, { ...read, generation: requestGen, endRow });
    // Index-addressed replacement: fills, reorders and updates the
    // block in place — loaded rows stay visible (never a purge).
    api.applyServerSideRowData({
      startRow,
      successParams:
        snap.phase === 'seeding'
          ? { rowData: read.rows }
          : { rowData: read.rows, rowCount: read.total },
    });
    if (snap.phase === 'seeding') api.setRowCount(read.total, false);
  }

  return {
    getRows(params: IServerSideGetRowsParams): void {
      void serveRows(params).catch((err) => {
        if (destroyed) return;
        warn(`[ssrm-pull] getRows failed: ${err instanceof Error ? err.message : String(err)}`);
        params.fail();
      });
    },
    destroy(): void {
      destroyed = true;
      offState();
      if (tickSub?.id != null) {
        void tickSub.view.remove_update(tickSub.id).catch(() => undefined);
      }
      tickSub = null;
      viewCache.clear();
      blockCache.clear();
      api = null;
    },
  };
}

// ─── small pure helpers ──────────────────────────────────────────────

/** Trailing-edge throttle: at most one `fn` per `ms`, always deferred. */
function throttleTrailing(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
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
