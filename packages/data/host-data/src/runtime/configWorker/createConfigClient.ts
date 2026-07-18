/**
 * Lazy singleton Config SharedWorker client per appId (ADR Phase 2).
 */

import { createConfigWorker, type CreateConfigWorkerOpts } from './createConfigWorker.js';
import { ConfigClient } from './ConfigClient.js';

export interface CreateConfigClientOpts extends CreateConfigWorkerOpts {
  /** Bundled worker asset URL (`?url` import from the app). */
  workerScriptUrl: string;
}

const clients = new Map<string, Promise<ConfigClient>>();

/**
 * Connect to (or spawn) `starui-config:{appId}` and return a ready client.
 * Idempotent per `appId` within the window.
 */
export function createConfigClient(
  opts: CreateConfigClientOpts,
): Promise<ConfigClient> {
  const existing = clients.get(opts.appId);
  if (existing) return existing;

  const pending = (async () => {
    const worker = createConfigWorker(opts.workerScriptUrl, opts);
    const port = worker.port;
    const client = new ConfigClient(port);
    await client.ready;
    return client;
  })();

  clients.set(opts.appId, pending);
  pending.catch(() => {
    if (clients.get(opts.appId) === pending) {
      clients.delete(opts.appId);
    }
  });
  return pending;
}

/** Test-only — drop cached clients. */
export function _resetConfigClientsForTests(): void {
  for (const [, p] of clients) {
    void p.then((c) => c.close()).catch(() => undefined);
  }
  clients.clear();
}
