import { describe, it, expect, vi } from 'vitest';
import { AppDataProvider } from './AppDataProvider';

describe('AppDataProvider — basic put/fetch', () => {
  it('fetch returns undefined for an unknown key', async () => {
    const p = new AppDataProvider('app1');
    expect(await p.fetch('missing')).toBeUndefined();
  });

  it('put then fetch returns the written value', async () => {
    const p = new AppDataProvider('app1');
    await p.put('token1', 'hello');
    expect(await p.fetch('token1')).toBe('hello');
  });

  it('configure seeds initial variables', async () => {
    const p = new AppDataProvider('app1');
    await p.configure({
      providerType: 'appdata',
      variables: {
        username: { key: 'username', value: 'alice', type: 'string' },
        count: { key: 'count', value: 42, type: 'number' },
      },
    });
    expect(await p.fetch('username')).toBe('alice');
    expect(await p.fetch('count')).toBe(42);
    expect(p.keys()).toEqual(expect.arrayContaining(['username', 'count']));
  });
});

describe('AppDataProvider — subscribe/unsubscribe reactivity', () => {
  it('subscribe delivers the current value synchronously when one exists', async () => {
    const p = new AppDataProvider('app1');
    await p.put('x', 1);
    const cb = vi.fn();
    p.subscribe('x', cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
  });

  it('subscribe does NOT fire synchronously when the key is absent', () => {
    const p = new AppDataProvider('app1');
    const cb = vi.fn();
    p.subscribe('missing', cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('put fans out to every subscriber of that key', async () => {
    const p = new AppDataProvider('app1');
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn(); // on a different key — should not fire
    p.subscribe('k', a);
    p.subscribe('k', b);
    p.subscribe('other', c);

    await p.put('k', 'v1');

    expect(a).toHaveBeenCalledWith('v1');
    expect(b).toHaveBeenCalledWith('v1');
    expect(c).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further deliveries', async () => {
    const p = new AppDataProvider('app1');
    const cb = vi.fn();
    const off = p.subscribe('k', cb);
    await p.put('k', 'v1');
    expect(cb).toHaveBeenCalledTimes(1);

    off();
    await p.put('k', 'v2');
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it('unsubscribe is idempotent', () => {
    const p = new AppDataProvider('app1');
    const cb = vi.fn();
    const off = p.subscribe('k', cb);
    expect(() => {
      off();
      off();
      off();
    }).not.toThrow();
  });

  it('callback that unsubscribes during fan-out does not break iteration', async () => {
    const p = new AppDataProvider('app1');
    const b = vi.fn();
    const c = vi.fn();
    let offA: (() => void) | null = null;
    const a = vi.fn(() => {
      offA?.();
    });
    offA = p.subscribe('k', a);
    p.subscribe('k', b);
    p.subscribe('k', c);

    await p.put('k', 'v1');

    // All three must have been called on the first put, even though
    // `a` tore itself down mid-dispatch.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith('v1');
    expect(c).toHaveBeenCalledWith('v1');

    // Second put — `a` should be gone; `b` + `c` still receive.
    await p.put('k', 'v2');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(c).toHaveBeenCalledTimes(2);
  });

  it('subscriberCount reflects add/remove correctly', () => {
    const p = new AppDataProvider('app1');
    expect(p.subscriberCount('k')).toBe(0);
    const off1 = p.subscribe('k', () => {});
    const off2 = p.subscribe('k', () => {});
    expect(p.subscriberCount('k')).toBe(2);
    off1();
    expect(p.subscriberCount('k')).toBe(1);
    off2();
    expect(p.subscriberCount('k')).toBe(0);
  });
});

describe('AppDataProvider — lifecycle', () => {
  it('drop removes a specific key without affecting subscribers of other keys', async () => {
    const p = new AppDataProvider('app1');
    await p.put('a', 1);
    await p.put('b', 2);
    p.drop('a');
    expect(await p.fetch('a')).toBeUndefined();
    expect(await p.fetch('b')).toBe(2);
  });

  it('teardown clears all state and subscriptions', async () => {
    const p = new AppDataProvider('app1');
    await p.put('k', 'v');
    const cb = vi.fn();
    p.subscribe('k', cb);
    cb.mockClear(); // drop the synchronous initial delivery

    await p.teardown();

    expect(p.keys()).toEqual([]);
    expect(p.subscriberCount('k')).toBe(0);
    // After teardown, a put would fan out to nobody — no late firings.
    await p.put('k', 'v2');
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Per-key durability ───────────────────────────────────────────────

describe('AppDataProvider — per-key durability', () => {
  it('rehydrates persisted keys from the host store, overlaying the seed', async () => {
    const loadPersisted = vi.fn(async () => ({ token: 'from-store' }));
    const savePersisted = vi.fn(async () => undefined);
    const p = new AppDataProvider('app1', { loadPersisted, savePersisted });

    await p.configure({
      providerType: 'appdata',
      variables: {
        token: { key: 'token', value: 'seed', type: 'string', durability: 'persisted' },
        cache: { key: 'cache', value: 'seed-cache', type: 'string', durability: 'volatile' },
      },
    });

    expect(loadPersisted).toHaveBeenCalledWith('app1');
    expect(await p.fetch('token')).toBe('from-store');
    expect(await p.fetch('cache')).toBe('seed-cache');
  });

  it('writes through to the host store on put for persisted keys only', async () => {
    const loadPersisted = vi.fn(async () => ({}));
    const savePersisted = vi.fn(async () => undefined);
    const p = new AppDataProvider('app1', { loadPersisted, savePersisted });

    await p.configure({
      providerType: 'appdata',
      variables: {
        prefs: { key: 'prefs', value: { theme: 'dark' }, type: 'json', durability: 'persisted' },
        token: { key: 'token', value: '', type: 'string' /* default volatile */ },
      },
    });
    savePersisted.mockClear();

    await p.put('prefs', { theme: 'light' });
    await p.put('token', 'jwt-x');
    // Wait a tick for the fire-and-forget save to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(savePersisted).toHaveBeenCalledTimes(1);
    expect(savePersisted).toHaveBeenCalledWith('app1', { prefs: { theme: 'light' } });
    expect(await p.fetch('token')).toBe('jwt-x');
  });

  it('isPersisted reflects the configured durability flag', async () => {
    const p = new AppDataProvider('app1', {
      loadPersisted: async () => ({}),
      savePersisted: async () => undefined,
    });
    await p.configure({
      providerType: 'appdata',
      variables: {
        a: { key: 'a', value: 1, type: 'number', durability: 'persisted' },
        b: { key: 'b', value: 2, type: 'number', durability: 'volatile' },
        c: { key: 'c', value: 3, type: 'number' },
      },
    });
    expect(p.isPersisted('a')).toBe(true);
    expect(p.isPersisted('b')).toBe(false);
    expect(p.isPersisted('c')).toBe(false);
  });

  it('a failing loadPersisted does not crash configure (fallback to seed)', async () => {
    const loadPersisted = vi.fn(async () => { throw new Error('store offline'); });
    const savePersisted = vi.fn(async () => undefined);
    const p = new AppDataProvider('app1', { loadPersisted, savePersisted });

    await p.configure({
      providerType: 'appdata',
      variables: {
        token: { key: 'token', value: 'seed', type: 'string', durability: 'persisted' },
      },
    });
    expect(await p.fetch('token')).toBe('seed');
  });
});
