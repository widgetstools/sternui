/**
 * Lazy singleton AppData SharedWorker client per appId (ADR Phase 3).
 */

import { createAppDataWorker, type CreateAppDataWorkerOpts } from './createAppDataWorker.js';
import { AppDataClient } from './AppDataClient.js';

export interface CreateAppDataClientOpts extends CreateAppDataWorkerOpts {
  /** Bundled worker asset URL (`?url` import from the app). */
  workerScriptUrl: string;
}

const clients = new Map<string, Promise<AppDataClient>>();

/**
 * Connect to (or spawn) `starui-appdata:{appId}` and return a ready client.
 * Idempotent per `appId` within the window.
 */
export function createAppDataClient(
  opts: CreateAppDataClientOpts,
): Promise<AppDataClient> {
  const existing = clients.get(opts.appId);
  if (existing) return existing;

  const pending = (async () => {
    const worker = createAppDataWorker(opts.workerScriptUrl, opts);
    const port = worker.port;
    const client = new AppDataClient(port);
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
export function _resetAppDataClientsForTests(): void {
  for (const [, p] of clients) {
    void p.then((c) => c.close()).catch(() => undefined);
  }
  clients.clear();
}
