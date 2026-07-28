import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import {
  clearPendingAddsFromTransaction,
  createApplyProviderToGridState,
  splitProviderRowsForGrid,
} from './applyProviderToGrid.js';

type Row = { id: string; price?: number; name?: string };

function makeGridApi(opts: {
  existingIds?: Set<string>;
  /** Existing full-row data by id, so `getRowNode(id).data` drives merges. */
  existingData?: Record<string, Row>;
  onApply?: (tx: { add?: Row[]; update?: Row[] }, cb?: (result: { add: { id: string }[] }) => void) => void;
} = {}): GridApi<Row> {
  const existing =
    opts.existingIds ??
    (opts.existingData ? new Set(Object.keys(opts.existingData)) : new Set<string>());
  const applyTransactionAsync = vi.fn((
    tx: { add?: Row[]; update?: Row[] },
    cb?: (result: { add: { id: string }[] }) => void,
  ) => {
    if (opts.onApply) {
      opts.onApply(tx, cb);
      return;
    }
    // Default: defer callback so pending-add bookkeeping is observable.
  });

  return {
    applyTransactionAsync,
    getRowNode: (id: string) =>
      existing.has(id) ? ({ id, data: opts.existingData?.[id] } as never) : null,
  } as unknown as GridApi<Row>;
}

describe('splitProviderRowsForGrid', () => {
  it('routes existing grid rows to updates', () => {
    const pending = new Set<string>();
    const api = makeGridApi({ existingIds: new Set(['r1']) });

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 2 }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([{ id: 'r1', price: 2 }]);
    expect(coalescedPending).toBe(0);
    expect(pending.size).toBe(0);
  });

  it('queues new rows as adds and tracks pending ids', () => {
    const pending = new Set<string>();
    const api = makeGridApi();

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1' }, { id: 'r2' }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(updates).toEqual([]);
    expect(coalescedPending).toBe(0);
    expect(pending).toEqual(new Set(['r1', 'r2']));
  });

  it('coalesces duplicate ticks for ids with a pending add', () => {
    const pending = new Set<string>(['r1']);
    const latest = new Map<string, Row>();
    const api = makeGridApi();

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 99 }],
      'id',
      api,
      pending,
      latest,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([]);
    expect(coalescedPending).toBe(1);
    expect(latest.get('r1')).toEqual({ id: 'r1', price: 99 });
  });

  it('prefers getRowNode over pendingAddIds when the row is already in the grid', () => {
    const pending = new Set<string>(['r1']);
    const api = makeGridApi({ existingIds: new Set(['r1']) });

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 3 }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([{ id: 'r1', price: 3 }]);
    expect(coalescedPending).toBe(0);
  });

  it('classifies via knownRowIds; reads getRowNode only to merge update data', () => {
    const pending = new Set<string>();
    const known = new Set(['r1', 'r2']);
    // No existing data on the nodes → merge is identity, updates stay raw.
    const getRowNode = vi.fn((id: string) => ({ id, data: undefined }) as never);
    const api = { getRowNode } as unknown as GridApi<Row>;

    const { adds, updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    expect(updates).toEqual([{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }]);
    expect(adds).toEqual([]);
    // Classification came from knownRowIds (both were updates), and each update
    // read getRowNode once to fetch existing data for the merge.
    expect(getRowNode).toHaveBeenCalledTimes(2);
  });

  it('merges partial (sparse) deltas onto the existing row so no field blanks', () => {
    const pending = new Set<string>();
    const known = new Set(['r1']);
    // Existing full row; delta carries only id + one changed field.
    const api = makeGridApi({ existingData: { r1: { id: 'r1', price: 10, name: 'ACME' } as Row } });

    const { updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 11 }],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    // price updated, name preserved (not wiped to undefined).
    expect(updates).toEqual([{ id: 'r1', price: 11, name: 'ACME' }]);
  });

  it('full-row deltas overwrite every field (merge is a superset of replace)', () => {
    const pending = new Set<string>();
    const known = new Set(['r1']);
    const api = makeGridApi({ existingData: { r1: { id: 'r1', price: 10, name: 'ACME' } as Row } });

    const { updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 11, name: 'BETA' } as Row],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    expect(updates).toEqual([{ id: 'r1', price: 11, name: 'BETA' }]);
  });

  it('queues brand-new ids as adds when knownRowIds is populated', () => {
    const pending = new Set<string>();
    const known = new Set(['r1']);
    const api = makeGridApi();

    const { adds, updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    expect(updates).toEqual([{ id: 'r1', price: 1 }]);
    expect(adds).toEqual([{ id: 'r2', price: 2 }]);
    expect(pending).toEqual(new Set(['r2']));
  });
});

