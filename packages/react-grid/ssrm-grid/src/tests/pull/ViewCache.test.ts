import { describe, expect, it, vi } from 'vitest';
import { ViewCache } from '../../pull/ViewCache.js';
import type { PullView, PullViewConfig } from '../../pull/types.js';

function fakeView(): PullView & { deleted: boolean } {
  const view = {
    deleted: false,
    num_rows: async () => 0,
    to_json: async () => [],
    on_update: async () => 0,
    remove_update: async () => undefined,
    delete: async () => {
      view.deleted = true;
    },
  };
  return view;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('ViewCache', () => {
  it('creates once per key and reuses the promise for repeat acquires', async () => {
    const cache = new ViewCache();
    const factory = vi.fn(async (_config: PullViewConfig) => fakeView());
    const first = await cache.acquire('k1', {}, factory);
    const second = await cache.acquire('k1', {}, factory);
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('evicts and deletes the least-recently-used view beyond capacity', async () => {
    const cache = new ViewCache({ maxViews: 2 });
    const views = new Map<string, ReturnType<typeof fakeView>>();
    const factory = async (config: PullViewConfig): Promise<PullView> => {
      const view = fakeView();
      views.set(JSON.stringify(config), view);
      return view;
    };
    await cache.acquire('a', { columns: ['a'] }, factory);
    await cache.acquire('b', { columns: ['b'] }, factory);
    await cache.acquire('a', { columns: ['a'] }, factory); // refresh recency: LRU is now b
    await cache.acquire('c', { columns: ['c'] }, factory);
    await flush();
    expect(cache.size).toBe(2);
    expect(views.get('{"columns":["b"]}')!.deleted).toBe(true);
    expect(views.get('{"columns":["a"]}')!.deleted).toBe(false);
    expect(views.get('{"columns":["c"]}')!.deleted).toBe(false);
  });

  it('notifies onEvict before deleting', async () => {
    const evicted: string[] = [];
    const cache = new ViewCache({ maxViews: 1, onEvict: (key) => evicted.push(key) });
    await cache.acquire('a', {}, async () => fakeView());
    await cache.acquire('b', {}, async () => fakeView());
    await flush();
    expect(evicted).toEqual(['a']);
  });

  it('clear() deletes every cached view', async () => {
    const cache = new ViewCache();
    const a = fakeView();
    const b = fakeView();
    await cache.acquire('a', {}, async () => a);
    await cache.acquire('b', {}, async () => b);
    cache.clear();
    await flush();
    expect(cache.size).toBe(0);
    expect(a.deleted).toBe(true);
    expect(b.deleted).toBe(true);
  });

  it('drops a failed creation so the next acquire retries', async () => {
    const cache = new ViewCache();
    const failing = cache.acquire('k', {}, async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await flush();
    const view = fakeView();
    const recovered = await cache.acquire('k', {}, async () => view);
    expect(recovered).toBe(view);
  });
});
