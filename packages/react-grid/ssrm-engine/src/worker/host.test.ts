import { describe, expect, it, vi } from 'vitest';
import { createSsrmEngine } from '../engine.js';
import { createSsrmWorkerHost } from './host.js';
import { SsrmEngineClient } from './SsrmEngineClient.js';
import type { SsrmRow } from '../types.js';

/**
 * The host over a real `MessageChannel`, which is what a SharedWorker port is.
 * No worker is needed to prove any of this, and needing one would have made it
 * untested.
 */
function book(rows = 6) {
  const engine = createSsrmEngine({
    schema: {
      keyField: 'id',
      fields: [
        { field: 'id', type: 'string' },
        { field: 'desk', type: 'string' },
        { field: 'value', type: 'number' },
      ],
    },
  });
  const data: SsrmRow[] = [];
  for (let i = 0; i < rows; i++) {
    data.push({ id: `P-${i}`, desk: i % 2 === 0 ? 'Alpha' : 'Bravo', value: i * 10 });
  }
  engine.applySnapshot(data);
  return engine;
}

function connect(host: ReturnType<typeof createSsrmWorkerHost>) {
  const channel = new MessageChannel();
  host.connect(channel.port2 as unknown as MessagePort);
  return channel.port1 as unknown as MessagePort;
}

