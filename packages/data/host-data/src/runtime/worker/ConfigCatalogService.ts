/**
 * Hub-internal Config catalog service boundary (ADR Phase 1).
 *
 * {@link ConfigCatalogCache} already owns the in-memory catalog + Dexie
 * reads. This module exports the stable service interface providers and
 * hub handlers must use — so Phase 2 can swap the implementation for a
 * remote Config SharedWorker client without rewriting attach/get/list
 * call sites.
 */

import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';
import type { ListOptions } from '../config/store.js';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';

/**
 * Catalog operations the hub (and later a Config SharedWorker) exposes.
 * Synchronous getters power cfg-free attach; async methods hydrate /
 * invalidate from persistence.
 */
export interface ConfigCatalogService {
  isReady(): boolean;
  /** Preload catalog from persistence (idempotent). */
  hydrate(): Promise<void>;
  get(providerId: string): DataProviderConfig | null;
  ensure(providerId: string): Promise<DataProviderConfig | null>;
  getProviderConfig(providerId: string): ProviderConfig | null;
  list(opts?: ListOptions): DataProviderConfig[];
  invalidate(providerId?: string): Promise<void>;
  upsert(provider: DataProviderConfig): void;
}

/** Adapt an existing {@link ConfigCatalogCache} to the service interface. */
export function asConfigCatalogService(cache: ConfigCatalogCache): ConfigCatalogService {
  return {
    isReady: () => cache.isReady(),
    hydrate: () => cache.loadAll(),
    get: (id) => cache.get(id),
    ensure: (id) => cache.ensure(id),
    getProviderConfig: (id) => cache.getProviderConfig(id),
    list: (opts) => cache.list(opts),
    invalidate: (id) => cache.invalidate(id),
    upsert: (row) => cache.upsert(row),
  };
}

/** Construct a catalog service backed by ConfigManager / Dexie. */
export function createConfigCatalogService(
  configManager: ConfigManager,
): ConfigCatalogService {
  return asConfigCatalogService(new ConfigCatalogCache(configManager));
}
