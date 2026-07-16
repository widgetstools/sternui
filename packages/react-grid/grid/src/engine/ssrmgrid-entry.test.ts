import { describe, expect, it } from 'vitest';

describe('ssrmgrid-entry', () => {
  it('exports CustomSSRMGrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.CustomSSRMGrid).toBeTypeOf('object'); // forwardRef component
  });

  it('re-exports share-of-total helpers from @starui/ssrm-grid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.shareOfTotal).toBeTypeOf('function');
    expect(mod.resolveAggregate).toBeTypeOf('function');
    expect(mod.getSsrmShareOfTotal).toBeTypeOf('function');
  });

  it('does not export Perspective SSRMGrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect('SSRMGrid' in mod).toBe(false);
  });
});
