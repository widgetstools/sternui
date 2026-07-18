/**
 * Sync AppData lookup cache for provider SharedWorkers (ADR Phase 4b).
 *
 * Transports need a synchronous {@link AppDataLookup}; AppData SW lookup
 * is async. Prefetch declared `{{name.key}}` refs before `startProvider`,
 * then keep the map warm via snapshot/delta (or re-prefetch on restart).
 */

import type { AppDataLookup } from '../template/resolver.js';
import { collectTemplateRefs } from '../template/resolver.js';
import type { AppDataRow } from '../protocol.js';

function cacheKey(name: string, key: string): string {
  return `${name}\0${key}`;
}

export type AsyncAppDataLookup = (name: string, key: string) => Promise<unknown>;

export class ProviderAppDataLookupCache {
  private readonly values = new Map<string, unknown>();

  /** Sync lookup suitable for `startProvider({ appDataLookup })`. */
  readonly lookup: AppDataLookup = (name, key) => this.values.get(cacheKey(name, key));

  get size(): number {
    return this.values.size;
  }

  set(name: string, key: string, value: unknown): void {
    this.values.set(cacheKey(name, key), value);
  }

  /** Apply a full AppData row into the cache (all values keys). */
  applyRow(row: AppDataRow): void {
    for (const [key, value] of Object.entries(row.values)) {
      this.set(row.name, key, value);
    }
  }

  /** Drop every key for a named bag (row remove). */
  removeName(name: string): void {
    const prefix = `${name}\0`;
    for (const k of [...this.values.keys()]) {
      if (k.startsWith(prefix)) this.values.delete(k);
    }
  }

  clear(): void {
    this.values.clear();
  }

  /**
   * Prefetch template refs from `cfg` via an async lookup (AppData SW RPC
   * or test stub). Retries each miss once after `retryMs` (start-only).
   */
  async hydrateFromCfg(
    cfg: unknown,
    lookupAsync: AsyncAppDataLookup,
    opts: { retryMs?: number } = {},
  ): Promise<void> {
    const refs = collectTemplateRefs(cfg);
    const retryMs = opts.retryMs ?? 50;
    for (const { providerName, key } of refs) {
      let value = await lookupAsync(providerName, key);
      if (value === undefined) {
        await new Promise((r) => setTimeout(r, retryMs));
        value = await lookupAsync(providerName, key);
      }
      if (value !== undefined) this.set(providerName, key, value);
    }
  }
}

/** Convenience: build a cache and hydrate in one call. */
export async function createProviderAppDataLookupCache(
  cfg: unknown,
  lookupAsync: AsyncAppDataLookup,
  opts?: { retryMs?: number },
): Promise<ProviderAppDataLookupCache> {
  const cache = new ProviderAppDataLookupCache();
  await cache.hydrateFromCfg(cfg, lookupAsync, opts);
  return cache;
}
