/**
 * Lazy singleton provider SharedWorker client per (appId, providerId).
 */

import { createProviderWorker, type CreateProviderWorkerOpts } from './createProviderWorker.js';
import { ProviderClient } from './ProviderClient.js';

export interface CreateProviderClientOpts extends CreateProviderWorkerOpts {
  /** Bundled worker asset URL (`?url` import from the app). */
  workerScriptUrl: string;
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

/** Test-only — drop cached clients. */
export function _resetProviderClientsForTests(): void {
  for (const [, p] of clients) {
    void p.then((c) => c.close()).catch(() => undefined);
  }
  clients.clear();
}
