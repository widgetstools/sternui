/**
 * connectSsrmProvider — the window side of the SSRM provider worker.
 *
 * Opens BOTH ports to the ONE SharedWorker
 * (`starui-ssrm:{appId}:{providerId}`):
 *
 * • a control port — `SsrmControlClient` (configure / restart /
 *   DatasetState broadcasts); configure is idempotent worker-side
 *   (first configure wins), so every window just sends its config;
 * • a data port — a stock `@finos/perspective` client
 *   (`perspective.worker(sharedWorker)`) reading THE hosted table
 *   directly. The worker discriminates the dialects on each port's
 *   first message (see host-data `installSsrmWorker`).
 *
 * See docs/SSRM_PROVIDER_V2_DESIGN.md (P2).
 */

import {
  SsrmControlClient,
  ssrmWorkerName,
  type DatasetStateSnapshot,
  type SsrmDatasetConfig,
} from '@starui/host-data/runtime/ssrm';
import type { PullDatasourceConnection, PullTable } from './types.js';

/** What `connectSsrmProvider` needs from a SharedWorker (test seam). */
export interface SharedWorkerHandle {
  port: MessagePort;
}

/** Perspective-client surface the connection uses (test seam). */
export interface SsrmDataClient {
  open_table(name: string): Promise<unknown>;
  terminate?(): unknown;
}

export interface ConnectSsrmProviderOpts {
  appId: string;
  providerId: string;
  /** The bundled worker asset URL (`data-services-ssrm-worker.mjs?url`). */
  workerUrl: string | URL;
  config: SsrmDatasetConfig;
  /**
   * Perspective wasm locations for the window client. Required unless
   * `perspective.init_client`/`init_server` already ran in this window
   * (the vendor `worker()` ships the server wasm in its init message,
   * so BOTH must be initialized) or `openDataClient` is injected.
   */
  wasm?: {
    clientWasmUrl: string | URL;
    serverWasmUrl: string | URL;
  };
  /** Control-request timeout. Default 30s (a cold worker boots wasm). */
  requestTimeoutMs?: number;
  /** How long `openTable()` retries while the seed creates the table. Default 30s. */
  openTableTimeoutMs?: number;
  /** Test seam — SharedWorker factory (one call per port). */
  createWorker?: (url: string | URL, name: string) => SharedWorkerHandle;
  /** Test seam — Perspective client factory over a worker handle. */
  openDataClient?: (worker: SharedWorkerHandle) => Promise<SsrmDataClient>;
}

export interface SsrmProviderConnection extends PullDatasourceConnection {
  /** Latest known table name (null until the worker reports one). */
  readonly tableName: string | null;
  readonly config: SsrmDatasetConfig;
  /** Re-send configure (worker-side idempotent — first configure wins). */
  configure(config: SsrmDatasetConfig): Promise<DatasetStateSnapshot>;
  /** Bump THE generation and reseed. Consumers remount on the new one. */
  restart(): Promise<DatasetStateSnapshot>;
  /**
   * Cell-edit write-back (P4b): keyed PARTIAL rows written into the
   * worker-hosted table so EVERY window converges. `generation`
   * defaults to the latest known one; the worker fences stale
   * generations (the returned promise rejects, nothing is written).
   * Values are schema-coerced worker-side.
   */
  updateRows(
    rows: Array<Record<string, unknown>>,
    generation?: number,
  ): Promise<DatasetStateSnapshot>;
  dispose(): void;
}

const OPEN_TABLE_RETRY_MS = 150;

