import perspective from '@finos/perspective';
import type { Client, Table } from '@finos/perspective';
// @ts-expect-error Vite ?url imports resolve at app bundle time
import SERVER_WASM from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
// @ts-expect-error Vite ?url imports resolve at app bundle time
import CLIENT_WASM from '@finos/perspective/dist/wasm/perspective-js.wasm?url';
// @ts-expect-error Vite ?url imports resolve at app bundle time
import SERVER_WORKER_URL from '@finos/perspective/dist/cdn/perspective-server.worker.js?url';

import {
  inferSchemaFromRows,
  registerProviderTableMeta,
  getSchema,
  getIndexColumn,
  getStringColumns,
  clearProviderTableMeta,
} from '../schemaRegistry';
import type {
  AggregateRequest,
  AggregateResult,
  ProviderTableId,
  QueryAllRequest,
  QueryAllResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TableConfig,
  TransactionRequest,
} from '../ssrm/types';
import { mapFilterModel, mergeFilterPlans, quickFilterToPlan } from './ssrmFilters';
import { collectAggregateSpecs } from './sumTotals';
import { absSortExprName } from './perspectiveExpr';

export interface PerspectiveHost {
  ready: Promise<void>;
  ensureTable(config: TableConfig): Promise<void>;
  replace(providerId: ProviderTableId, rows: Record<string, unknown>[], indexColumn?: string): Promise<number>;
  upsertRows(providerId: ProviderTableId, rows: Record<string, unknown>[]): Promise<void>;
  removeRows(providerId: ProviderTableId, ids: (string | number)[]): Promise<void>;
  applyTransaction(request: TransactionRequest): Promise<void>;
  query(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  getAggregates(request: AggregateRequest): Promise<AggregateResult>;
  queryAll(request: QueryAllRequest): Promise<QueryAllResult>;
  getFilterValues(providerId: ProviderTableId, field: string): Promise<string[]>;
  releaseTable(providerId: ProviderTableId): Promise<void>;
  size(providerId: ProviderTableId): Promise<number>;
}

export interface PerspectiveHostOptions {
  client?: Client;
}

type TableInput = Parameters<Client['table']>[0];

async function createClient(): Promise<Client> {
  perspective.init_server(fetch(SERVER_WASM));
  perspective.init_client(fetch(CLIENT_WASM));
  const nestedWorker = new Worker(SERVER_WORKER_URL, { type: 'classic' });
  return perspective.worker(Promise.resolve(nestedWorker));
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function aggregateFilteredRows(
  rows: Record<string, unknown>[],
  valueCols: AggregateRequest['valueCols'],
): AggregateResult {
  const aggregates: Record<string, Record<string, unknown>> = {};
  const totals: Record<string, unknown> = {};

  for (const valueCol of valueCols) {
    const field = valueCol.field;
    if (!field) continue;
    const rawAgg = valueCol.aggFunc || 'sum';
    const nums = rows
      .map((row) => numberOrNull(row[field]))
      .filter((n): n is number => n != null);

    let value: unknown;
    switch (rawAgg) {
      case 'avg':
        value = nums.length === 0 ? null : nums.reduce((a, n) => a + n, 0) / nums.length;
        break;
      case 'count':
        value = rows.filter((row) => row[field] != null).length;
        break;
      case 'min':
        value = nums.length === 0 ? null : Math.min(...nums);
        break;
      case 'max':
        value = nums.length === 0 ? null : Math.max(...nums);
        break;
      default:
        value = nums.reduce((a, n) => a + n, 0);
        break;
    }
    if (!aggregates[field]) aggregates[field] = {};
    aggregates[field][rawAgg] = value;
    if (rawAgg === 'sum') totals[field] = value;
  }

  return { totals, aggregates, rowCount: rows.length };
}

function buildLeafViewConfig(request: SsrmGetRowsRequest, providerId: ProviderTableId) {
  const schema = getSchema(providerId);
  const columns = Object.keys(schema);
  const filterPlan = mergeFilterPlans([
    mapFilterModel(request.filterModel),
    ...(request.quickFilterText
      ? [quickFilterToPlan(request.quickFilterText, getStringColumns(providerId))]
      : []),
  ]);

  const sort: [string, 'asc' | 'desc'][] = (request.sortModel ?? []).map((s) => {
    const field = request.absSort ? absSortExprName(s.colId) : s.colId;
    return [field, s.sort];
  });

  return {
    columns,
    filter: filterPlan.filters,
    filter_op: filterPlan.filterOp ?? 'and' as const,
    sort: sort.length > 0 ? sort : undefined,
    postPredicate: filterPlan.postPredicate,
  };
}

export function createPerspectiveHost(options: PerspectiveHostOptions = {}): PerspectiveHost {
  let client: Client | null = options.client ?? null;
  const tables = new Map<ProviderTableId, Table>();
  const tableConfigs = new Map<ProviderTableId, TableConfig>();

  const ready = (async () => {
    if (!client) {
      client = await createClient();
    }
  })();

  async function ensureClient(): Promise<Client> {
    await ready;
    return client!;
  }

  async function ensureTable(providerId: ProviderTableId): Promise<Table> {
    const existing = tables.get(providerId);
    if (existing) return existing;

    const config = tableConfigs.get(providerId) ?? { providerId };
    const indexColumn = config.indexColumn ?? getIndexColumn(providerId);
    const schema = getSchema(providerId);
    const c = await ensureClient();

    const table = Object.keys(schema).length > 0
      ? await c.table(schema as unknown as TableInput, { index: indexColumn, name: providerId })
      : await c.table({ id: 'string' } as unknown as TableInput, { index: 'id', name: providerId });

    tables.set(providerId, table);
    return table;
  }

  const host: PerspectiveHost = {
    ready,

    async ensureTable(config: TableConfig): Promise<void> {
      tableConfigs.set(config.providerId, config);
      if (config.indexColumn) {
        registerProviderTableMeta({
          providerId: config.providerId,
          schema: getSchema(config.providerId),
          indexColumn: config.indexColumn,
        });
      }
    },

    async replace(providerId, rows, indexColumn): Promise<number> {
      const { schema, indexColumn: resolvedIndex } = inferSchemaFromRows(rows, indexColumn);
      registerProviderTableMeta({ providerId, schema, indexColumn: resolvedIndex });
      tableConfigs.set(providerId, { providerId, indexColumn: resolvedIndex });

      const existing = tables.get(providerId);
      if (existing) {
        if (rows.length > 0) {
          await existing.replace(rows);
        } else {
          await existing.clear();
        }
        return Number(await existing.size());
      }

      const c = await ensureClient();
      const table = rows.length > 0
        ? await c.table(rows, { index: resolvedIndex, name: providerId })
        : await c.table(schema as unknown as TableInput, { index: resolvedIndex, name: providerId });
      tables.set(providerId, table);
      return Number(await table.size());
    },

    async upsertRows(providerId, rows): Promise<void> {
      const table = await ensureTable(providerId);
      await table.update(rows);
    },

    async removeRows(providerId, ids): Promise<void> {
      if (ids.length === 0) return;
      const table = await ensureTable(providerId);
      await table.remove(ids);
    },

    async applyTransaction(request): Promise<void> {
      const { providerId, add, update, remove } = request;
      const table = await ensureTable(providerId);
      if (remove?.length) await table.remove(remove);
      const upserts = [...(add ?? []), ...(update ?? [])];
      if (upserts.length) await table.update(upserts);
    },

    async query(request): Promise<SsrmGetRowsResult> {
      const { providerId } = request;
      const table = await ensureTable(providerId);

      // Phase 0/1: leaf-only path. Group/pivot deferred to Phase 2 query parity.
      if (request.rowGroupCols.length > 0 || request.pivotMode) {
        return {
          rowData: [],
          rowCount: 0,
          pivotResultFields: [],
        };
      }

      const leafConfig = buildLeafViewConfig(request, providerId);
      const view = await table.view({
        columns: leafConfig.columns,
        filter: leafConfig.filter,
        filter_op: leafConfig.filter_op,
        sort: leafConfig.sort,
      });

      try {
        let jsonRows = (await view.to_json()) as Record<string, unknown>[];
        if (leafConfig.postPredicate) {
          jsonRows = jsonRows.filter(leafConfig.postPredicate);
        }
        const rowCount = jsonRows.length;
        const page = jsonRows.slice(request.startRow, request.endRow);

        let result: SsrmGetRowsResult = { rowData: page, rowCount };

        const specs = collectAggregateSpecs(request);
        if (specs.length > 0) {
          try {
            const agg = await host.getAggregates({
              providerId,
              filterModel: request.filterModel,
              quickFilterText: request.quickFilterText,
              valueCols: specs.map((s) => ({
                id: `${s.field}:${s.aggFunc}`,
                field: s.field,
                aggFunc: s.aggFunc,
              })),
            });
            result = {
              ...result,
              totals: agg.totals,
              aggregates: agg.aggregates,
              filteredRowCount: agg.rowCount,
              rowData: page.map((row) => ({
                ...row,
                __ssrm_aggs: agg.aggregates,
                __ssrm_sums: agg.totals,
              })),
            };
          } catch {
            // aggregates optional
          }
        }

        return result;
      } finally {
        view.delete();
      }
    },

    async getAggregates(request): Promise<AggregateResult> {
      const table = await ensureTable(request.providerId);
      const leafConfig = buildLeafViewConfig(
        {
          ...request,
          providerId: request.providerId,
          startRow: 0,
          endRow: Number.MAX_SAFE_INTEGER,
          rowGroupCols: [],
          valueCols: request.valueCols,
          pivotCols: [],
          pivotMode: false,
          groupKeys: [],
          sortModel: [],
        },
        request.providerId,
      );
      const view = await table.view({
        columns: leafConfig.columns,
        filter: leafConfig.filter,
        filter_op: leafConfig.filter_op,
      });
      try {
        let jsonRows = (await view.to_json()) as Record<string, unknown>[];
        if (leafConfig.postPredicate) {
          jsonRows = jsonRows.filter(leafConfig.postPredicate);
        }
        return aggregateFilteredRows(jsonRows, request.valueCols);
      } finally {
        view.delete();
      }
    },

    async queryAll(request): Promise<QueryAllResult> {
      const limit = request.limit ?? 50_000;
      const result = await host.query({
        providerId: request.providerId,
        startRow: 0,
        endRow: limit,
        rowGroupCols: request.rowGroupCols ?? [],
        valueCols: request.valueCols ?? [],
        pivotCols: request.pivotCols ?? [],
        pivotMode: Boolean(request.pivotMode),
        groupKeys: request.groupKeys ?? [],
        filterModel: request.filterModel,
        sortModel: request.sortModel,
        quickFilterText: request.quickFilterText,
        treeData: request.treeData,
        absSort: request.absSort,
      });
      return {
        rowData: result.rowData,
        rowCount: result.rowCount,
        pivotResultFields: result.pivotResultFields,
      };
    },

    async getFilterValues(providerId, field): Promise<string[]> {
      const table = await ensureTable(providerId);
      const view = await table.view({ columns: [field] });
      try {
        const jsonRows = (await view.to_json()) as Record<string, unknown>[];
        const values = new Set<string>();
        for (const row of jsonRows) {
          const v = row[field];
          if (v != null && v !== '') values.add(String(v));
        }
        return [...values].sort();
      } finally {
        view.delete();
      }
    },

    async releaseTable(providerId): Promise<void> {
      const table = tables.get(providerId);
      if (table) {
        await table.delete();
        tables.delete(providerId);
      }
      tableConfigs.delete(providerId);
      clearProviderTableMeta(providerId);
    },

    async size(providerId): Promise<number> {
      const table = tables.get(providerId);
      if (!table) return 0;
      return Number(await table.size());
    },
  };

  return host;
}
