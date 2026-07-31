import { describe, expect, it, vi } from 'vitest';
import type { ColumnDefinition, MockPerspectiveProviderConfig } from '@starui/types';
import { startMockPerspective } from './mockPerspective.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';

const mockCalls: { cfg: Record<string, unknown>; emit: (e: unknown) => void }[] = [];
const stopped: string[] = [];
const restarted: unknown[] = [];

vi.mock('./mock.js', () => ({
  startMock: vi.fn((cfg: Record<string, unknown>, emit: (e: unknown) => void) => {
    mockCalls.push({ cfg, emit });
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

const COLS: ColumnDefinition[] = [
  { field: 'id', headerName: 'Id' },
  { field: 'midPrice', headerName: 'Mid' },
];

const baseCfg = (over: Partial<MockPerspectiveProviderConfig> = {}) =>
  ({
    providerType: 'mock-perspective',
    dataType: 'positions',
    keyColumn: 'id',
    rowCount: 10,
    columnDefinitions: COLS,
    ...over,
  }) as MockPerspectiveProviderConfig;

const reset = () => {
  mockCalls.length = 0;
  stopped.length = 0;
  restarted.length = 0;
};

describe('startMockPerspective', () => {
  it('delegates generation to startMock as a plain mock config', () => {
    reset();
    const { host } = makeHost();
    startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    // A fork would drift from the mock generator; this must BE it.
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0]!.cfg.providerType).toBe('mock');
    expect(mockCalls[0]!.cfg.dataType).toBe('positions');
    expect(mockCalls[0]!.cfg.rowCount).toBe(10);
  });

  /**
   * The one place this deliberately differs from `mock`, and it is not a
   * preference. A Perspective schema is a flat map of typed columns; the mock
   * positions row is deeply nested, and `observeRows` reports nested columns
   * and drops them — a Table with a fraction of its columns and no error.
   */
  it("defaults rowShape to 'ssrm' so rows reach the Table flat", () => {
    reset();
    const { host } = makeHost();
    startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    expect(mockCalls[0]!.cfg.rowShape).toBe('ssrm');
  });

  it('lets a config ask for csrm explicitly, and then builds no Table', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(baseCfg({ rowShape: 'csrm' }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
    });

    expect(mockCalls[0]!.cfg.rowShape).toBe('csrm');
    // Refused loudly rather than served short.
    expect(handle.feed).toBeNull();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'index-invalid' }),
    );
  });

  it('refuses to build a Table with no columnDefinitions to flatten with', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(baseCfg({ columnDefinitions: [] }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
    });

    expect(handle.feed).toBeNull();
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/columnDefinitions/);
  });

  it('forwards every event to the push path untouched', async () => {
    reset();
    const { host } = makeHost();
    const downstream = vi.fn();
    startMockPerspective(baseCfg(), downstream, { perspectiveHost: host });

    const emit = mockCalls[0]!.emit;
    emit({ status: 'loading' });
    emit({ rows: [{ id: 'a', midPrice: 1 }], replace: true });
    emit({ status: 'ready' });

    // The Table is a side effect, never a replacement: anything already
    // subscribed to this provider must see exactly what it saw before.
    expect(downstream).toHaveBeenCalledTimes(3);
    expect(downstream).toHaveBeenNthCalledWith(1, { status: 'loading' });
    expect(downstream).toHaveBeenNthCalledWith(2, {
      rows: [{ id: 'a', midPrice: 1 }],
      replace: true,
    });
  });

  it('hosts the Table under the configured name, defaulting to positions', () => {
    reset();
    const { host } = makeHost();
    const a = startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    expect(a.tableName).toBe('positions');

    reset();
    const b = startMockPerspective(baseCfg({ tableName: 'lab-book' }), () => {}, {
      perspectiveHost: host,
    });
    expect(b.tableName).toBe('lab-book');
    expect(host.tableFactoryFor).toHaveBeenLastCalledWith('lab-book');
  });

  it('builds no Table for a composite key, and says why', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(
      baseCfg({ keyColumn: ['cusip', 'accountId'] }),
      () => {},
      { perspectiveHost: host, onDiagnostic },
    );

    // Indexing on the first column instead would make rows collide and
    // overwrite each other — a wrong book is worse than no Table.
    expect(handle.feed).toBeNull();
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/composite keyColumn/);
    // The push path still runs.
    expect(mockCalls).toHaveLength(1);
  });

  it('runs the push path with no host at all', () => {
    reset();
    const handle = startMockPerspective(baseCfg(), () => {});

    // A worker built without the engine still serves this provider.
    expect(handle.feed).toBeNull();
    expect(mockCalls).toHaveLength(1);
  });

  it('stops the transport before the feed', async () => {
    reset();
    const { host } = makeHost();
    const handle = startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    await handle.stop();

    // Ordering matters: nothing may arrive for a Table already gone.
    expect(stopped).toEqual(['transport']);
  });

  it('keeps the Table across a restart', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    const emit = mockCalls[0]!.emit;
    emit({ rows: [{ id: 'a', midPrice: 1 }], replace: true });
    emit({ status: 'ready' });
    await Promise.resolve();
    await Promise.resolve();

    await handle.restart({ rowCount: 5 });

    // Dropping it here would leave every attached window looking at a missing
    // table for the length of a snapshot.
    expect(restarted).toEqual([{ rowCount: 5 }]);
    expect(tables.every((t) => !t.deleted)).toBe(true);
  });
});
