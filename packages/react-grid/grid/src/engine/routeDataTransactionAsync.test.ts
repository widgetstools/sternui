import { describe, expect, it, vi } from 'vitest';
import { resolveSsrmHandle, routeDataTransactionAsync } from './routeDataTransactionAsync.js';

describe('routeDataTransactionAsync', () => {
  const tx = { update: [{ id: 'a', pnl: 1 }] };

  it('routes to SSRM applyTransactionAsync when useSSRM is true', () => {
    const ssrmApply = vi.fn();
    const gridApply = vi.fn();
    routeDataTransactionAsync(
      true,
      tx,
      { applyTransactionAsync: ssrmApply },
      { applyTransactionAsync: gridApply },
    );
    expect(ssrmApply).toHaveBeenCalledWith(tx);
    expect(gridApply).not.toHaveBeenCalled();
  });

  it('routes to GridApi applyTransactionAsync when useSSRM is false', () => {
    const ssrmApply = vi.fn();
    const gridApply = vi.fn();
    const callback = vi.fn();
    routeDataTransactionAsync(
      false,
      tx,
      { applyTransactionAsync: ssrmApply },
      { applyTransactionAsync: gridApply },
      callback,
    );
    expect(gridApply).toHaveBeenCalledWith(tx, callback);
    expect(ssrmApply).not.toHaveBeenCalled();
  });

  it('materializes SSRM calc fields on update before routing', () => {
    const ssrmApply = vi.fn();
    const evalRow = vi.fn(() => 42);
    routeDataTransactionAsync(
      true,
      tx,
      { applyTransactionAsync: ssrmApply },
      undefined,
      undefined,
      {
        materializePlans: [{ kind: 'materialize', colId: 'calc', expression: '[pnl]' }],
        evalRow,
      },
    );
    expect(evalRow).toHaveBeenCalled();
    expect(ssrmApply).toHaveBeenCalledWith({
      update: [{ id: 'a', pnl: 1, calc: 42 }],
    });
  });
});

describe('resolveSsrmHandle', () => {
  it('returns null when useSSRM is false', () => {
    expect(resolveSsrmHandle(false, { applyTransactionAsync: vi.fn() } as never)).toBeNull();
  });

  it('returns the handle when useSSRM is true', () => {
    const handle = { applyTransactionAsync: vi.fn() };
    expect(resolveSsrmHandle(true, handle as never)).toBe(handle);
  });
});
