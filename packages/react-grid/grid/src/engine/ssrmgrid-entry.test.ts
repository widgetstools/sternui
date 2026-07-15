import { describe, expect, it } from 'vitest';

describe('ssrmgrid-entry', () => {
  it('exports SSRMGrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.SSRMGrid).toBeTypeOf('object'); // forwardRef component
  });
});
