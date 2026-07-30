import { describe, expect, it } from 'vitest';
import { isServerSideEngine, type GridEngineKind } from './types.js';

describe('isServerSideEngine', () => {
  /**
   * This predicate answers one question: does the window hold the whole book,
   * or only the blocks in view? Several features branch on it — saved-filter
   * recounts, the row-exclusion note, and the alerts "Rescan full book" panel —
   * and every one of them was originally written as `=== 'ssrm'`, which read
   * the Perspective path as CSRM and silently disabled itself there.
   */
  it('is true for BOTH server-side engines, not just the older one', () => {
    expect(isServerSideEngine('ssrm')).toBe(true);
    expect(isServerSideEngine('perspective')).toBe(true);
  });

  it('is false only for the client-side row model', () => {
    expect(isServerSideEngine('csrm')).toBe(false);
  });

  it('covers every kind the union admits', () => {
    // A new engine added to the union without a decision here would default to
    // whatever `!== 'csrm'` happens to give it.
    const all: GridEngineKind[] = ['csrm', 'ssrm', 'perspective'];
    expect(all.map(isServerSideEngine)).toEqual([false, true, true]);
  });
});
