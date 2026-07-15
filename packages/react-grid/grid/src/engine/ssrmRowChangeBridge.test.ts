import { describe, expect, it, vi } from 'vitest';
import { publishSsrmTransactionDelta } from './ssrmRowChangeBridge.js';

describe('publishSsrmTransactionDelta', () => {
  it('maps update/add/remove rows onto publishExternalDelta', () => {
    const publishExternalDelta = vi.fn();
    publishSsrmTransactionDelta(
      { subscribe: () => () => {}, publishExternalDelta },
      {
        update: [{ id: 'a', midPrice: 101 }],
        add: [{ id: 'b', midPrice: 99 }],
        remove: [{ id: 'c' }],
      },
      'id',
    );
    expect(publishExternalDelta).toHaveBeenCalledWith({
      updated: [{ id: 'a', data: { id: 'a', midPrice: 101 } }],
      added: [{ id: 'b', data: { id: 'b', midPrice: 99 } }],
      removed: [{ id: 'c', data: { id: 'c' } }],
    });
  });

  it('no-ops when the bus cannot publish', () => {
    expect(() =>
      publishSsrmTransactionDelta({ subscribe: () => () => {} }, {
        update: [{ id: 'a' }],
      }),
    ).not.toThrow();
  });
});
