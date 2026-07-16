import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Theme } from 'ag-grid-community';

const CustomSSRMGridMock = vi.fn(() => <div data-testid="custom-ssrm-grid" />);

vi.mock('./ssrmgrid-entry.js', () => ({
  CustomSSRMGrid: (props: unknown) => CustomSSRMGridMock(props),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface', () => {
  const theme = { id: 'starui' } as unknown as Theme;

  it('mounts CustomSSRMGrid', () => {
    CustomSSRMGridMock.mockClear();
    const { getByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
        theme={theme}
      />,
    );
    expect(getByTestId('custom-ssrm-grid')).toBeTruthy();
    expect(CustomSSRMGridMock).toHaveBeenCalledWith(
      expect.objectContaining({
        theme,
        loadThemeGoogleFonts: false,
      }),
    );
  });

  it('still mounts CustomSSRMGrid when deprecated ssrmEngine=perspective is passed', () => {
    CustomSSRMGridMock.mockClear();
    const { getByTestId, queryByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[]}
        ssrmEngine="perspective"
        ssrmExpectedRowCount={50_000}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
        theme={theme}
      />,
    );
    expect(getByTestId('custom-ssrm-grid')).toBeTruthy();
    expect(queryByTestId('perspective-ssrm-grid')).toBeNull();
  });
});
