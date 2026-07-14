import { describe, expect, it } from 'vitest';
import { resolveRowStore } from './PerspectiveEngineRegistry';

describe('resolveRowStore', () => {
  it('defaults to memory', () => {
    expect(resolveRowStore(undefined)).toBe('memory');
    expect(resolveRowStore(null)).toBe('memory');
  });

  it('honours explicit rowStore', () => {
    expect(resolveRowStore({ rowStore: 'perspective' })).toBe('perspective');
    expect(resolveRowStore({ rowStore: 'memory' })).toBe('memory');
  });

  it('honours ssrm.enabled auto threshold', () => {
    expect(resolveRowStore({ ssrm: { enabled: 'auto', thresholdRows: 100 } }, 99)).toBe('memory');
    expect(resolveRowStore({ ssrm: { enabled: 'auto', thresholdRows: 100 } }, 100)).toBe('perspective');
  });
});
