import type { IServerSideDatasource } from 'ag-grid-community';

import { createPerspectiveDatasource, throttle } from './ssrm/createPerspectiveDatasource';
import { createWorkerClient, type PerspectiveWorkerClient } from './ssrm/workerClient';

export interface PerspectiveEngineAttachOptions {
  providerId: string;
  indexColumn?: string;
  cacheBlockSize?: number;
  refreshThrottleMs?: number;
  onDirty?: () => void;
}

interface ProviderSlot {
  refCount: number;
  datasource: IServerSideDatasource;
}

/**
 * Singleton registry — one Perspective worker + one table per `providerId`
 * shared across all MarketsGrid blotters in the same window.
 */
class PerspectiveEngineRegistryImpl {
  private workerClient: PerspectiveWorkerClient | null = null;
  private readonly slots = new Map<string, ProviderSlot>();
  private readonly dirtyThrottles = new Map<string, () => void>();

  private ensureWorker(): PerspectiveWorkerClient {
    if (!this.workerClient) {
      this.workerClient = createWorkerClient();
    }
    return this.workerClient;
  }

  attach(options: PerspectiveEngineAttachOptions): IServerSideDatasource {
    const { providerId, indexColumn, cacheBlockSize, refreshThrottleMs = 150, onDirty } = options;
    const existing = this.slots.get(providerId);
    if (existing) {
      existing.refCount += 1;
      return existing.datasource;
    }

    const client = this.ensureWorker();
    void client.ensureTable({ providerId, indexColumn, cacheBlockSize });

    const throttledDirty = throttle(() => onDirty?.(), refreshThrottleMs);
    this.dirtyThrottles.set(providerId, throttledDirty);
    client.setDirtyHandler((msg) => {
      if (msg.providerId === providerId) throttledDirty();
    });

    const datasource = createPerspectiveDatasource(
      () => this.workerClient,
      () => providerId,
    );

    this.slots.set(providerId, { refCount: 1, datasource });
    return datasource;
  }

  detach(providerId: string): void {
    const slot = this.slots.get(providerId);
    if (!slot) return;
    slot.refCount -= 1;
    if (slot.refCount > 0) return;

    this.slots.delete(providerId);
    this.dirtyThrottles.delete(providerId);
    const client = this.workerClient;
    if (client) {
      void client.releaseTable(providerId);
    }
    if (this.slots.size === 0 && client) {
      client.dispose();
      this.workerClient = null;
    }
  }

  async replace(
    providerId: string,
    rows: Record<string, unknown>[],
    indexColumn?: string,
  ): Promise<number> {
    const client = this.ensureWorker();
    return client.replace(providerId, rows, indexColumn);
  }

  async update(providerId: string, rows: Record<string, unknown>[]): Promise<void> {
    const client = this.ensureWorker();
    await client.updateRows(providerId, rows);
  }

  getRefCount(providerId: string): number {
    return this.slots.get(providerId)?.refCount ?? 0;
  }

  hasTable(providerId: string): boolean {
    return this.slots.has(providerId);
  }
}

export const perspectiveEngineRegistry = new PerspectiveEngineRegistryImpl();

export function resolveRowStore(
  config: { rowStore?: 'memory' | 'perspective'; ssrm?: { enabled?: boolean | 'auto'; thresholdRows?: number } } | null | undefined,
  snapshotRowCount?: number,
): 'memory' | 'perspective' {
  if (!config) return 'memory';
  if (config.rowStore === 'perspective') return 'perspective';
  if (config.rowStore === 'memory') return 'memory';
  const ssrm = config.ssrm;
  if (!ssrm?.enabled) return 'memory';
  if (ssrm.enabled === true) return 'perspective';
  if (ssrm.enabled === 'auto') {
    const threshold = ssrm.thresholdRows ?? 5_000;
    return (snapshotRowCount ?? 0) >= threshold ? 'perspective' : 'memory';
  }
  return 'memory';
}
