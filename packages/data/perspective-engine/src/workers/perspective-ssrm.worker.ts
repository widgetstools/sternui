import './perspectiveWorkerPolyfill';
import type { WorkerInbound, WorkerOutbound } from '../ssrm/types';
import { createPerspectiveHost, type PerspectiveHost } from './perspectiveHost';

let host: PerspectiveHost | null = null;
let hostInitPromise: Promise<PerspectiveHost> | null = null;

function emit(msg: WorkerOutbound): void {
  self.postMessage(msg);
}

async function ensureHost(): Promise<PerspectiveHost> {
  if (!hostInitPromise) {
    hostInitPromise = (async () => {
      const h = createPerspectiveHost();
      await h.ready;
      host = h;
      return h;
    })();
  }
  return hostInitPromise;
}

function errorReply(msg: WorkerInbound, error: string): WorkerOutbound | null {
  switch (msg.type) {
    case 'ensureTable':
      return { type: 'ensureTableResult', requestId: msg.requestId, ok: false, error };
    case 'replace':
      return { type: 'replaceResult', requestId: msg.requestId, ok: false, error };
    case 'getRows':
      return { type: 'getRowsResult', requestId: msg.requestId, ok: false, error };
    case 'getFilterValues':
      return { type: 'getFilterValuesResult', requestId: msg.requestId, ok: false, error };
    case 'updateRows':
      return { type: 'updateRowsResult', requestId: msg.requestId, ok: false, error };
    case 'removeRows':
      return { type: 'removeRowsResult', requestId: msg.requestId, ok: false, error };
    case 'applyTransaction':
      return { type: 'applyTransactionResult', requestId: msg.requestId, ok: false, error };
    case 'getAggregates':
      return { type: 'getAggregatesResult', requestId: msg.requestId, ok: false, error };
    case 'queryAll':
      return { type: 'queryAllResult', requestId: msg.requestId, ok: false, error };
    case 'releaseTable':
      return { type: 'releaseTableResult', requestId: msg.requestId, ok: false, error };
    default:
      return null;
  }
}

self.onmessage = async (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;

  try {
    switch (msg.type) {
      case 'ensureTable': {
        const h = await ensureHost();
        await h.ensureTable(msg.config);
        self.postMessage({
          type: 'ensureTableResult',
          requestId: msg.requestId,
          ok: true,
        } satisfies WorkerOutbound);
        break;
      }
      case 'replace': {
        const h = await ensureHost();
        const rowCount = await h.replace(msg.providerId, msg.rows, msg.indexColumn);
        self.postMessage({
          type: 'replaceResult',
          requestId: msg.requestId,
          ok: true,
          rowCount,
        } satisfies WorkerOutbound);
        break;
      }
      case 'getRows': {
        const h = await ensureHost();
        const result = await h.query(msg.request);
        self.postMessage({
          type: 'getRowsResult',
          requestId: msg.requestId,
          ok: true,
          result,
        } satisfies WorkerOutbound);
        break;
      }
      case 'getFilterValues': {
        const h = await ensureHost();
        const values = await h.getFilterValues(msg.providerId, msg.field);
        self.postMessage({
          type: 'getFilterValuesResult',
          requestId: msg.requestId,
          ok: true,
          values,
        } satisfies WorkerOutbound);
        break;
      }
      case 'updateRows': {
        const h = await ensureHost();
        await h.upsertRows(msg.providerId, msg.rows);
        emit({ type: 'dirty', providerId: msg.providerId, at: Date.now(), transaction: { update: msg.rows } });
        self.postMessage({
          type: 'updateRowsResult',
          requestId: msg.requestId,
          ok: true,
        } satisfies WorkerOutbound);
        break;
      }
      case 'removeRows': {
        const h = await ensureHost();
        await h.removeRows(msg.providerId, msg.ids);
        emit({ type: 'dirty', providerId: msg.providerId, at: Date.now() });
        self.postMessage({
          type: 'removeRowsResult',
          requestId: msg.requestId,
          ok: true,
        } satisfies WorkerOutbound);
        break;
      }
      case 'applyTransaction': {
        const h = await ensureHost();
        await h.applyTransaction(msg.request);
        emit({
          type: 'dirty',
          providerId: msg.request.providerId,
          at: Date.now(),
          transaction: {
            add: msg.request.add,
            update: msg.request.update,
          },
        });
        self.postMessage({
          type: 'applyTransactionResult',
          requestId: msg.requestId,
          ok: true,
        } satisfies WorkerOutbound);
        break;
      }
      case 'getAggregates': {
        const h = await ensureHost();
        const result = await h.getAggregates(msg.request);
        self.postMessage({
          type: 'getAggregatesResult',
          requestId: msg.requestId,
          ok: true,
          result,
        } satisfies WorkerOutbound);
        break;
      }
      case 'queryAll': {
        const h = await ensureHost();
        const { rowData, rowCount, pivotResultFields } = await h.queryAll(msg.request);
        self.postMessage({
          type: 'queryAllResult',
          requestId: msg.requestId,
          ok: true,
          rowData,
          rowCount,
          pivotResultFields,
        } satisfies WorkerOutbound);
        break;
      }
      case 'releaseTable': {
        const h = await ensureHost();
        await h.releaseTable(msg.providerId);
        self.postMessage({
          type: 'releaseTableResult',
          requestId: msg.requestId,
          ok: true,
        } satisfies WorkerOutbound);
        break;
      }
      case 'dispose': {
        host = null;
        hostInitPromise = null;
        break;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const reply = errorReply(msg, error);
    if (reply) self.postMessage(reply);
  }
};
