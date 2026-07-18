/**
 * Config SharedWorker wire protocol (ADR Phase 2).
 *
 * Separate from the data-hub protocol so P1 apps (Config + OpenFin) can
 * talk to `starui-config:{appId}` without loading the data plane.
 */

import type { DataProviderConfig, ProviderConfig } from '@starui/types';
import type { ListOptions } from '../config/store.js';

export type ConfigWorkerRequest =
  | { kind: 'config-ready'; reqId: string }
  | { kind: 'config-get-provider'; reqId: string; providerId: string }
  | { kind: 'config-list-providers'; reqId: string; opts?: ListOptions }
  | { kind: 'config-invalidate'; reqId: string; providerId?: string };

export type ConfigWorkerResponse =
  | { kind: 'config-ready-ok'; reqId: string; ok: true }
  | { kind: 'config-ready-ok'; reqId: string; ok: false; error: string }
  | {
      kind: 'config-get-provider-ok';
      reqId: string;
      ok: true;
      provider: DataProviderConfig | null;
      providerConfig: ProviderConfig | null;
    }
  | { kind: 'config-get-provider-ok'; reqId: string; ok: false; error: string }
  | {
      kind: 'config-list-providers-ok';
      reqId: string;
      ok: true;
      providers: DataProviderConfig[];
    }
  | { kind: 'config-list-providers-ok'; reqId: string; ok: false; error: string }
  | { kind: 'config-invalidate-ok'; reqId: string; ok: true }
  | { kind: 'config-invalidate-ok'; reqId: string; ok: false; error: string };

/** Fan-out to all Config SW ports after invalidate / hydrate. */
export type ConfigWorkerEvent =
  | { kind: 'catalog-changed'; providerId?: string; full?: boolean };

export type ConfigWorkerInbound = ConfigWorkerResponse | ConfigWorkerEvent;

export function isConfigWorkerRequest(msg: unknown): msg is ConfigWorkerRequest {
  if (!msg || typeof msg !== 'object') return false;
  const kind = (msg as { kind?: unknown }).kind;
  return (
    kind === 'config-ready'
    || kind === 'config-get-provider'
    || kind === 'config-list-providers'
    || kind === 'config-invalidate'
  );
}
