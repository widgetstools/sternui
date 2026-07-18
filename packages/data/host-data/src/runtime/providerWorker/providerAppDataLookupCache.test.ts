/**
 * ProviderAppDataLookupCache tests (ADR Phase 4b).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ProviderAppDataLookupCache,
  createProviderAppDataLookupCache,
} from './providerAppDataLookupCache.js';

describe('ProviderAppDataLookupCache', () => {
  it('hydrates template refs from async lookup', async () => {
    const lookupAsync = vi.fn(async (name: string, key: string) => {
      if (name === 'positions' && key === 'asOfDate') return '2026-07-18';
      return undefined;
    });
    const cache = await createProviderAppDataLookupCache(
      { destination: '/topic/{{positions.asOfDate}}' },
      lookupAsync,
      { retryMs: 1 },
    );
    expect(cache.lookup('positions', 'asOfDate')).toBe('2026-07-18');
    expect(lookupAsync).toHaveBeenCalled();
  });

  it('applies and removes rows', () => {
    const cache = new ProviderAppDataLookupCache();
    cache.applyRow({
      configId: 'c1',
      name: 'fx',
      description: '',
      isPublic: false,
      values: { base: 'USD', quote: 'EUR' },
      userId: 'u',
    });
    expect(cache.lookup('fx', 'base')).toBe('USD');
    expect(cache.lookup('fx', 'quote')).toBe('EUR');
    cache.removeName('fx');
    expect(cache.lookup('fx', 'base')).toBeUndefined();
  });

  it('retries once on undefined', async () => {
    let calls = 0;
    const lookupAsync = vi.fn(async () => {
      calls += 1;
      return calls >= 2 ? 'ok' : undefined;
    });
    const cache = new ProviderAppDataLookupCache();
    await cache.hydrateFromCfg(
      { x: '{{bag.k}}' },
      lookupAsync,
      { retryMs: 1 },
    );
    expect(cache.lookup('bag', 'k')).toBe('ok');
    expect(lookupAsync).toHaveBeenCalledTimes(2);
  });
});
