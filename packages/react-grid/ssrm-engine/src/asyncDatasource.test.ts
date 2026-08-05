import { describe, expect, it, vi } from 'vitest';
import { createAsyncSsrmDatasource, type AsyncSsrmSource } from './asyncDatasource.js';
import type { SsrmGetRowsResult } from './types.js';

/**
 * RULE 1 across an async boundary: every `getRows` settles EXACTLY once.
 *
 * AG's `outboundRequests` is grid-global, decremented only in `success`/`fail`,
 * default limit 2. Every test below is one way the count could be left wrong —
 * either never decremented (a wedged grid) or decremented twice (a block
 * counted back in that AG then re-issues).
 */
function params(request = { startRow: 0, endRow: 100 }) {
  return { request, success: vi.fn(), fail: vi.fn() };
}

const empty: SsrmGetRowsResult = { rowData: [], rowCount: 0 };

function sourceOf(getRows: AsyncSsrmSource['getRows']): AsyncSsrmSource {
  return { getRows };
}

describe('the async ssrm datasource', () => {
  it('settles a served block exactly once', async () => {
    const ds = createAsyncSsrmDatasource(
      sourceOf(async () => ({ rowData: [{ id: 'a' }], rowCount: 1 })),
    );
    const p = params();
    ds.getRows(p);
    await tick();

    expect(p.success).toHaveBeenCalledTimes(1);
    expect(p.success).toHaveBeenCalledWith({ rowData: [{ id: 'a' }], rowCount: 1 });
    expect(p.fail).not.toHaveBeenCalled();
  });

  it('fails a block whose source rejects, exactly once', async () => {
    const onError = vi.fn();
    const ds = createAsyncSsrmDatasource(
      sourceOf(() => Promise.reject(new Error('the worker is gone'))),
      { onError },
    );
    const p = params();
    ds.getRows(p);
    await tick();

    expect(p.fail).toHaveBeenCalledTimes(1);
    expect(p.success).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  /** A source that throws instead of rejecting — the shape that leaks. */
  it('fails a block whose source throws synchronously', async () => {
    const ds = createAsyncSsrmDatasource(
      sourceOf(() => {
        throw new Error('bad request');
      }),
    );
    const p = params();
    ds.getRows(p);
    await tick();

    expect(p.fail).toHaveBeenCalledTimes(1);
    expect(p.success).not.toHaveBeenCalled();
  });

  /**
   * The backstop. A source that never settles must cost the block, not the
   * grid — and the late answer must NOT then be handed to AG, which has long
   * since been told the block failed.
   */
  it('fails a block that never settles, and ignores the late answer', async () => {
    let resolveLate: ((r: SsrmGetRowsResult) => void) | undefined;
    const ds = createAsyncSsrmDatasource(
      sourceOf(() => new Promise<SsrmGetRowsResult>((resolve) => (resolveLate = resolve))),
      { timeoutMs: 20 },
    );
    const p = params();
    ds.getRows(p);
    await new Promise((r) => setTimeout(r, 60));

    expect(p.fail).toHaveBeenCalledTimes(1);
    expect(p.success).not.toHaveBeenCalled();

    resolveLate?.({ rowData: [{ id: 'too late' }], rowCount: 1 });
    await tick();
    expect(p.success).not.toHaveBeenCalled();
    expect(p.fail).toHaveBeenCalledTimes(1);
  });

  /**
   * Pivot mode only. Dropping these is SILENT: rows arrive carrying pivoted
   * cells that no column renders, and the grid shows a correct hierarchy with
   * nothing in it.
   */
  it('forwards pivotResultFields, and omits the key when there are none', async () => {
    const withPivot = createAsyncSsrmDatasource(
      sourceOf(async () => ({ ...empty, pivotResultFields: ['USD_value'] })),
    );
    const a = params();
    withPivot.getRows(a);
    await tick();
    expect(a.success).toHaveBeenCalledWith({
      rowData: [],
      rowCount: 0,
      pivotResultFields: ['USD_value'],
    });

    const flat = createAsyncSsrmDatasource(sourceOf(async () => empty));
    const b = params();
    flat.getRows(b);
    await tick();
    expect(b.success).toHaveBeenCalledWith({ rowData: [], rowCount: 0 });
  });

  it('reports level totals before the block is served', async () => {
    const order: string[] = [];
    const ds = createAsyncSsrmDatasource(
      sourceOf(async () => ({ ...empty, groupLevelInfo: { value: 42 } })),
      { onLevelTotals: () => order.push('totals') },
    );
    const p = params();
    p.success.mockImplementation(() => order.push('success'));
    ds.getRows(p);
    await tick();

    expect(order).toEqual(['totals', 'success']);
  });

  /**
   * The boundary cost, measured where AG actually waits. The difference between
   * this and the in-process figure IS the worker.
   */
  it('measures every block, served or failed', async () => {
    const onBlock = vi.fn();
    const ok = createAsyncSsrmDatasource(sourceOf(async () => empty), { onBlock });
    ok.getRows(params());
    await tick();
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onBlock.mock.calls[0][1]).toBe('ok');
    expect(typeof onBlock.mock.calls[0][0]).toBe('number');

    const bad = createAsyncSsrmDatasource(sourceOf(() => Promise.reject(new Error('no'))), {
      onBlock,
    });
    bad.getRows(params());
    await tick();
    expect(onBlock).toHaveBeenCalledTimes(2);
    expect(onBlock.mock.calls[1][1]).toBe('fail');
  });
});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
