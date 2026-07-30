import { describe, expect, it, vi } from 'vitest';
import { exportVisualExcel } from './exportVisualExcel';

const created: Record<string, unknown>[] = [];
const detachedExports: Record<string, unknown>[] = [];
const destroyed: number[] = [];

vi.mock('ag-grid-community', () => ({
  createGrid: (_host: unknown, options: Record<string, unknown>) => {
    created.push(options);
    return {
      applyColumnState: vi.fn(),
      exportDataAsExcel: (o: Record<string, unknown>) => detachedExports.push(o),
      destroy: () => destroyed.push(created.length),
    };
  },
}));

const SETTINGS = { enabled: true, fileNamePrefix: 'markets-grid' };

/** A grid api that either does or does not carry a Perspective engine. */
function makeApi(
  engine: { readAllRows(): Promise<Record<string, unknown>[] | null> } | null,
) {
  const ownExports: Record<string, unknown>[] = [];
  const api = {
    getGridOption: (k: string) =>
      k === 'context'
        ? engine
          ? { perspectiveEngineHolder: { get: () => engine } }
          : {}
        : undefined,
    exportDataAsExcel: (o: Record<string, unknown>) => ownExports.push(o),
    getColumnDefs: () => [{ field: 'positionId' }, { field: 'pnl' }],
    getColumnState: () => [{ colId: 'pnl', hide: false }],
  };
  return { api, ownExports };
}

const reset = () => {
  created.length = 0;
  detachedExports.length = 0;
  destroyed.length = 0;
};

describe('exportVisualExcel', () => {
  it('uses the grid own exporter when there is no Perspective engine', () => {
    reset();
    const { api, ownExports } = makeApi(null);
    exportVisualExcel(api as never, SETTINGS);

    expect(ownExports).toHaveLength(1);
    expect(created).toHaveLength(0);
  });

  it('exports the WHOLE book through a detached grid on the Perspective path', async () => {
    // `exportDataAsExcel` under a server row model can only see the block
    // cache — a few hundred rows of a 20,000-row book, with nothing to say the
    // file is short.
    reset();
    const rows = Array.from({ length: 5000 }, (_, i) => ({ positionId: `p${i}`, pnl: i }));
    const { api, ownExports } = makeApi({ readAllRows: async () => rows });

    exportVisualExcel(api as never, SETTINGS);
    await vi.waitFor(() => expect(detachedExports).toHaveLength(1));

    expect(ownExports).toHaveLength(0);
    expect((created[0].rowData as unknown[]).length).toBe(5000);
  });

  it('gives the detached grid the same column defs, so formatting survives', async () => {
    reset();
    const { api } = makeApi({ readAllRows: async () => [{ positionId: 'p0' }] });
    exportVisualExcel(api as never, SETTINGS);
    await vi.waitFor(() => expect(detachedExports).toHaveLength(1));

    expect(created[0].columnDefs).toEqual([{ field: 'positionId' }, { field: 'pnl' }]);
  });

  it('always destroys the detached grid, or the book leaks with it', async () => {
    reset();
    const { api } = makeApi({ readAllRows: async () => [{ positionId: 'p0' }] });
    exportVisualExcel(api as never, SETTINGS);
    await vi.waitFor(() => expect(destroyed).toHaveLength(1));
  });

  it('reports rather than writing a short file when the book cannot be read', async () => {
    // null means "past the export ceiling, or the read failed" — a file that
    // stopped early is indistinguishable from a complete one once opened.
    reset();
    const onError = vi.fn();
    const { api, ownExports } = makeApi({ readAllRows: async () => null });

    exportVisualExcel(api as never, SETTINGS, { onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(detachedExports).toHaveLength(0);
    expect(ownExports).toHaveLength(0);
  });

  it('reports a rejected read instead of throwing into the click handler', async () => {
    reset();
    const onError = vi.fn();
    const { api } = makeApi({
      readAllRows: async () => {
        throw new Error('engine busy');
      },
    });

    exportVisualExcel(api as never, SETTINGS, { onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it('keeps the grid own exporter for an only-selected export', () => {
    // Selection lives on the row nodes this grid holds, so that export is
    // already correct and complete without reading the book.
    reset();
    const { api, ownExports } = makeApi({ readAllRows: async () => [] });
    exportVisualExcel(api as never, SETTINGS, { onlySelected: true });

    expect(ownExports).toHaveLength(1);
    expect(created).toHaveLength(0);
  });

  it('passes the formatter callback through, on both paths', async () => {
    reset();
    const { api, ownExports } = makeApi(null);
    exportVisualExcel(api as never, SETTINGS);
    const cb = ownExports[0].processCellCallback as (p: {
      value: unknown;
      formatValue(v: unknown): unknown;
    }) => unknown;
    expect(cb({ value: 1, formatValue: () => '1.00' })).toBe('1.00');

    reset();
    const perspective = makeApi({ readAllRows: async () => [{ positionId: 'p0' }] });
    exportVisualExcel(perspective.api as never, SETTINGS);
    await vi.waitFor(() => expect(detachedExports).toHaveLength(1));
    expect(typeof detachedExports[0].processCellCallback).toBe('function');
  });
});
