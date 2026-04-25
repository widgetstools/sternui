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
