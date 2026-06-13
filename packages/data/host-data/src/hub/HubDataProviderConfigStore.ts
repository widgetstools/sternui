/**
 * UI-thread data-provider catalog store backed by the SharedWorker hub.
 *
 * Reads and writes route through {@link SharedWorkerDataServicesClient}
 * RPC — the worker's ConfigManager is the sole Dexie writer for provider
 * rows. Mirrors the {@link DataProviderConfigStore} surface so editors
 * and pickers can swap implementations without UI changes.
 */

import type { DataProviderConfig } from '@starui/types';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import {
  type ListOptions,
} from '../runtime/config/store.js';

export class HubDataProviderConfigStore {
  constructor(private readonly client: SharedWorkerDataServicesClient) {}

  list(userId: string, opts: ListOptions = {}): Promise<DataProviderConfig[]> {
    void userId;
    return this.client.listProviderConfigs(opts);
  }

  get(configId: string): Promise<DataProviderConfig | null> {
    return this.client.getProviderConfig(configId);
  }

  save(provider: DataProviderConfig, callerUserId: string): Promise<DataProviderConfig> {
    return this.client.saveProviderConfig(provider, callerUserId);
  }

  remove(configId: string): Promise<void> {
    return this.client.deleteProviderConfig(configId);
  }
}
