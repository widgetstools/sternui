/**
 * MarketsGrid — top-left caption rendering when the host's tab strip
 * is hidden. Three cases:
 *   1. tabsHidden=false, caption='X' → no caption rendered
 *   2. tabsHidden=true,  caption=undefined → no caption rendered
 *   3. tabsHidden=true,  caption='X' → caption rendered, top-of-grid
 *
 * AG-Grid + the design-system module bundle are heavy to mount in
 * jsdom, so we stub the AG-Grid React wrapper to a minimal element and
 * the GridProvider/useProfileManager pair to no-op shells. The caption
 * lives in MarketsGrid's outer Host shell, not inside AG-Grid, so the
 * stubs don't hide what's under test.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('ag-grid-react', () => ({
  AgGridReact: React.forwardRef<unknown, any>(() => (
    <div data-testid="ag-grid-stub" />
  )),
}));

vi.mock('ag-grid-enterprise', () => ({
  AllEnterpriseModule: {},
  ModuleRegistry: { registerModules: () => {} },
}));

// Light shells for the @marketsui/core surfaces MarketsGrid uses. We
// only need: GridProvider passthrough, the hooks that return inert
// values, the constants, and the module registry exports.
vi.mock('@marketsui/core', async () => {
  const actual: any = {};
  return {
    ...actual,
    GridProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MemoryAdapter: class { async loadGridLevelData() { return null; } async saveGridLevelData() {} },
    useGridApi: () => null,
    useGridPlatform: () => ({}),
    useProfileManager: () => ({
      profiles: [],
      activeProfileId: null,
      isDirty: false,
      saveActiveProfile: vi.fn(),
      loadProfile: vi.fn(),
      createProfile: vi.fn(),
      deleteProfile: vi.fn(),
      cloneProfile: vi.fn(),
      renameProfile: vi.fn(),
      discardActiveProfile: vi.fn(),
    }),
    captureGridStateInto: vi.fn(),
    cockpitCSS: '',
    COCKPIT_STYLE_ID: 'gc-cockpit-styles',
    DirtyDot: () => null,
    Popover: ({ children }: any) => <>{children}</>,
    PopoverTrigger: ({ children }: any) => <>{children}</>,
    PopoverContent: ({ children }: any) => <>{children}</>,
    AlertDialog: ({ children }: any) => <>{children}</>,
    AlertDialogAction: ({ children }: any) => <>{children}</>,
    AlertDialogCancel: ({ children }: any) => <>{children}</>,
    AlertDialogContent: ({ children }: any) => <>{children}</>,
    AlertDialogDescription: ({ children }: any) => <>{children}</>,
    AlertDialogFooter: ({ children }: any) => <>{children}</>,
    AlertDialogHeader: ({ children }: any) => <>{children}</>,
    AlertDialogTitle: ({ children }: any) => <>{children}</>,
    calculatedColumnsModule: {},
    columnCustomizationModule: {},
    columnGroupsModule: {},
    columnTemplatesModule: {},
    conditionalStylingModule: {},
    generalSettingsModule: {},
    gridStateModule: {},
    savedFiltersModule: {},
    toolbarVisibilityModule: {},
  };
});

vi.mock('./useGridHost', () => ({
  useGridHost: () => ({
    platform: {},
    columnDefs: [],
    gridOptions: {},
    onGridReady: vi.fn(),
    onGridPreDestroyed: vi.fn(),
  }),
}));

vi.mock('./FiltersToolbar', () => ({ FiltersToolbar: () => null }));
vi.mock('./FormattingToolbar', () => ({
  FormattingToolbar: React.forwardRef(() => null),
}));
vi.mock('./SettingsSheet', () => ({
  SettingsSheet: React.forwardRef(() => null),
}));
vi.mock('./ProfileSelector', () => ({ ProfileSelector: () => null }));

import { MarketsGrid } from './MarketsGrid';

const baseProps = {
  gridId: 'caption-test',
  rowData: [],
  columnDefs: [],
} as const;

describe('MarketsGrid — tabs-hidden caption', () => {
  it('does not render the caption when tabs are visible', () => {
    const { container } = render(
      <MarketsGrid {...baseProps} tabsHidden={false} caption="Markets" />,
    );
    expect(container.querySelector('[data-grid-caption]')).toBeNull();
  });

  it('does not render the caption when caption is omitted', () => {
    const { container } = render(<MarketsGrid {...baseProps} tabsHidden />);
    expect(container.querySelector('[data-grid-caption]')).toBeNull();
  });

  it('renders the caption top-left when tabsHidden and caption are both set', () => {
    const { container } = render(
      <MarketsGrid {...baseProps} tabsHidden caption="Markets Blotter" />,
    );
    const node = container.querySelector('[data-grid-caption]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toBe('Markets Blotter');
    // The caption must be the FIRST child of the grid root so it lands
    // top-left, above the headerExtras / primary toolbar rows.
    const root = container.querySelector('[data-grid-id="caption-test"]');
    expect(root?.firstElementChild).toBe(node);
  });
});
