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
  WorkerInbound,
  WorkerOutbound,
} from './types';

export type DirtyHandler = (msg: Extract<WorkerOutbound, { type: 'dirty' }>) => void;

const RPC_RESULT_TYPES = new Set<WorkerOutbound['type']>([
  'ensureTableResult',
  'replaceResult',
  'getRowsResult',
  'getFilterValuesResult',
  'updateRowsResult',
  'removeRowsResult',
  'applyTransactionResult',
  'getAggregatesResult',
  'queryAllResult',
  'releaseTableResult',
]);

export function createWorkerClient() {
  const worker = new Worker(
    new URL('../workers/perspective-ssrm.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let onDirty: DirtyHandler | null = null;

  worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
    const msg = ev.data;
    if (msg.type === 'dirty') return onDirty?.(msg);
    if (!('requestId' in msg) || !RPC_RESULT_TYPES.has(msg.type)) return;
    const p = pending.get(msg.requestId);
    if (!p) return;
    pending.delete(msg.requestId);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error));
  };

  function rpc<T>(message: WorkerInbound): Promise<T> {
    return new Promise((resolve, reject) => {
      pending.set(message.requestId, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage(message);
    });
  }

  return {
    ensureTable(config: TableConfig) {
      return rpc<{ ok: true }>({
        type: 'ensureTable',
        requestId: crypto.randomUUID(),
        config,
      }).then(() => undefined);
    },
    replace(providerId: ProviderTableId, rows: Record<string, unknown>[], indexColumn?: string) {
      return rpc<{ ok: true; rowCount: number }>({
        type: 'replace',
        requestId: crypto.randomUUID(),
        providerId,
        rows,
        indexColumn,
      }).then((r) => r.rowCount);
    },
    getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> {
      return rpc<{ ok: true; result: SsrmGetRowsResult }>({
        type: 'getRows',
        requestId: crypto.randomUUID(),
        request,
      }).then((r) => r.result);
    },
    getFilterValues(providerId: ProviderTableId, field: string): Promise<string[]> {
      return rpc<{ ok: true; values: string[] }>({
        type: 'getFilterValues',
        requestId: crypto.randomUUID(),
        providerId,
        field,
      }).then((r) => r.values);
    },
    updateRows(providerId: ProviderTableId, rows: Record<string, unknown>[]): Promise<void> {
      return rpc<{ ok: true }>({
        type: 'updateRows',
        requestId: crypto.randomUUID(),
        providerId,
        rows,
      }).then(() => undefined);
    },
    removeRows(providerId: ProviderTableId, ids: (string | number)[]): Promise<void> {
      return rpc<{ ok: true }>({
        type: 'removeRows',
        requestId: crypto.randomUUID(),
        providerId,
        ids,
      }).then(() => undefined);
    },
    applyTransaction(request: TransactionRequest): Promise<void> {
      return rpc<{ ok: true }>({
        type: 'applyTransaction',
        requestId: crypto.randomUUID(),
        request,
      }).then(() => undefined);
    },
    getAggregates(request: AggregateRequest): Promise<AggregateResult> {
      return rpc<{ ok: true; result: AggregateResult }>({
        type: 'getAggregates',
        requestId: crypto.randomUUID(),
        request,
      }).then((r) => r.result);
    },
    queryAll(request: QueryAllRequest): Promise<QueryAllResult> {
      return rpc<{
        ok: true;
        rowData: Record<string, unknown>[];
        rowCount: number;
        pivotResultFields?: string[];
      }>({
        type: 'queryAll',
        requestId: crypto.randomUUID(),
        request,
      }).then((r) => ({
        rowData: r.rowData,
        rowCount: r.rowCount,
        pivotResultFields: r.pivotResultFields,
      }));
    },
    releaseTable(providerId: ProviderTableId): Promise<void> {
      return rpc<{ ok: true }>({
        type: 'releaseTable',
        requestId: crypto.randomUUID(),
        providerId,
      }).then(() => undefined);
    },
    setDirtyHandler(h: DirtyHandler) {
      onDirty = h;
    },
    dispose() {
      worker.postMessage({ type: 'dispose', requestId: crypto.randomUUID() });
      worker.terminate();
    },
  };
}

export type PerspectiveWorkerClient = ReturnType<typeof createWorkerClient>;
