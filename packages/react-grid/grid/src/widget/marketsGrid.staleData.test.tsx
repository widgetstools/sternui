/**
 * MarketsGrid — stale-data banner and edit guard when the live stream
 * disconnects.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Hoisted: the `useGridHost` factory below is lifted above this file's
// statements, so plain `const` spies are not initialised when it runs.
const { setGridOption, stopEditing } = vi.hoisted(() => ({
  setGridOption: vi.fn(),
  stopEditing: vi.fn(),
}));

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

vi.mock('@starui/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@starui/engine')>();
  return {
    ...actual,
    MemoryAdapter: class {
      async loadGridLevelData() { return null; }
      async saveGridLevelData() {}
    },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
  };
});

vi.mock('@starui/grid/customizer', async () => {
  /**
   * The REAL provider, so the context `MarketsGridHost` reads by relative path
   * is the one `MarketsGrid` sets through this barrel. A passthrough shell here
   * renders children without ever establishing the context, which is why the
   * host threw `useGridPlatform() must be used inside <GridProvider>` the
   * moment these tests started running.
   */
  const provider = await import('../customizer/hooks/GridProvider.js');
  return {
    GridProvider: provider.GridProvider,
    // The real hooks too: a thin stub here hands components a platform that is
    // missing most of the class, and each missing member surfaces one at a time.
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
 * The previous stub was `{ api: { api: {...} } }` and nothing more, which was
 * enough only because these tests never actually rendered — they died at
 * collection. Once they ran, the component wanted `platform.api.onReady`,
 * `platform.store.getModuleState` and `platform.setDataTransactionApplier`,
 * and chasing those one at a time would have meant inventing the contract
 * instead of reading it.
 *
 * `GridPlatform` is an ordinary class and takes an empty module list, so the
 * honest double is the real thing: it cannot drift from the interface, and
 * `api.attach()` is the same call the host makes on `onGridReady`.
 */
vi.mock('./useGridHost', async () => {
  const { GridPlatform } = await import('@starui/engine');
  const platform = new GridPlatform({ gridId: 'stale-test', modules: [] });
  platform.api.attach({
    setGridOption,
    stopEditing,
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

  it('shows the historical banner when historicalViewMode is true', () => {
    const { getByTestId } = render(
      <MarketsGrid
        {...baseProps}
        historicalViewMode
        historicalViewMessage="Viewing historical data as of 2026-04-01. Editing is disabled."
      />,
    );
    expect(getByTestId('historical-view-banner')).toHaveTextContent('2026-04-01');
  });

  it('enables read-only edit guard when historicalViewMode toggles on', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} historicalViewMode={false} />,
    );

    rerender(<MarketsGrid {...baseProps} historicalViewMode />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', true);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', true);
    });
  });
});
