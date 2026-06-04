import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../src/styles/ag-grid.css'),
  'utf8',
);

describe('ag-grid.css', () => {
  it('forces mono on header label elements', () => {
    expect(css).toMatch(/\.ag-header-cell-text/);
    expect(css).toMatch(/font-family:\s*var\(--ds-font-mono/);
  });

  it('enables tabular numerics on headers', () => {
    expect(css).toMatch(/font-variant-numeric:\s*var\(--ds-font-variant-tabular/);
  });
});
