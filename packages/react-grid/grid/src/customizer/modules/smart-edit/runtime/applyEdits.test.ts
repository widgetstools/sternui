import { describe, expect, it, vi } from 'vitest';
import { applyEdits, resolveTargetCells } from './applyEdits.js';

describe('applyEdits', () => {
  it('applies transaction updates', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({
        data: { id: 'r1', qty: 100, ticker: 'ABC' },
      }),
    } as never;
    const count = await applyEdits(
      api,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 100 }],
      'multiply',
      2,
      'id',
    );
    expect(count).toBe(1);
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'r1', qty: 200, ticker: 'ABC' }],
    });
  });

  it('merges multiple cell edits on the same row', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({
        data: { id: 'r1', qty: 100, midPrice: 50, ticker: 'ABC' },
      }),
    } as never;
    await applyEdits(
      api,
      [
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 100 },
        { rowId: 'r1', colId: 'midPrice', field: 'midPrice', value: 50 },
      ],
      'set',
      0,
      'id',
    );
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'r1', qty: 0, midPrice: 0, ticker: 'ABC' }],
    });
  });

  it('returns 0 when no valid updates', async () => {
    const applyTransactionAsync = vi.fn();
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', qty: 100 } }),
    } as never;
    const count = await applyEdits(
      api,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 'bad' }],
      'multiply',
      2,
    );
    expect(count).toBe(0);
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });
});

describe('resolveTargetCells', () => {
  it('prefers range over focus', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'qty' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 10,
      getFocusedCell: () => null,
    };
    expect(resolveTargetCells(api as never)).toHaveLength(1);
  });
});
