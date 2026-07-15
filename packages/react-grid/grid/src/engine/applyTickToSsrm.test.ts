import { describe, expect, it, vi } from 'vitest';
import { applyTickToSsrm } from './applyTickToSsrm.js';

describe('applyTickToSsrm', () => {
  it('forwards updates to applyTransactionAsync', () => {
    const applyTransactionAsync = vi.fn();
    applyTickToSsrm({ applyTransactionAsync }, [{ id: 'a', pnl: 1 }]);
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'a', pnl: 1 }],
    });
  });

  it('materializes calc fields before forwarding updates', () => {
    const applyTransactionAsync = vi.fn();
    const evalRow = vi.fn(() => 99);
    applyTickToSsrm(
      { applyTransactionAsync },
      [{ id: 'a', pnl: 1 }],
      {
        materialize: {
          materializePlans: [{ kind: 'materialize', colId: 'calc', expression: '[pnl]' }],
          evalRow,
        },
      },
    );
    expect(evalRow).toHaveBeenCalled();
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'a', pnl: 1, calc: 99 }],
    });
  });
});
