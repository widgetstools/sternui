import { describe, expect, it, vi } from 'vitest';
import type { StompPerspectiveProviderConfig } from '@starui/types';
import { startStompPerspective } from './stompPerspective.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';

const stompCalls: { cfg: unknown; emit: (e: unknown) => void }[] = [];
const stopped: string[] = [];
const restarted: unknown[] = [];

vi.mock('./stomp.js', () => ({
  startStomp: vi.fn((cfg: unknown, emit: (e: unknown) => void) => {
    stompCalls.push({ cfg, emit });
    return {
      stop: async () => {
        stopped.push('transport');
      },
      restart: async (extra?: unknown) => {
        restarted.push(extra ?? null);
      },
    };
  }),
}));

function makeHost() {
  const tables: { name: string; updates: unknown[][]; deleted: boolean }[] = [];
  const host = {
    tableFactoryFor: vi.fn((name: string) => async () => {
      const record = { name, updates: [] as unknown[][], deleted: false };
      tables.push(record);
      return {
        update: async (rows: unknown) => {
          record.updates.push(rows as unknown[]);
        },
        delete: async () => {
          record.deleted = true;
        },
      };
    }),
  } as unknown as PerspectiveHost;
  return { host, tables };
}

const baseCfg = (over: Partial<StompPerspectiveProviderConfig> = {}) =>
  ({
    providerType: 'stomp-perspective',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/T1',
    keyColumn: 'positionId',
    ...over,
  }) as StompPerspectiveProviderConfig;

const reset = () => {
  stompCalls.length = 0;
  stopped.length = 0;
  restarted.length = 0;
};

describe('startStompPerspective', () => {
  it('delegates the wire to startStomp as a plain stomp config', () => {
    reset();
    const { host } = makeHost();
    startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    // A fork would drift from the STOMP transport; this must BE it.
    expect(stompCalls).toHaveLength(1);
    expect((stompCalls[0].cfg as { providerType: string }).providerType).toBe('stomp');
    expect((stompCalls[0].cfg as { websocketUrl: string }).websocketUrl).toBe('ws://localhost:8081');
  });

  it('forwards every event to the push path untouched', async () => {
    reset();
    const { host } = makeHost();
    const downstream = vi.fn();
    startStompPerspective(baseCfg(), downstream, { perspectiveHost: host });

    const event = { rows: [{ positionId: 'p1' }], replace: true };
    stompCalls[0].emit(event);

    // Anything already subscribed keeps working exactly as before.
    expect(downstream).toHaveBeenCalledWith(event);
  });

  it('builds the Table under the configured name', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg({ tableName: 'blotter' }), () => {}, {
      perspectiveHost: host,
    });

    stompCalls[0].emit({ rows: [{ positionId: 'p1', v: 1 }], replace: true });
    stompCalls[0].emit({ status: 'ready' });
    await handle.feed?.drain();

    expect(handle.tableName).toBe('blotter');
    expect(tables[0].name).toBe('blotter');
  });

  // Perspective indexes by ONE scalar. Indexing on the first of a composite
  // key would make distinct rows collide and silently overwrite each other.
  it('refuses to build a Table for a composite keyColumn, and says why', () => {
    reset();
    const { host, tables } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startStompPerspective(
      baseCfg({ keyColumn: ['bookId', 'positionId'] }),
      () => {},
      { perspectiveHost: host, onDiagnostic },
    );

    expect(handle.feed).toBeNull();
    expect(tables).toHaveLength(0);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'index-invalid' }),
    );
  });

  it('refuses without a keyColumn at all', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startStompPerspective(baseCfg({ keyColumn: undefined }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
    });

    expect(handle.feed).toBeNull();
    expect(onDiagnostic).toHaveBeenCalled();
  });

  it('still serves the push path when no Perspective host is available', () => {
    reset();
    const downstream = vi.fn();
    // A worker that never opens a blotter does not load the engine wasm.
    const handle = startStompPerspective(baseCfg(), downstream, {});

    expect(handle.feed).toBeNull();
    stompCalls[0].emit({ rows: [{ positionId: 'p1' }] });
    expect(downstream).toHaveBeenCalled();
  });

  it('stops the transport BEFORE the feed, so nothing arrives for a dead Table', async () => {
    reset();
    const { host } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    const order: string[] = [];
    const feedStop = handle.feed!.stop.bind(handle.feed);
    handle.feed!.stop = async () => {
      order.push('feed');
      await feedStop();
    };
    stopped.length = 0;

    await handle.stop();
    expect(stopped).toEqual(['transport']);
    expect(order).toEqual(['feed']);
  });

  it('keeps the Table across a restart — the feed rebuilds it from the new book', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    stompCalls[0].emit({ rows: [{ positionId: 'p1' }], replace: true });
    stompCalls[0].emit({ status: 'ready' });
    await handle.feed?.drain();

    await handle.restart({ asOfDate: '2024-05-28' });

    // Dropping it here would leave every attached window looking at a missing
    // table for the length of a snapshot.
    expect(tables[0].deleted).toBe(false);
    expect(restarted).toEqual([{ asOfDate: '2024-05-28' }]);
  });

  it('passes the schema options through to the feed', async () => {
    reset();
    const { host } = makeHost();
    const handle = startStompPerspective(
      baseCfg({ integerColumns: ['couponFrequency'] }),
      () => {},
      { perspectiveHost: host },
    );

    stompCalls[0].emit({ rows: [{ positionId: 'p1', couponFrequency: 2 }], replace: true });
    stompCalls[0].emit({ status: 'ready' });
    await handle.feed?.drain();

    expect(handle.feed?.schema?.couponFrequency).toBe('integer');
  });
});

describe('startStompPerspective — schema from config', () => {
  // The blotter should paint on open. Inferring from rows means no Table until
  // the snapshot completes (~18s measured), and no Table means a window has
  // nothing to attach to.
  it('builds the Table before any rows when the config declares its fields', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({
        inferredFields: [
          { path: 'positionId', type: 'string', nullable: false },
          { path: 'pnl', type: 'number', nullable: false },
        ] as never,
      }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
    await expect(handle.feed!.whenReady()).resolves.toBeDefined();
  });

  it('falls back to columnDefinitions when there are no inferredFields', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({
        columnDefinitions: [
          { field: 'positionId', headerName: 'Id', cellDataType: 'text' },
          { field: 'pnl', headerName: 'PnL', cellDataType: 'number' },
        ] as never,
      }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
  });

  it('infers from rows when the declaration does not cover the index column', async () => {
    // An unindexable Table is worse than a late one: update() would append
    // instead of upsert and every tick would grow the book.
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({
        inferredFields: [{ path: 'pnl', type: 'number', nullable: false }] as never,
      }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(0);

    stompCalls[0].emit({ rows: [{ positionId: 'p1', pnl: 1 }], replace: true });
    stompCalls[0].emit({ status: 'ready' });
    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
  });

  it('waits for rows when the config declares nothing', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    await handle.feed?.drain();
    expect(tables).toHaveLength(0);
  });
});
