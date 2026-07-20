/**
 * Window-side Perspective read client for the pull data path
 * (ADR-ssrm-worker-hosted-engine.md).
 *
 * A blotter window holds NO dataset: it opens its own connection to the
 * provider's engine SharedWorker (`starui-psp:{appId}:{providerId}`) and
 * reads viewport blocks through Perspective views. This helper performs the
 * window-side boot — WASM init (once per window, process-global in
 * Perspective) plus `perspective.worker()` over the shared engine worker —
 * and returns the connected client.
 *
 * WASM payloads resolve as SIBLINGS of the engine worker asset
 * (`buildWorker.mjs` copies them into `dist/assets`), so callers only need
 * the one asset URL they already have for `linkProviderToPerspective`.
 *
 * The returned client is structurally typed (`unknown` surface) — feed it to
 * `createPerspectiveEngine` from `@wellsfargo-starui/ssrm-grid`, which types it
 * structurally. host-data must not import from react-grid (ARCHITECTURE).
 */

import { perspectiveSharedWorkerName } from './perspectiveWorkerLink.js';

/**
 * `@finos/perspective` is imported LAZILY: its Node entry (picked up by
 * vitest/jsdom via the `node` export condition) compiles WASM at module
 * eval, which breaks any test that merely imports a module in this
 * dependency chain. Browsers resolve the browser bundle either way.
 */
interface PerspectiveModule {
  init_server(wasm: unknown): unknown;
  init_client(wasm: unknown): unknown;
  worker(w: Promise<unknown>): Promise<unknown>;
}

function loadPerspective(): Promise<PerspectiveModule> {
  return import('@finos/perspective') as unknown as Promise<PerspectiveModule>;
}

/** Minimal read surface, for callers that probe before wiring an engine. */
export interface PerspectiveReadClient {
  get_hosted_table_names(): Promise<string[]>;
  open_table(name: string): Promise<{ size(): Promise<number> }>;
}

export interface CreatePerspectiveReadClientOpts {
  appId: string;
  providerId: string;
  /**
   * Engine worker asset URL —
   * `@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs`.
   */
  workerScriptUrl: string;
  /** Injected for tests; defaults to `new SharedWorker(url, {name})`. */
  createWorker?: (url: string, name: string) => SharedWorker;
}

let wasmInitialised = false;

/** Absolute URL for a sibling asset of the worker script. */
function siblingAssetUrl(name: string, workerScriptUrl: string): URL {
  const base =
    typeof location !== 'undefined'
      ? new URL(workerScriptUrl, location.href)
      : new URL(workerScriptUrl);
  return new URL(name, base);
}

export async function createPerspectiveReadClient(
  opts: CreatePerspectiveReadClientOpts,
): Promise<PerspectiveReadClient> {
  const perspective = await loadPerspective();
  if (!wasmInitialised) {
    wasmInitialised = true;
    perspective.init_server(
      fetch(siblingAssetUrl('perspective-server.wasm', opts.workerScriptUrl)),
    );
    perspective.init_client(
      fetch(siblingAssetUrl('perspective-js.wasm', opts.workerScriptUrl)),
    );
  }
  const name = perspectiveSharedWorkerName(opts.appId, opts.providerId);
  const create =
    opts.createWorker ??
    ((url: string, workerName: string) =>
      new SharedWorker(url, { type: 'module', name: workerName }));
  const worker = create(opts.workerScriptUrl, name);
  const client = await perspective.worker(Promise.resolve(worker) as never);
  return client as unknown as PerspectiveReadClient;
}
