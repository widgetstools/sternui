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

/** Ports deliver on a macrotask; a push is not visible on the same tick. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
