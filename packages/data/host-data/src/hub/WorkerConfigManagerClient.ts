/**
 * UI-thread facade over the SharedWorker's authoritative ConfigManager.
 *
 * Phase 1 covers the data-provider catalog slice (the hot path for
 * blotters + the Data Provider Editor). Broader appConfig / auth-table
 * RPCs follow in later phases — until then, callers that need raw
 * `AppConfigRow` CRUD keep a local {@link ConfigManager} for
 * config-browser-only windows.
 *
 * Usage:
 *   const client = new WorkerConfigManagerClient(hubClient);
 *   const store = client.dataProviders();
 *   await store.save(provider, userId);
 */

import type { ConfigManager } from '@starui/host-config';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import { HubDataProviderConfigStore } from './HubDataProviderConfigStore.js';

/**
 * Read-only identity shim — appId / userId are fixed at worker boot
 * and echoed through bootstrap config; the worker ConfigManager holds
 * the canonical values.
 */
export interface WorkerConfigIdentity {
  appId: string;
  userId: string;
}

export class WorkerConfigManagerClient {
  private readonly providers: HubDataProviderConfigStore;

  constructor(
    private readonly hub: SharedWorkerDataServicesClient,
    private readonly identity: WorkerConfigIdentity,
  ) {
    this.providers = new HubDataProviderConfigStore(hub);
  }

  /** Data-provider catalog (STOMP / mock / appdata definitions). */
  dataProviders(): HubDataProviderConfigStore {
    return this.providers;
  }

  getAppId(): string {
    return this.identity.appId;
  }

  getIdentity(): { userId: string; displayName?: string } {
    return { userId: this.identity.userId, displayName: this.identity.userId };
  }

  /**
   * Await worker catalog hydration. Replaces `configManager.init()` for
   * data windows that only need hub-backed provider config.
   */
  async ready(): Promise<void> {
    await this.hub.waitForCatalogReady();
  }

  /**
   * No-op — the worker owns Dexie lifecycle. Exists so call sites that
   * typed against {@link ConfigManager} can swap without branching.
   */
  dispose(): void {
    /* hub bundle owns client lifetime */
  }

  /**
   * Stub for legacy `onConfigChanged` call sites during migration.
   * Worker pushes `catalog-ready` after saves; subscribe via
   * `hub.onCatalogReady()` instead.
   */
  onConfigChanged(_fn: (configId: string) => void): () => void {
    return () => {};
  }
}

/** Type guard — true when bootstrap handed back a worker proxy. */
export function isWorkerConfigManagerClient(
  cm: ConfigManager | WorkerConfigManagerClient,
): cm is WorkerConfigManagerClient {
  return cm instanceof WorkerConfigManagerClient;
}
