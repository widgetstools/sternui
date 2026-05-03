/**
 * MarketsGrid — left-edge caption rendering and in-place editing when
 * the host's OpenFin tab strip is hidden.
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
import { fireEvent, render } from '@testing-library/react';

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
    Input: React.forwardRef<HTMLInputElement, any>((p, ref) => (
      <input ref={ref} {...p} />
    )),
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

  it('falls back to "MarketsGrid" when caption is omitted or blank', () => {
    const omitted = render(<MarketsGrid {...baseProps} tabsHidden />);
    expect(omitted.container.querySelector('[data-grid-caption]')).not.toBeNull();
    expect(omitted.getByTestId('grid-caption-text').textContent).toBe('MarketsGrid');
    omitted.unmount();

    const blank = render(<MarketsGrid {...baseProps} tabsHidden caption="   " />);
    expect(blank.getByTestId('grid-caption-text').textContent).toBe('MarketsGrid');
  });

  it('renders the caption at the left edge of the primary toolbar row', () => {
    const { container, getByTestId } = render(
      <MarketsGrid {...baseProps} tabsHidden caption="Markets Blotter" />,
    );
    const node = container.querySelector('[data-grid-caption]');
    expect(node).not.toBeNull();
    expect(getByTestId('grid-caption-text').textContent).toBe('Markets Blotter');
    // The caption must be the FIRST child of the primary toolbar row
    // so it lands at the left edge, before the filters carousel.
    const toolbar = container.querySelector(
      '[data-grid-id="caption-test"] > .gc-toolbar-primary',
    );
    expect(toolbar?.firstElementChild).toBe(node);
  });

  it('reveals an inline input when the edit button is clicked, commits on Enter, and fires onCaptionChange', () => {
    const onCaptionChange = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <MarketsGrid
        {...baseProps}
        tabsHidden
        caption="Markets"
        onCaptionChange={onCaptionChange}
      />,
    );
    // Click the pencil icon to enter edit mode.
    fireEvent.click(getByTestId('grid-caption-edit-btn'));
    const input = getByTestId('grid-caption-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Markets');

    // Type a new value and press Enter to commit.
    fireEvent.change(input, { target: { value: 'FX Blotter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCaptionChange).toHaveBeenCalledTimes(1);
    expect(onCaptionChange).toHaveBeenCalledWith('FX Blotter');
    // Edit mode tears down; label reflects the new value.
    expect(queryByTestId('grid-caption-input')).toBeNull();
    expect(getByTestId('grid-caption-text').textContent).toBe('FX Blotter');
  });

  it('cancels the edit on Escape without firing onCaptionChange', () => {
    const onCaptionChange = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <MarketsGrid
        {...baseProps}
        tabsHidden
        caption="Markets"
        onCaptionChange={onCaptionChange}
      />,
    );
    fireEvent.click(getByTestId('grid-caption-edit-btn'));
    const input = getByTestId('grid-caption-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'FX Blotter' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCaptionChange).not.toHaveBeenCalled();
    expect(queryByTestId('grid-caption-input')).toBeNull();
    expect(getByTestId('grid-caption-text').textContent).toBe('Markets');
  });
});
