import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Theme } from 'ag-grid-community';

const SsrmGridMock = vi.fn(() => <div data-testid="ssrm-grid" />);

vi.mock('./ssrmgrid-entry.js', () => ({
  SsrmGrid: (props: unknown) => SsrmGridMock(props),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface', () => {
  const theme = { id: 'starui' } as unknown as Theme;

  it('mounts SsrmGrid', () => {
    SsrmGridMock.mockClear();
    const { getByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
        theme={theme}
      />,
    );
    expect(getByTestId('ssrm-grid')).toBeTruthy();
    expect(SsrmGridMock).toHaveBeenCalledWith(
      expect.objectContaining({
        theme,
        loadThemeGoogleFonts: false,
      }),
    );
  });

  it('still mounts SsrmGrid when deprecated ssrmEngine=perspective is passed', () => {
    SsrmGridMock.mockClear();
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
    expect(getByTestId('ssrm-grid')).toBeTruthy();
    expect(queryByTestId('perspective-ssrm-grid')).toBeNull();
  });
});
