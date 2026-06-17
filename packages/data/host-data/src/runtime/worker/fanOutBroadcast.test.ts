import { describe, expect, it } from 'vitest';
import { fanOutBroadcast } from './fanOutBroadcast.js';

describe('fanOutBroadcast', () => {
  it('posts one shallow copy per target with rewritten subId', () => {
    const received = new Map<string, unknown[]>();
    const clients = new Map<string, { postMessage(m: unknown): void }>();
    for (const id of ['a', 'b', 'c']) {
      clients.set(id, {
        postMessage(m) {
          const list = received.get(id) ?? [];
          list.push(m);
          received.set(id, list);
        },
      });
    }

    const dead = fanOutBroadcast(
      clients,
      [
        { clientId: 'a', subId: 's1' },
        { clientId: 'b', subId: 's2' },
        { clientId: 'c', subId: 's3' },
      ],
      { kind: 'delta', rows: [{ id: 1 }], replace: false, subId: '' },
    );

    expect(dead).toEqual([]);
    expect(received.get('a')?.[0]).toMatchObject({ subId: 's1', kind: 'delta' });
    expect(received.get('b')?.[0]).toMatchObject({ subId: 's2', kind: 'delta' });
    expect(received.get('c')?.[0]).toMatchObject({ subId: 's3', kind: 'delta' });
  });

  it('returns dead subIds for missing clients and failed posts', () => {
    const clients = new Map<string, { postMessage(m: unknown): void }>();
    clients.set('ok', { postMessage() {} });
    clients.set('bad', {
      postMessage() {
        throw new Error('closed');
      },
    });

    const dead = fanOutBroadcast(
      clients,
      [
        { clientId: 'ok', subId: 'live' },
        { clientId: 'bad', subId: 'dead-post' },
        { clientId: 'missing', subId: 'dead-missing' },
      ],
      { kind: 'status', status: 'ready', subId: '' },
    );

    expect(dead.sort()).toEqual(['dead-missing', 'dead-post']);
  });
});
