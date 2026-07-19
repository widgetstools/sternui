/**
 * Perspective-backed {@link SsrmEngine} (ADR-ssrm-worker-hosted-engine.md).
 *
 * The dataset lives ONCE in a Perspective `Table` hosted by the provider
 * SharedWorker; this engine runs in the window and holds only proxies. A
 * blotter therefore costs a viewport, not a copy of the book — measured at
 * 2.4 ms for a 100-row block against 5.85 s for a full 20k push.
 *
 * Multi-blotter model: each distinct (filter, sort, group, aggregate, drill
 * path) shape maps to one Perspective `View`, cached and LRU-bounded. Ten
 * blotters sharing a layout share one view; one `table.update()` upstream
 * updates every view incrementally, including MIN/MAX, inside the engine.
 *
 * Group drill-down: AG Grid SSRM owns expand state per window and asks for the
 * children of a path (`groupKeys: ['EMEA','Bonds']`). We serve that with a view
 * filtered to the path and grouped by the NEXT level — expand state is never
 * mirrored into Perspective.
 */

import {
  mapFilterModel,
  mergeFilterPlans,
  quickFilterToPlan,
  rowKeepExpressionToPlan,
  type FilterPlan,
} from '../filters/ssrmFilters.js';
import { absSortExprName } from '../filters/perspectiveExpr.js';
import type { SsrmEngine } from './types.js';
import type {
  PerspectiveClient,
  PerspectiveTable,
  PerspectiveView,
  PerspectiveViewConfig,
} from './perspectiveTypes.js';
import { PerspectiveViewCache, viewCacheKey } from './perspectiveViewCache.js';
import type { DirtyMessage } from '../ssrm/applyWorkerDirtyToGrid.js';
import type {
  AggregateRequest,
  AggregateResult,
  DatasetId,
  DetailRowsRequest,
  FeedConfig,
  QueryAllRequest,
  QueryAllResult,
  SeriesDataRequest,
  SeriesDataResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TransactionRequest,
} from '../ssrm/types.js';

/** Perspective emits the group path under this column on grouped views. */
const ROW_PATH = '__ROW_PATH__';

/** Constant expression used to roll a flat view up to one grand-total row. */
const ALL_EXPR = '__ssrm_all';

/** Group rows carry the child count under this key (see mirrorGroupAgg). */
const CHILD_COUNT = 'childCount';

export interface PerspectiveEngineOpts {
  /** Client proxying the server in the provider SharedWorker. */
  client: PerspectiveClient;
  /** Max concurrently live views before LRU eviction. Default 32. */
  maxViews?: number;
  /**
   * Reuse a table already hosted under this name instead of creating one.
   * This is what makes the Nth blotter cost an attach rather than a copy.
   */
  attachToHostedTable?: boolean;
}

interface DatasetState {
  table: PerspectiveTable;
  config: FeedConfig;
  views: PerspectiveViewCache;
}

