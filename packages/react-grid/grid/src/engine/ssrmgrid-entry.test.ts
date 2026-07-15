import { describe, expect, it } from 'vitest';

describe('ssrmgrid-entry', () => {
  it('exports SSRMGrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.SSRMGrid).toBeTypeOf('object'); // forwardRef component
  });

  it('re-exports share-of-total helpers from ssrmgrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.shareOfTotal).toBeTypeOf('function');
    expect(mod.resolveAggregate).toBeTypeOf('function');
    expect(mod.getSsrmShareOfTotal).toBeTypeOf('function');
  });
});
