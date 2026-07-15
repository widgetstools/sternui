import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Theme } from 'ag-grid-community';

const SSRMGridMock = vi.fn(() => <div data-testid="ssrm-grid" />);

vi.mock('./ssrmgrid-entry.js', () => ({
  SSRMGrid: (props: unknown) => SSRMGridMock(props),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface', () => {
  it('renders SSRMGrid host with design-system theme', () => {
    const theme = { id: 'starui' } as unknown as Theme;
    SSRMGridMock.mockClear();
    const { getByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
        theme={theme}
      />,
    );
    expect(getByTestId('ssrm-grid')).toBeTruthy();
    expect(SSRMGridMock).toHaveBeenCalledWith(
      expect.objectContaining({
        theme,
        loadThemeGoogleFonts: false,
      }),
    );
  });
});
