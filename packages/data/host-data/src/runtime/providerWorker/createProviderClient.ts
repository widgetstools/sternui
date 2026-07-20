/**
 * Lazy singleton provider SharedWorker client per (appId, providerId).
 */

import { createProviderWorker, type CreateProviderWorkerOpts } from './createProviderWorker.js';
import { ProviderClient } from './ProviderClient.js';

export interface CreateProviderClientOpts extends CreateProviderWorkerOpts {
  /** Bundled worker asset URL (`?url` import from the app). */
  workerScriptUrl: string;
  /**
   * Engine worker asset URL
   * (`@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs`).
   * Enables the pull data path (worker-hosted Perspective table); omit to
   * keep the push path only.
   */
  perspectiveWorkerScriptUrl?: string;
}

const clients = new Map<string, Promise<ProviderClient>>();

function clientKey(appId: string, providerId: string): string {
  return `${appId}::${providerId}`;
}

/**
 * Connect to (or spawn) `starui-provider:{appId}:{providerId}` and return
 * a ready client. Idempotent per pair within the window.
 */
export function createProviderClient(
  opts: CreateProviderClientOpts,
): Promise<ProviderClient> {
  const key = clientKey(opts.appId, opts.providerId);
  const existing = clients.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const worker = createProviderWorker(opts.workerScriptUrl, opts);
    const port = worker.port;
    const client = new ProviderClient(port, {
      appId: opts.appId,
      providerId: opts.providerId,
    });
    await client.ready;
    return client;
  })();

  clients.set(key, pending);
  pending.catch(() => {
    if (clients.get(key) === pending) {
      clients.delete(key);
    }
  });
  return pending;
}

/**
 * Whether `starui-provider:{appId}:{providerId}` already has a running
 * slot. Prefer this over monolith `client.isProviderRunning` when demux
 * is enabled — the monolith hub reports no streaming providers.
 */
export async function isProviderWorkerRunning(
  opts: CreateProviderClientOpts,
): Promise<boolean> {
  try {
    const client = await createProviderClient(opts);
    return client.asDataServicesClient().isProviderRunning(opts.providerId);
  } catch {
    return false;
  }
}

/** Test-only — drop cached clients. */
export function _resetProviderClientsForTests(): void {
  for (const [, p] of clients) {
    void p.then((c) => c.close()).catch(() => undefined);
  }
  clients.clear();
}
