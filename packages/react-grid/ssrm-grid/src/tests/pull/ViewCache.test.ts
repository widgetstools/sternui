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

/** A promise plus its resolver — used to hold a read open on purpose. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ViewCache', () => {
  it('creates once per key and reuses the view for repeat reads', async () => {
    const cache = new ViewCache();
    const factory = vi.fn(async (_config: PullViewConfig) => fakeView());
    const first = await cache.withView('k1', {}, factory, async (view) => view);
    const second = await cache.withView('k1', {}, factory, async (view) => view);
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retires and deletes the least-recently-used view beyond capacity', async () => {
    const cache = new ViewCache({ maxViews: 2 });
    const views = new Map<string, ReturnType<typeof fakeView>>();
    const factory = async (config: PullViewConfig): Promise<PullView> => {
      const view = fakeView();
      views.set(JSON.stringify(config), view);
      return view;
    };
    const read = async (key: string, columns: string[]): Promise<void> => {
      await cache.withView(key, { columns }, factory, async () => undefined);
    };
    await read('a', ['a']);
    await read('b', ['b']);
    await read('a', ['a']); // refresh recency: LRU is now b
    await read('c', ['c']);
    await flush();
    expect(cache.size).toBe(2);
    expect(views.get('{"columns":["b"]}')!.deleted).toBe(true);
    expect(views.get('{"columns":["a"]}')!.deleted).toBe(false);
    expect(views.get('{"columns":["c"]}')!.deleted).toBe(false);
  });

  it('notifies onRetire before deleting', async () => {
    const retired: string[] = [];
    const cache = new ViewCache({ maxViews: 1, onRetire: (key) => retired.push(key) });
    await cache.withView('a', {}, async () => fakeView(), async () => undefined);
    await cache.withView('b', {}, async () => fakeView(), async () => undefined);
    await flush();
    expect(retired).toEqual(['a']);
  });

  it('retireAll() deletes every idle view', async () => {
    const cache = new ViewCache();
    const a = fakeView();
    const b = fakeView();
    await cache.withView('a', {}, async () => a, async () => undefined);
    await cache.withView('b', {}, async () => b, async () => undefined);
    cache.retireAll();
    await flush();
    expect(cache.size).toBe(0);
    expect(a.deleted).toBe(true);
    expect(b.deleted).toBe(true);
  });

  it('drops a failed creation so the next read retries', async () => {
    const cache = new ViewCache();
    const failing = cache.withView(
      'k',
      {},
      async () => {
        throw new Error('boom');
      },
      async (view) => view,
    );
    await expect(failing).rejects.toThrow('boom');
    await flush();
    const view = fakeView();
    const recovered = await cache.withView('k', {}, async () => view, async (v) => v);
    expect(recovered).toBe(view);
  });

  // ─── the lease invariant ───────────────────────────────────────────
  //
  // `view.delete()` zeroes the JS handle synchronously while async
  // methods hold a long borrow, so deleting a view with a read in flight
  // never settles, is NOT catchable at the call site, and leaks the view
  // permanently (~5MB and ~2.6ms per table update, forever). A leaked
  // view is therefore not a glitch — it is cumulative throughput loss
  // and a slow march to a wasm heap abort. Nothing may delete a leased
  // view, for any reason.

  it('does NOT delete a view that has a read in flight when evicted', async () => {
    const cache = new ViewCache({ maxViews: 1 });
    const held = fakeView();
    const gate = deferred<void>();

    const reading = cache.withView('a', {}, async () => held, async () => {
      await gate.promise;
      return 'done';
    });
    await flush();

    // Evict 'a' by exceeding capacity while its read is still running.
    await cache.withView('b', {}, async () => fakeView(), async () => undefined);
    await flush();
    expect(held.deleted).toBe(false); // still leased — must survive
    expect(cache.drainingCount).toBe(1);

    gate.resolve();
    await expect(reading).resolves.toBe('done');
    await flush();
    expect(held.deleted).toBe(true); // deleted once the lease ended
    expect(cache.drainingCount).toBe(0);
  });

  it('defers retireAll() deletion until the in-flight read finishes', async () => {
    const cache = new ViewCache();
    const held = fakeView();
    const gate = deferred<void>();

    const reading = cache.withView('a', {}, async () => held, async () => {
      await gate.promise;
      return 1;
    });
    await flush();

    cache.retireAll(); // generation change / destroy mid-read
    await flush();
    expect(held.deleted).toBe(false);
    expect(cache.size).toBe(0); // gone from the live pool immediately

    gate.resolve();
    await reading;
    await flush();
    expect(held.deleted).toBe(true);
  });

  it('releases the lease when the read THROWS', async () => {
    const cache = new ViewCache();
    const held = fakeView();
    const failing = cache.withView('a', {}, async () => held, async () => {
      throw new Error('read blew up');
    });
    await expect(failing).rejects.toThrow('read blew up');
    cache.retireAll();
    await flush();
    expect(held.deleted).toBe(true); // not stuck draining forever
  });

  it('tryWithView never creates, and never resurrects a retired shape', async () => {
    const cache = new ViewCache();
    const factory = vi.fn(async () => fakeView());

    expect(await cache.tryWithView('missing', async () => 'x')).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();

    await cache.withView('a', {}, factory, async () => undefined);
    expect(await cache.tryWithView('a', async () => 'hit')).toBe('hit');

    cache.retireAll();
    expect(await cache.tryWithView('a', async () => 'hit')).toBeUndefined();
  });

  it('evicts past a leased view rather than stalling the whole pool', async () => {
    // A single long read must not pin the pool over capacity — every
    // extra live view is a recurring per-update cost.
    const cache = new ViewCache({ maxViews: 2 });
    const pinned = fakeView();
    const gate = deferred<void>();
    const reading = cache.withView('pinned', {}, async () => pinned, async () => {
      await gate.promise;
    });
    await flush();

    const idle = fakeView();
    await cache.withView('idle', {}, async () => idle, async () => undefined);
    await cache.withView('c', {}, async () => fakeView(), async () => undefined);
    await cache.withView('d', {}, async () => fakeView(), async () => undefined);
    await flush();

    expect(cache.size).toBe(2); // capacity respected despite the lease
    expect(idle.deleted).toBe(true); // the un-leased LRU went first
    expect(pinned.deleted).toBe(false); // leased one deferred, not skipped forever

    gate.resolve();
    await reading;
    await flush();
    expect(pinned.deleted).toBe(true);
  });
});
