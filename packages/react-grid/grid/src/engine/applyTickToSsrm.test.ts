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
});