export async function connectSsrmProvider(
  opts: ConnectSsrmProviderOpts,
): Promise<SsrmProviderConnection> {
  const workerName = ssrmWorkerName(opts.appId, opts.providerId);
  const createWorker =
    opts.createWorker ??
    ((url: string | URL, name: string): SharedWorkerHandle =>
      new SharedWorker(url, { name, type: 'module' }));
  const openDataClient =
    opts.openDataClient ?? ((worker: SharedWorkerHandle) => defaultOpenDataClient(worker, opts.wasm));

  const control = new SsrmControlClient(createWorker(opts.workerUrl, workerName), {
    requestTimeoutMs: opts.requestTimeoutMs ?? 30_000,
  });

  let latest: { state: DatasetStateSnapshot; tableName: string | null } | null = null;
  let disposed = false;
  const listeners = new Set<(state: DatasetStateSnapshot) => void>();

  const record = (state: DatasetStateSnapshot, tableName: string | null): void => {
    latest = { state, tableName };
    for (const listener of listeners) listener(state);
  };
  control.onState(record);

  // Configure is the port's first message — it also claims the control
  // dialect. The ack is the freshest state at send time; broadcasts on
  // the same port keep `latest` current afterwards.
  const ack = await control.configure(opts.config);
  record(ack.state, ack.tableName);

  let dataClient: Promise<SsrmDataClient> | null = null;
  let table: Promise<PullTable> | null = null;

  const openTable = (): Promise<PullTable> => {
    table ??= (async () => {
      dataClient ??= openDataClient(createWorker(opts.workerUrl, workerName));
      const client = await dataClient;
      const name = latest?.tableName ?? opts.config.tableName ?? 'dataset';
      return (await openTableWithRetry(
        client,
        name,
        opts.openTableTimeoutMs ?? 30_000,
        () => disposed || latest?.state.phase === 'error',
      )) as PullTable;
    })();
    table.catch(() => {
      table = null; // allow a later retry after a failed open
    });
    return table;
  };

  return {
    get state() {
      return latest?.state ?? null;
    },
    get tableName() {
      return latest?.tableName ?? null;
    },
    config: opts.config,
    onState(listener) {
      listeners.add(listener);
      if (latest) listener(latest.state);
      return () => listeners.delete(listener);
    },
    async configure(config) {
      const result = await control.configure(config);
      record(result.state, result.tableName);
      return result.state;
    },
    async restart() {
      const result = await control.restart();
      record(result.state, result.tableName);
      return result.state;
    },
    async updateRows(rows, generation) {
      const gen = generation ?? latest?.state.generation;
      if (gen === undefined) {
        throw new Error('[ssrm] updateRows before any DatasetState — no generation to stamp');
      }
      const result = await control.updateRows(gen, rows);
      record(result.state, result.tableName);
      return result.state;
    },
    openTable,
    dispose() {
      disposed = true;
      listeners.clear();
      control.close();
      void dataClient?.then((client) => client.terminate?.()).catch(() => undefined);
      dataClient = null;
      table = null;
    },
  };
}

/**
 * Stock vendor client over the provider worker's data port. The vendor
 * package is imported lazily — its Node entry boots a wasm server at
 * import time, and injected test/consumer clients never need it.
 */
async function defaultOpenDataClient(
  worker: SharedWorkerHandle,
  wasm: ConnectSsrmProviderOpts['wasm'],
): Promise<SsrmDataClient> {
  const { default: perspective } = await import('@finos/perspective');
  if (wasm) {
    // The vendor client posts the server wasm in its `init` message
    // (our worker acks and drops it — its server is already booted),
    // so both modules must be provided.
    perspective.init_server(fetch(wasm.serverWasmUrl));
    perspective.init_client(fetch(wasm.clientWasmUrl));
  }
  return perspective.worker(Promise.resolve(worker as SharedWorker));
}

/**
 * The hosted table is created by the seed's FIRST snapshot batch (or
 * at end-of-snapshot for a zero-row seed) — a window that connects
 * during `connecting`/early `seeding` must wait for it, communicated
 * via retry, never a hang (bounded by `timeoutMs`).
 */
async function openTableWithRetry(
  client: SsrmDataClient,
  name: string,
  timeoutMs: number,
  aborted: () => boolean,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (aborted()) throw new Error(`[ssrm] openTable('${name}') aborted`);
    try {
      return await client.open_table(name);
    } catch (err) {
      if (Date.now() + OPEN_TABLE_RETRY_MS > deadline) {
        throw new Error(
          `[ssrm] open_table('${name}') timed out after ${timeoutMs}ms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, OPEN_TABLE_RETRY_MS));
    }
  }
}
