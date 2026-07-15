import { describe, expect, it } from 'vitest';

/**
 * Snapshot-assembly contract for chunked hub delivers:
 * SharedWorker splits large replace snapshots into ≤500-row delta-bin
 * chunks (first replace=true, tail replace=false). While status is
 * still `loading`, React `rowData` must accumulate the full book —
 * especially under SSRM where the grid API is often ready mid-flight
 * and tick-style applyTx must not swallow the tail chunks.
 */
describe('applyLabStreamDelta snapshot chunk merge', () => {
  it('merges non-replace chunks into the snapshot via applyDelta', async () => {
    const { applyLabStreamDelta } = await import('./applyLabStreamDelta');
    const a = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, n: i }));
    const b = Array.from({ length: 500 }, (_, i) => ({ id: `r${500 + i}`, n: 500 + i }));

    const afterHead = applyLabStreamDelta(null, [], a, true, null);
    expect(afterHead).toHaveLength(500);

    const afterTail = applyLabStreamDelta(null, afterHead, b, false, null);
    expect(afterTail).toHaveLength(1000);
    expect(afterTail[999]?.id).toBe('r999');
  });

  it('skips grid writes when applyTx is null (assembly mode)', async () => {
    const { applyLabStreamDelta } = await import('./applyLabStreamDelta');
    const chunk = [{ id: 'r0', n: 0 }];
    const after = applyLabStreamDelta(null, [], chunk, false, null);
    expect(after).toHaveLength(1);
  });
});