describe('createApplyProviderToGridState', () => {
  it('applies all rows as updates when rowIdField is missing', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();
    const rows = [{ id: 'r1' }, { id: 'r2' }];

    state.applyTick(api, rows, undefined);

    expect(api.applyTransactionAsync).toHaveBeenCalledWith({ update: rows });
  });

  it('applies split add/update transaction and clears pending on callback', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();

    state.applyTick(api, [{ id: 'r1' }], 'id');
    expect(state.getPendingAddCount()).toBe(1);

    const cb = vi.mocked(api.applyTransactionAsync).mock.calls[0][1]!;
    cb({ add: [{ id: 'r1' } as never], update: [], remove: [] });

    expect(state.getPendingAddCount()).toBe(0);
  });

  it('applies coalesced updates after pending adds land', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();

    state.applyTick(api, [{ id: 'r1', price: 1 }], 'id');
    state.applyTick(api, [{ id: 'r1', price: 99 }], 'id');

    const cb = vi.mocked(api.applyTransactionAsync).mock.calls[0][1]!;
    cb({ add: [{ id: 'r1' } as never], update: [], remove: [] });

    expect(api.applyTransactionAsync).toHaveBeenCalledTimes(2);
    expect(api.applyTransactionAsync).toHaveBeenLastCalledWith({
      update: [{ id: 'r1', price: 99 }],
    });
  });

  it('merges coalesced partial deltas onto the just-added row', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();

    // r1 arrives as a full add, then a partial delta (id + price) coalesces.
    state.applyTick(api, [{ id: 'r1', price: 1, name: 'ACME' } as Row], 'id');
    state.applyTick(api, [{ id: 'r1', price: 99 }], 'id');

    // The add lands carrying the full row data.
    const cb = vi.mocked(api.applyTransactionAsync).mock.calls[0][1]!;
    cb({ add: [{ id: 'r1', data: { id: 'r1', price: 1, name: 'ACME' } } as never], update: [], remove: [] });

    // Coalesced delta merged onto the added row — name preserved, price updated.
    expect(api.applyTransactionAsync).toHaveBeenLastCalledWith({
      update: [{ id: 'r1', price: 99, name: 'ACME' }],
    });
  });

  it('clearPendingAdds resets pending bookkeeping', () => {
    const pending = new Set<string>(['r1', 'r2']);
    const known = new Set<string>(['r1']);
    clearPendingAddsFromTransaction(pending, { add: [{ id: 'r1' } as never] }, known);
    expect(pending).toEqual(new Set(['r2']));
    expect(known).toEqual(new Set(['r1']));

    const state = createApplyProviderToGridState();
    state.applyTick(makeGridApi(), [{ id: 'x' }], 'id');
    expect(state.getPendingAddCount()).toBe(1);
    state.clearPendingAdds();
    expect(state.getPendingAddCount()).toBe(0);
  });

  it('markSnapshotLoaded classifies without getRowNode; updates merge onto existing rows', () => {
    const state = createApplyProviderToGridState();
    // Existing full rows carry a categorical field the deltas omit.
    const api = makeGridApi({
      existingData: {
        r1: { id: 'r1', price: 1, name: 'ACME' } as Row,
        r2: { id: 'r2', price: 2, name: 'BETA' } as Row,
      },
    });

    state.markSnapshotLoaded([{ id: 'r1' }, { id: 'r2' }], 'id');
    state.applyTick(api, [{ id: 'r1', price: 9 }, { id: 'r2', price: 8 }], 'id');

    // Partial deltas (id + price) merged onto existing rows — name preserved.
    expect(api.applyTransactionAsync).toHaveBeenCalledWith({
      add: [],
      update: [
        { id: 'r1', price: 9, name: 'ACME' },
        { id: 'r2', price: 8, name: 'BETA' },
      ],
    }, expect.any(Function));
  });
});