export function createPerspectiveEngine(opts: PerspectiveEngineOpts): SsrmEngine {
  const { client } = opts;
  const datasets = new Map<DatasetId, DatasetState>();
  let dirtyHandler: ((msg: DirtyMessage) => void) | null = null;

  const state = (dataset: DatasetId): DatasetState => {
    const s = datasets.get(dataset);
    if (!s) throw new Error(`[perspectiveEngine] dataset '${dataset}' not configured`);
    return s;
  };

  /**
   * Resolve a view for one request shape, creating and caching on miss.
   * Also attaches the `on_update` → dirty bridge exactly once per view.
   */
  async function resolveView(
    ds: DatasetState,
    dataset: DatasetId,
    config: PerspectiveViewConfig,
    groupKeys: readonly string[],
  ): Promise<PerspectiveView> {
    const key = viewCacheKey({
      dataset,
      groupBy: config.group_by ?? [],
      splitBy: config.split_by ?? [],
      filter: config.filter ?? [],
      filterOp: config.filter_op ?? 'and',
      sort: config.sort ?? [],
      aggregates: config.aggregates ?? {},
      expressions: config.expressions ?? {},
      groupKeys,
    });

    const cached = ds.views.peek(key);
    if (cached) return cached;

    const view = await ds.table.view(config);
    await ds.views.put(key, view);

    // Coalescing lives downstream in the client (throttleMs); here we only
    // announce that this shape changed.
    if (!ds.views.hasSubscription(key)) {
      ds.views.markSubscribed(key);
      try {
        await view.on_update(() => {
          dirtyHandler?.({ type: 'dirty', at: Date.now() });
        });
      } catch {
        /* view evicted before subscribe landed */
      }
    }
    return view;
  }

  /** Columnar → row-oriented. Perspective returns `{col: [...values]}`. */
  function toRows(columns: Record<string, unknown[]>): Record<string, unknown>[] {
    const fields = Object.keys(columns);
    if (fields.length === 0) return [];
    const length = columns[fields[0]!]?.length ?? 0;
    const rows: Record<string, unknown>[] = new Array(length);
    for (let i = 0; i < length; i++) {
      const row: Record<string, unknown> = {};
      for (const f of fields) row[f] = columns[f]![i];
      rows[i] = row;
    }
    return rows;
  }

  /** AG Grid filter/quick-filter/keep-expression → one Perspective plan. */
  function planFor(req: SsrmGetRowsRequest): FilterPlan {
    const plans: FilterPlan[] = [mapFilterModel(req.filterModel)];
    if (req.quickFilterText) {
      plans.push(quickFilterToPlan(req.quickFilterText, req.quickFilterFields ?? []));
    }
    if (req.rowKeepExpression) {
      plans.push(rowKeepExpressionToPlan(req.rowKeepExpression));
    }
    return mergeFilterPlans(plans);
  }

  /** Build the Perspective view config for one SSRM request. */
  function configFor(
    ds: DatasetState,
    req: SsrmGetRowsRequest,
    plan: FilterPlan,
  ): { config: PerspectiveViewConfig; isGroupHeader: boolean } {
    const rowGroupCols = req.rowGroupCols ?? [];
    const groupKeys = req.groupKeys ?? [];
    const isGroupHeader =
      rowGroupCols.length > 0 && groupKeys.length < rowGroupCols.length;

    // Drill path → equality filters on ancestor fields. This, not Perspective
    // expand state, is how AG Grid's per-window tree navigation is served.
    const filter: Array<[string, string, unknown]> = [
      ...((plan.filters ?? []) as Array<[string, string, unknown]>),
    ];
    for (let i = 0; i < groupKeys.length; i++) {
      const field = rowGroupCols[i]?.field;
      if (field) filter.push([field, '==', groupKeys[i]!]);
    }

    const aggregates: Record<string, string> = {};
    for (const vc of req.valueCols ?? []) {
      if (vc.field && vc.aggFunc) aggregates[vc.field] = vc.aggFunc;
    }

    const expressions: Record<string, string> = {
      ...(ds.config.calcExpressions ?? {}),
      ...(plan.expressions ?? {}),
    };

    const sort: Array<[string, string]> = [];
    for (const s of req.sortModel ?? []) {
      // abs sort reads a derived expression column, not the raw field.
      const col = s.abs || req.absSort ? absSortExprName(s.colId) : s.colId;
      if (s.abs || req.absSort) {
        expressions[col] = `abs("${s.colId}")`;
      }
      sort.push([col, s.sort]);
    }

    const config: PerspectiveViewConfig = {
      filter,
      filter_op: plan.filterOp ?? 'and',
      sort,
      aggregates,
      expressions,
    };
    if (isGroupHeader) {
      const groupField = rowGroupCols[groupKeys.length]?.field;
      if (groupField) config.group_by = [groupField];
      // Child count for the group row — Perspective counts the key column.
      config.aggregates = { ...aggregates, [ds.config.index]: 'count' };
    }
    return { config, isGroupHeader };
  }

  async function getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> {
    const ds = state(req.dataset);
    const plan = planFor(req);
    const { config, isGroupHeader } = configFor(ds, req, plan);
    const groupKeys = req.groupKeys ?? [];
    const view = await resolveView(ds, req.dataset, config, groupKeys);

    // A grouped Perspective view puts the grand total at row 0; AG Grid asks
    // only for children, so shift the window past it and drop it from counts.
    const rootOffset = isGroupHeader ? 1 : 0;
    const start = Math.max(0, req.startRow) + rootOffset;
    const end = Math.max(req.startRow, req.endRow) + rootOffset;

    const [columns, total] = await Promise.all([
      view.to_columns({ start_row: start, end_row: end }),
      view.num_rows(),
    ]);

    let rowData = toRows(columns);
    const rowCount = Math.max(0, total - rootOffset);

    if (isGroupHeader) {
      const groupField = (req.rowGroupCols ?? [])[groupKeys.length]?.field ?? '';
      rowData = rowData.map((row) => {
        const path = row[ROW_PATH];
        const label = Array.isArray(path) ? path[path.length - 1] : path;
        const shaped: Record<string, unknown> = { ...row };
        delete shaped[ROW_PATH];
        shaped[groupField] = label;
        shaped.__ssrmGroupKey = String(label ?? '');
        shaped[CHILD_COUNT] = row[ds.config.index] ?? 0;
        return shaped;
      });
    }

    const result: SsrmGetRowsResult = { rowData, rowCount };

    // Root-level requests carry filtered totals for share-of-total formatters.
    if (groupKeys.length === 0 && (req.valueCols?.length ?? 0) > 0) {
      const rollup = await rootRollup(ds, req, plan, isGroupHeader ? view : null);
      if (rollup) {
        result.totals = rollup.totals;
        result.aggregates = rollup.aggregates;
        result.filteredRowCount = rollup.filteredRowCount;
        result.rowData = rowData.map((r) => ({
          ...r,
          __ssrm_aggs: rollup.aggregates,
          __ssrm_sums: rollup.totals,
        }));
      }
    }
    return result;
  }

  /**
   * Grand totals over the filtered set.
   *
   * A grouped view already has them at row 0. A flat view has no total row, so
   * roll it up with a constant expression as the single group level.
   */
  async function rootRollup(
    ds: DatasetState,
    req: SsrmGetRowsRequest,
    plan: FilterPlan,
    groupedView: PerspectiveView | null,
  ): Promise<{
    totals: Record<string, unknown>;
    aggregates: Record<string, Record<string, unknown>>;
    filteredRowCount: number;
  } | null> {
    const aggregates: Record<string, string> = {};
    for (const vc of req.valueCols ?? []) {
      if (vc.field && vc.aggFunc) aggregates[vc.field] = vc.aggFunc;
    }
    if (Object.keys(aggregates).length === 0) return null;

    let view = groupedView;
    let created = false;
    if (!view) {
      const config: PerspectiveViewConfig = {
        filter: [...((plan.filters ?? []) as Array<[string, string, unknown]>)],
        filter_op: plan.filterOp ?? 'and',
        group_by: [ALL_EXPR],
        aggregates: { ...aggregates, [ds.config.index]: 'count' },
        expressions: {
          ...(ds.config.calcExpressions ?? {}),
          ...(plan.expressions ?? {}),
          [ALL_EXPR]: '1',
        },
      };
      view = await resolveView(ds, req.dataset, config, ['__rollup__']);
      created = true;
    }
    void created;

    const cols = await view.to_columns({ start_row: 0, end_row: 1 });
    const rows = toRows(cols);
    const root = rows[0];
    if (!root) return null;

    const totals: Record<string, unknown> = {};
    const aggMap: Record<string, Record<string, unknown>> = {};
    for (const vc of req.valueCols ?? []) {
      if (!vc.field) continue;
      totals[vc.field] = root[vc.field];
      aggMap[vc.field] = { [vc.aggFunc]: root[vc.field] };
    }
    return {
      totals,
      aggregates: aggMap,
      filteredRowCount: Number(root[ds.config.index] ?? 0),
    };
  }

  return {
    async configure(config: FeedConfig): Promise<void> {
      const existing = datasets.get(config.dataset);
      if (existing) {
        await existing.views.dispose();
        datasets.delete(config.dataset);
      }

      let table: PerspectiveTable;
      const hosted = opts.attachToHostedTable
        ? await client.get_hosted_table_names()
        : [];
      if (hosted.includes(config.dataset)) {
        // Nth blotter: attach to the book already in the worker — no copy.
        table = await client.open_table(config.dataset);
      } else {
        table = await client.table(config.schema, {
          index: config.index,
          name: config.dataset,
        });
      }

      datasets.set(config.dataset, {
        table,
        config,
        views: new PerspectiveViewCache({ maxViews: opts.maxViews }),
      });
    },

    async setRowData(dataset: DatasetId, rows: Record<string, unknown>[]): Promise<number> {
      const ds = state(dataset);
      await ds.table.replace(rows);
      return ds.table.size();
    },

    getRows,

    async getFilterValues(dataset: DatasetId, field: string): Promise<(string | null)[]> {
      const ds = state(dataset);
      // Distinct values = group by the column and read the group labels.
      const view = await resolveView(
        ds,
        dataset,
        { group_by: [field], aggregates: { [ds.config.index]: 'count' } },
        ['__distinct__', field],
      );
      const cols = await view.to_columns({ start_row: 1, end_row: 100_001 });
      return toRows(cols).map((r) => {
        const path = r[ROW_PATH];
        const label = Array.isArray(path) ? path[path.length - 1] : path;
        return label == null ? null : String(label);
      });
    },

    async updateRows(dataset: DatasetId, rows: Record<string, unknown>[]): Promise<void> {
      await state(dataset).table.update(rows);
    },

    async removeRows(dataset: DatasetId, ids: (string | number)[]): Promise<void> {
      await state(dataset).table.remove(ids);
    },

    async applyTransaction(request: TransactionRequest): Promise<void> {
      const ds = state(request.dataset);
      const add = request.add ?? [];
      const update = request.update ?? [];
      // `index` makes update and add the same operation — a keyed upsert.
      if (add.length > 0 || update.length > 0) {
        await ds.table.update([...add, ...update]);
      }
      const remove = request.remove ?? [];
      if (remove.length > 0) await ds.table.remove(remove as (string | number)[]);
    },

    async getAggregates(request: AggregateRequest): Promise<AggregateResult> {
      const ds = state(request.dataset);
      const rollup = await rootRollup(
        ds,
        {
          dataset: request.dataset,
          startRow: 0,
          endRow: 1,
          rowGroupCols: [],
          valueCols: request.valueCols ?? [],
          pivotCols: [],
          pivotMode: false,
          groupKeys: [],
          filterModel: request.filterModel ?? {},
          sortModel: [],
        } as SsrmGetRowsRequest,
        mapFilterModel(request.filterModel),
        null,
      );
      return {
        totals: rollup?.totals ?? {},
        aggregates: rollup?.aggregates ?? {},
        rowCount: rollup?.filteredRowCount ?? 0,
      };
    },

    async queryAll(request: QueryAllRequest): Promise<QueryAllResult> {
      const ds = state(request.dataset);
      const plan = mapFilterModel(request.filterModel);
      const view = await resolveView(
        ds,
        request.dataset,
        {
          filter: [...((plan.filters ?? []) as Array<[string, string, unknown]>)],
          filter_op: plan.filterOp ?? 'and',
          expressions: { ...(ds.config.calcExpressions ?? {}), ...(plan.expressions ?? {}) },
        },
        ['__queryAll__'],
      );
      const cols = await view.to_columns();
      return { rowData: toRows(cols) } as QueryAllResult;
    },

    async getSeriesData(_request: SeriesDataRequest): Promise<SeriesDataResult> {
      throw new Error('[perspectiveEngine] getSeriesData not implemented (Phase 1)');
    },

    async getDetailRows(_request: DetailRowsRequest): Promise<Record<string, unknown>[]> {
      throw new Error('[perspectiveEngine] getDetailRows not implemented (Phase 1)');
    },

    setDirtyHandler(handler: ((msg: DirtyMessage) => void) | null): void {
      dirtyHandler = handler;
    },

    dispose(): void {
      dirtyHandler = null;
      for (const ds of datasets.values()) {
        void ds.views.dispose();
        // The table is shared with other windows — never delete it here.
      }
      datasets.clear();
    },
  };
}
