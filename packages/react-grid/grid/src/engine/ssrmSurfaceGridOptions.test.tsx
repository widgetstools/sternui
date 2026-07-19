/**
 * Worklog T5 — the SSRM surface forwards the module-pipeline gridOptions
 * (general-settings et al) instead of discarding them behind a prop
 * whitelist, and the status bar is no longer hard-nulled.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const captured: { props: Record<string, unknown> | null } = { props: null };

vi.mock('./ssrmgrid-entry.js', () => ({
  SsrmGrid: React.forwardRef<unknown, any>((props, _ref) => {
    captured.props = props;
    return <div data-testid="ssrm-grid-stub" />;
  }),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface gridOptions pass-through', () => {
  it('forwards pipeline options (rowSelection et al) and the statusBar prop', () => {
    render(
      <SsrmMarketsGridSurface
        rowData={[]}
        columnDefs={[]}
        rowIdField="id"
        statusBar={{ statusPanels: [] }}
        gridOptions={{
          rowSelection: { mode: 'singleRow' },
          pagination: true,
          singleClickEdit: true,
          // surface-managed key — must not reach the grid via the pipeline
          columnDefs: [{ field: 'nope' }],
        }}
        hostOverrideKeys={new Set()}
      />,
    );
    const grid = captured.props!;
    expect(grid.gridOptions).toEqual({
      rowSelection: { mode: 'singleRow' },
      pagination: true,
      singleClickEdit: true,
    });
    expect(grid.statusBar).toEqual({ statusPanels: [] });
    cleanup();
  });

  it('drops pipeline keys the host overrode explicitly', () => {
    render(
      <SsrmMarketsGridSurface
        rowData={[]}
        columnDefs={[]}
        rowIdField="id"
        sideBar={false}
        gridOptions={{ sideBar: { toolPanels: [] }, accentedSort: true }}
        hostOverrideKeys={new Set(['sideBar'])}
      />,
    );
    const grid = captured.props!;
    expect(grid.gridOptions).toEqual({ accentedSort: true });
    expect(grid.sideBar).toBe(false);
    cleanup();
  });
});
