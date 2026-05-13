import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('marketsGrid.css', () => {
  const css = readFileSync(resolve(__dirname, 'styles/marketsGrid.css'), 'utf8');

  it('keeps AG Grid header and floating-filter controls hidden until interaction', () => {
    expect(css).toContain('[data-grid-id] .ag-header-cell-menu-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell-filter-button');
    expect(css).toContain('[data-grid-id] .ag-floating-filter-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell:hover .ag-header-cell-menu-button');
    expect(css).toContain('[data-grid-id] .ag-header-cell:focus-within .ag-header-cell-filter-button');
    expect(css).toContain("[data-grid-id] .ag-floating-filter-button[aria-expanded='true']");
  });
});
