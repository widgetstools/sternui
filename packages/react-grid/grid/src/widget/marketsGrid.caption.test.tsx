/**
 * MarketsGrid — left-edge caption rendering and in-place editing. The
 * caption is always shown (no longer gated on the host's tab strip).
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

/**
 * The enterprise bundle is stubbed to CUT the module graph, not merely to
 * satisfy the names: importing it for real reaches `@perspective-dev/client`'s
 * wasm, which Vite refuses to serve. The stub is shared and answers ANY named
 * export, because four copies of a two-property literal is exactly what broke
 * all four of these files at collection time when `modules.ts` grew its 21st
 * import.
 *
 * The factory is async and imports the stub ITSELF — `vi.mock` factories are
 * hoisted above imports, so a module-scope binding is not initialised yet when
 * this runs.
 */
vi.mock('ag-grid-enterprise', async () =>
  (await import('../test/agGridEnterpriseMock.js')).agGridEnterpriseMock(),
);

vi.mock('../customizer/hooks/useModuleState.js', () => ({
  useModuleState: () => [undefined, vi.fn()],
}));

// Vanilla shells from @starui/engine — only the constants + the
// `MemoryAdapter` class that MarketsGrid uses for default storage.
vi.mock('@starui/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@starui/engine')>();
  return {
    ...actual,
    MemoryAdapter: class { async loadGridLevelData() { return null; } async saveGridLevelData() {} },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
  };
});

// React shells from @starui/grid/customizer — hooks, panel primitives,
// shadcn primitives, and module registry exports.
vi.mock('@starui/grid/customizer', async () => {
  /**
   * The REAL provider and hooks. `MarketsGridHost` reads the platform context
   * by RELATIVE path while `MarketsGrid` sets it through this barrel, so a
   * passthrough shell here renders children without ever establishing the
   * context — and a thin `useGridPlatform` stub hands components a platform
   * missing most of the class, one missing member surfacing at a time.
   */
  const provider = await import('../customizer/hooks/GridProvider.js');
  return {
    GridProvider: provider.GridProvider,
    useGridPlatform: provider.useGridPlatform,
    useOptionalGridPlatform: provider.useOptionalGridPlatform,
    ProviderGridHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    GridEventBindingsHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useGridApi: () => null,
    useModuleState: () => [undefined, vi.fn()],
    GENERAL_SETTINGS_MODULE_ID: 'general-settings',
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
    DirtyDot: () => null,
    ChromeButton: React.forwardRef<HTMLButtonElement, any>(({ children, ...rest }, ref) => (
      <button ref={ref} {...rest}>{children}</button>
    )),
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
    visualExcelModule: {},
    exportVisualExcel: vi.fn(),
    VISUAL_EXCEL_MODULE_ID: 'visual-excel',
    smartEditModule: {},
    bulkUpdateModule: {},
    plusMinusModule: {},
    shortcutsModule: {},
    dataChangeHistoryModule: {},
    alertsModule: {},
    AlertsBadge: () => null,
    useAlertsToastBridge: () => undefined,
    useAlertsOpenFinBridge: () => undefined,
    generalSettingsModule: {},
    gridStateModule: {},
    savedFiltersModule: {},
    toolbarVisibilityModule: {},
    toolbarDateSettingsModule: {},
  };
});

vi.mock('../customizer/modules/toolbar-date-settings/useToolbarDateSettingsBridge.js', () => ({
  useToolbarDateSettingsBridge: ({
    toolbarDate,
    onToolbarDateChange,
  }: {
    toolbarDate: string;
    onToolbarDateChange: (next: string) => void;
  }) => ({
    toolbarDate,
    onToolbarDateChange,
    historyEnabled: true,
  }),
}));

/**
 * A REAL `GridPlatform`, not a hand-rolled double.
 *
 * The old stub was `{ api: { api: null } }`, which sufficed only because these
 * tests never rendered — they died at collection. Once they ran, the component
 * wanted `platform.api.onReady`, `platform.store.getModuleState` and
 * `platform.setDataTransactionApplier`; chasing those one at a time means
 * inventing the contract instead of reading it. `GridPlatform` is an ordinary
 * class that takes an empty module list, so the honest double is the real thing.
 */
vi.mock('./useGridHost', async () => {
  const { GridPlatform } = await import('@starui/engine');
  const platform = new GridPlatform({ gridId: 'caption-test', modules: [] });
  platform.api.attach({
    setGridOption: () => {},
    stopEditing: () => {},
    sizeColumnsToFit: () => {},
    isDestroyed: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as never);
  return {
    useGridHost: () => ({
      platform,
      columnDefs: [],
      gridOptions: {},
      onGridReady: vi.fn(),
      onGridPreDestroyed: vi.fn(),
    }),
  };
});

vi.mock('./FiltersToolbar', () => ({ FiltersToolbar: () => null }));
vi.mock('./FormattingToolbar', () => ({
  FormattingToolbar: React.forwardRef(() => null),
}));
vi.mock('./editingToolbar/EditingToolbar', () => ({
  EditingToolbar: () => null,
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

describe('MarketsGrid — caption', () => {
  it('renders the caption even when tabs are visible (always shown)', () => {
    const { container, getByTestId } = render(
      <MarketsGrid {...baseProps} tabsHidden={false} caption="Markets" />,
    );
    expect(container.querySelector('[data-grid-caption]')).not.toBeNull();
    expect(getByTestId('grid-caption-text').textContent).toBe('Markets');
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
    // The caption sits at the left edge, before the filters carousel — but
    // AFTER the density pill, which `PrimaryToolbar` now renders ahead of it in
    // a row whose own class says so (`ds-primary-row--with-density`). That is
    // an intended layout change, not drift: this assertion used to require the
    // caption to be the toolbar's FIRST child and was never re-read, because
    // the file had been failing at collection.
    const toolbar = container.querySelector('.ds-toolbar-primary');
    expect(toolbar).not.toBeNull();
    const children = [...(toolbar?.children ?? [])];
    expect(children[0]?.className).toContain('density-pill');
    expect(children[1]).toBe(node);
    // Still ahead of the filters carousel, which is the point of the rule.
    expect(children.indexOf(node!)).toBeLessThan(
      children.findIndex((c) => c.className.includes('ds-primary-filters')),
    );
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
