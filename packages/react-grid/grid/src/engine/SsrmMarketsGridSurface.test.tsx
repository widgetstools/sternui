import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('./ssrmgrid-entry.js', () => ({
  SSRMGrid: vi.fn(() => <div data-testid="ssrm-grid" />),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface', () => {
  it('renders SSRMGrid host', () => {
    const { getByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
      />,
    );
    expect(getByTestId('ssrm-grid')).toBeTruthy();
  });
});
