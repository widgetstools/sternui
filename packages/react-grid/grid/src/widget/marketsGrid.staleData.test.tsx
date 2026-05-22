/**
 * MarketsGrid — stale-data banner and edit guard when the live stream
 * disconnects.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const setGridOption = vi.fn();
const stopEditing = vi.fn();

vi.mock('ag-grid-react', () => ({
  AgGridReact: React.forwardRef<unknown, any>(() => (
    <div data-testid="ag-grid-stub" />
  )),
}));

vi.mock('ag-grid-enterprise', () => ({
  AllEnterpriseModule: {},
  ModuleRegistry: { registerModules: () => {} },
}));

vi.mock('@starui/engine', async () => {
  const actual: any = {};
  return {
    ...actual,
    MemoryAdapter: class {
      async loadGridLevelData() { return null; }
      async saveGridLevelData() {}
    },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
    traceProfile: vi.fn(),
    isProfileTraceEnabled: () => false,
  };
});

vi.mock('@starui/grid/customizer', () => ({
    GridProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useGridApi: () => null,
    useGridPlatform: () => ({}),
    useModuleState: () => [undefined, vi.fn()],
    GENERAL_SETTINGS_MODULE_ID: 'general-settings',
    useProfileManager: () => ({
      profiles: [],
      activeProfileId: null,
      isDirty: false,
      saveActiveProfile: vi.fn(),
      loadProfile: vi.fn(),
      reloadActiveProfile: vi.fn(),
      whenBooted: vi.fn(async () => {}),
      getActiveProfileId: vi.fn(() => '__default__'),
      createProfile: vi.fn(),
      deleteProfile: vi.fn(),
      cloneProfile: vi.fn(),
      renameProfile: vi.fn(),
      discardActiveProfile: vi.fn(),
    }),
    captureGridStateInto: vi.fn(),
    DirtyDot: () => null,
    Input: React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>((p, ref) => (
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
}));

vi.mock('./useGridHost', () => ({
  useGridHost: () => ({
    platform: {
      api: {
        api: {
          setGridOption,
          stopEditing,
          isDestroyed: () => false,
        },
      },
    },
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
  gridId: 'stale-test',
  rowData: [],
  columnDefs: [{ field: 'id' }],
} as const;

describe('MarketsGrid — stale data stream', () => {
  beforeEach(() => {
    setGridOption.mockClear();
    stopEditing.mockClear();
  });

  it('shows the stale banner when dataStale is true', () => {
    const { getByTestId, queryByTestId } = render(
      <MarketsGrid
        {...baseProps}
        dataStale
        dataStaleMessage="Grid data is stale — Provider disconnected."
      />,
    );

    expect(getByTestId('stale-data-banner')).toHaveTextContent('Provider disconnected');
    expect(queryByTestId('stale-data-banner')).toBeTruthy();
  });

  it('hides the stale banner when dataStale is false', () => {
    const { queryByTestId } = render(
      <MarketsGrid {...baseProps} dataStale={false} />,
    );
    expect(queryByTestId('stale-data-banner')).toBeNull();
  });

  it('enables read-only edit guard when dataStale toggles on', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} dataStale={false} />,
    );

    rerender(<MarketsGrid {...baseProps} dataStale />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', true);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', true);
      expect(stopEditing).toHaveBeenCalled();
    });
  });

  it('clears read-only edit guard when dataStale toggles off', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} dataStale />,
    );

    setGridOption.mockClear();
    rerender(<MarketsGrid {...baseProps} dataStale={false} />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', false);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', false);
    });
  });
});