describe('the worker host', () => {
  it('serves a block from the worker-held engine', async () => {
    const host = createSsrmWorkerHost({ openBook: () => ({ engine: book() }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress');

    expect(client.size).toBe(6);
    expect(client.schema.keyField).toBe('id');

    const result = await client.getRows({ startRow: 0, endRow: 3 });
    expect(result.rowCount).toBe(6);
    expect(result.rowData.map((r) => r.id)).toEqual(['P-0', 'P-1', 'P-2']);

    await client.close();
  });

  /** Two windows, one book. The entire reason the engine moved out of the window. */
  it('builds one engine for two clients of the same book', async () => {
    const openBook = vi.fn(() => ({ engine: book() }));
    const host = createSsrmWorkerHost({ openBook });

    const a = await SsrmEngineClient.open(connect(host), 'stress');
    const b = await SsrmEngineClient.open(connect(host), 'stress');

    expect(openBook).toHaveBeenCalledTimes(1);
    expect(host.clientCount('stress')).toBe(2);
    expect(b.clientsAtOpen).toBe(2);

    await a.close();
    await b.close();
  });

  it('pushes a write to the other client and not back to its author', async () => {
    const host = createSsrmWorkerHost({ openBook: () => ({ engine: book() }) });
    const author = await SsrmEngineClient.open(connect(host), 'stress');
    const peer = await SsrmEngineClient.open(connect(host), 'stress');

    const seenByPeer: SsrmRow[][] = [];
    const seenByAuthor: SsrmRow[][] = [];
    peer.subscribe((delta) => seenByPeer.push(delta.rows));
    author.subscribe((delta) => seenByAuthor.push(delta.rows));

    await author.applyUpdate([{ id: 'P-1', value: 999 }]);
    await settle();

    expect(seenByPeer).toEqual([[{ id: 'P-1', value: 999 }]]);
    expect(seenByAuthor).toEqual([]);

    // And the write really landed, rather than only being announced.
    const rows = await peer.getRows({ startRow: 0, endRow: 6 });
    expect(rows.rowData.find((r) => r.id === 'P-1')?.value).toBe(999);

    await author.close();
    await peer.close();
  });

  /** A tick: the book owner writes in the worker and every client hears it. */
  it('broadcasts a worker-side tick to every client', async () => {
    const engine = book();
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const a = await SsrmEngineClient.open(connect(host), 'stress');
    const b = await SsrmEngineClient.open(connect(host), 'stress');

    const heard: number[] = [];
    a.subscribe((delta) => heard.push(delta.rows.length));
    b.subscribe((delta) => heard.push(delta.rows.length));

    const patch = [{ id: 'P-0', value: 1 }, { id: 'P-2', value: 2 }];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    expect(heard).toEqual([2, 2]);
    await a.close();
    await b.close();
  });

  /**
   * A SharedWorker outlives its pages, so a book nobody retires survives a
   * reload and the next load builds a second one beside it.
   */
  it('retires the book when its last client detaches', async () => {
    const dispose = vi.fn();
    const host = createSsrmWorkerHost({ openBook: () => ({ engine: book(), dispose }) });
    const a = await SsrmEngineClient.open(connect(host), 'stress');
    const b = await SsrmEngineClient.open(connect(host), 'stress');

    await a.close();
    expect(dispose).not.toHaveBeenCalled();
    expect(host.books()).toEqual(['stress']);

    await b.close();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.books()).toEqual([]);
  });

  it('answers a call for a book this port never opened', async () => {
    const host = createSsrmWorkerHost({ openBook: () => ({ engine: book() }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress');
    // The client always names its own book, so reach past it to forge one.
    const forged = SsrmEngineClient.open(connect(host), '');
    await expect(forged).rejects.toThrow(/bookId/);
    await client.close();
  });

  /**
   * A book that cannot be built must not be cached as a permanent failure: the
   * next window would inherit a failure it had no part in.
   */
  it('does not cache a book that failed to open', async () => {
    let attempt = 0;
    const host = createSsrmWorkerHost({
      openBook: () => {
        attempt += 1;
        if (attempt === 1) throw new Error('the provider was not ready');
        return { engine: book() };
      },
      onFault: () => {},
    });

    await expect(SsrmEngineClient.open(connect(host), 'stress')).rejects.toThrow(/not ready/);
    const retried = await SsrmEngineClient.open(connect(host), 'stress');
    expect(retried.size).toBe(6);
    await retried.close();
  });
});

/**
 * The half of the refcount that a clean `close` cannot cover.
 *
 * A SharedWorker port has NO disconnect event and the worker outlives the page,
 * so a window that is killed rather than closed leaves its book attached
 * forever — which is how the lab accumulated several 20-50k books in one
 * process. The clock is injected because the real stale window is 90 seconds.
 */
describe('the stale-port reaper', () => {
  it('retires a book whose only client stopped speaking', async () => {
    let clock = 1_000;
    const dispose = vi.fn();
    const host = createSsrmWorkerHost({
      openBook: () => ({ engine: book(), dispose }),
      staleMs: 100,
      sweepMs: 0,
      now: () => clock,
    });

    await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    expect(host.clientCount('stress')).toBe(1);

    // Still inside the window: nothing is reaped, and a book that IS reaped
    // here would be the failure mode inverted — a live blotter cut off.
    clock += 50;
    expect(host.sweep()).toBe(0);
    expect(host.books()).toEqual(['stress']);

    clock += 200;
    expect(host.sweep()).toBe(1);
    expect(host.books()).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.introspect().reaped).toBe(1);
  });

  it('keeps a book whose client is still sending heartbeats', async () => {
    let clock = 1_000;
    const host = createSsrmWorkerHost({
      openBook: () => ({ engine: book() }),
      staleMs: 100,
      sweepMs: 0,
      now: () => clock,
    });

    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    clock += 80;
    await client.heartbeatOnce();
    clock += 80;

    // 160 ms since `open` — past the window — but only 80 since the heartbeat.
    expect(host.sweep()).toBe(0);
    expect(host.books()).toEqual(['stress']);
    await client.close();
  });

  /** One survivor keeps the book: the reaper is a refcount, not a timeout. */
  it('reaps only the silent client of a shared book', async () => {
    let clock = 1_000;
    const host = createSsrmWorkerHost({
      openBook: () => ({ engine: book() }),
      staleMs: 100,
      sweepMs: 0,
      now: () => clock,
    });

    const dead = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    const live = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    expect(host.clientCount('stress')).toBe(2);

    clock += 200;
    await live.heartbeatOnce();
    expect(host.sweep()).toBe(1);
    expect(host.clientCount('stress')).toBe(1);
    expect(host.books()).toEqual(['stress']);

    void dead;
    await live.close();
  });
});

/**
 * "These windows share a book" is a claim, and a claim needs a check that would
 * FAIL if it were false. Two clients on one id must report ONE book with two
 * clients — two books, or one book with one client, are both visible here.
 */
describe('introspection', () => {
  it('reports one book with two clients, and two books separately', async () => {
    const host = createSsrmWorkerHost({ openBook: () => ({ engine: book() }) });
    const a = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    const b = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });

    const shared = await a.introspect();
    expect(shared.books).toEqual([{ bookId: 'stress', clients: 2, size: 6, viewports: 0 }]);

    const other = await SsrmEngineClient.open(connect(host), 'other', { heartbeatMs: 0 });
    const split = await a.introspect();
    expect(split.books.map((x) => [x.bookId, x.clients])).toEqual([
      ['stress', 2],
      ['other', 1],
    ]);

    await a.close();
    await b.close();
    await other.close();
  });
});

/**
 * Per-subscriber viewport push. Each window says what it can see; the worker
 * sends it only the dirty rows inside that range.
 */
describe('the per-subscriber viewport', () => {
  it('narrows a pushed tick to the rows a client can see', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const narrow = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    const everything = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });

    await narrow.setViewport({ request: {}, startRow: 0, endRow: 3 });
    expect((await narrow.introspect()).books[0].viewports).toBe(1);

    const heardNarrow: unknown[][] = [];
    const heardAll: unknown[][] = [];
    narrow.subscribe((d) => heardNarrow.push(d.rows.map((r) => r.id)));
    everything.subscribe((d) => heardAll.push(d.rows.map((r) => r.id)));

    const patch = [
      { id: 'P-1', value: 1 },
      { id: 'P-9', value: 9 },
    ];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    // P-9 is at display position 9, outside [0, 3).
    expect(heardNarrow).toEqual([['P-1']]);
    // A client that declared no viewport still gets everything.
    expect(heardAll).toEqual([['P-1', 'P-9']]);

    await narrow.close();
    await everything.close();
  });

  it('sends a client nothing when its viewport holds none of the tick', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({ request: {}, startRow: 0, endRow: 3 });

    const heard: unknown[] = [];
    client.subscribe((d) => heard.push(d.rows));

    const patch = [{ id: 'P-15', value: 15 }];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    expect(heard).toEqual([]);
    await client.close();
  });

  /**
   * The viewport follows the SHAPE, not just the range: position 0 under a
   * descending sort is a different row from position 0 unsorted. A filter that
   * narrowed by position alone would push at whatever happened to be there.
   */
  it('resolves the range under the client’s own sort', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({
      request: { sortModel: [{ colId: 'value', sort: 'desc' }] },
      startRow: 0,
      endRow: 3,
    });

    const heard: unknown[][] = [];
    client.subscribe((d) => heard.push(d.rows.map((r) => r.id)));

    // Descending by value the top three are P-19, P-18, P-17.
    const patch = [
      { id: 'P-0', value: 0 },
      { id: 'P-18', value: 180 },
    ];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    expect(heard).toEqual([['P-18']]);
    await client.close();
  });

  /**
   * Under grouping a position in one level's index is NOT a displayed row
   * index, so narrowing by it would push updates at the wrong rows. The engine
   * refuses, and the host has to send the whole patch rather than guess.
   */
  it('falls back to the whole patch for a grouped viewport', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({
      request: { rowGroupCols: [{ id: 'desk', field: 'desk' }], groupKeys: [] },
      startRow: 0,
      endRow: 2,
    });

    const heard: unknown[][] = [];
    client.subscribe((d) => heard.push(d.rows.map((r) => r.id)));

    const patch = [
      { id: 'P-1', value: 1 },
      { id: 'P-19', value: 19 },
    ];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    expect(heard).toEqual([['P-1', 'P-19']]);
    await client.close();
  });

  /**
   * A removal is never narrowed. AG's block cache is far larger than a
   * viewport, so a row deleted upstream would otherwise sit in an off-screen
   * block forever and reappear on scroll.
   */
  it('sends removals to a narrowed client regardless of its range', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({ request: {}, startRow: 0, endRow: 3 });

    const heard: unknown[][] = [];
    client.subscribe((d) => heard.push(d.removed));

    engine.applyRemove(['P-17']);
    host.publish('stress', [], ['P-17']);
    await settle();

    expect(heard).toEqual([['P-17']]);
    await client.close();
  });

  /**
   * A narrowed client's size mirror must still move. A row inserted outside
   * every viewport changes the book and would otherwise reach nobody's count —
   * which is exactly the insert a cross-window "do they share a book?" check
   * relies on, and it has to be an insert because a mutation is overwritten by
   * the next sweep of the feed before a second window can read it.
   */
  it('tells a narrowed client the book grew even with no visible rows', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({ request: {}, startRow: 0, endRow: 3 });
    expect(client.size).toBe(20);

    const inserted = [{ id: 'P-NEW', desk: 'Alpha', value: 1 }];
    engine.applyUpdate(inserted);
    host.publish('stress', inserted);
    await settle();

    expect(client.size).toBe(21);
    await client.close();
  });

  it('restores full delivery when the viewport is cleared', async () => {
    const engine = book(20);
    const host = createSsrmWorkerHost({ openBook: () => ({ engine }) });
    const client = await SsrmEngineClient.open(connect(host), 'stress', { heartbeatMs: 0 });
    await client.setViewport({ request: {}, startRow: 0, endRow: 3 });
    await client.setViewport(null);

    const heard: unknown[][] = [];
    client.subscribe((d) => heard.push(d.rows.map((r) => r.id)));

    const patch = [{ id: 'P-15', value: 15 }];
    engine.applyUpdate(patch);
    host.publish('stress', patch);
    await settle();

    expect(heard).toEqual([['P-15']]);
    await client.close();
  });
});

/**
 * Ports deliver on a macrotask, and N ports do not all deliver on the SAME one.
 *
 * A single `setTimeout(0)` was enough while this file was small and became
 * flaky once the suite around it grew — the second client of a broadcast had
 * simply not been delivered to yet. Several turns instead: a client that never
 * hears still fails, which is the thing being asserted.
 */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
