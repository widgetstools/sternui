import { describe, expect, it, vi } from 'vitest';
import { editWriterFromPlatform } from './editWriterFromPlatform.js';

describe('editWriterFromPlatform', () => {
  it('routes applyTransactionAsync through platform.applyDataTransaction', async () => {
    const applyDataTransaction = vi.fn();
    const getRowNode = vi.fn((id: string) =>
      id === 'a' ? { data: { id: 'a', midPrice: 100 } } : undefined,
    );
    const apiApply = vi.fn();
    const writer = editWriterFromPlatform({
      api: { api: { getRowNode, applyTransactionAsync: apiApply } },
      applyDataTransaction,
    });
    expect(writer).not.toBeNull();
    expect(writer!.getRowNode('a')?.data).toEqual({ id: 'a', midPrice: 100 });
    await writer!.applyTransactionAsync({ update: [{ id: 'a', midPrice: 110 }] });
    expect(applyDataTransaction).toHaveBeenCalledWith({ update: [{ id: 'a', midPrice: 110 }] });
    expect(apiApply).not.toHaveBeenCalled();
  });

  it('falls back to GridApi when host applier is missing', async () => {
    const apiApply = vi.fn();
    const writer = editWriterFromPlatform({
      api: {
        api: {
          getRowNode: () => ({ data: { id: 'a' } }),
          applyTransactionAsync: apiApply,
        },
      },
    });
    await writer!.applyTransactionAsync({ update: [{ id: 'a', midPrice: 1 }] });
    expect(apiApply).toHaveBeenCalledWith({ update: [{ id: 'a', midPrice: 1 }] });
  });
});
