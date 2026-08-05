/**
 * MarketsGrid — dev-mode warn-once when the consumer forgets to wire a
 * persistent storage adapter and the grid falls through to the in-memory
 * default (`MemoryAdapter`).
 *
 * The warning is module-scoped so it fires at most once per page
 * session even when many grids mount. We rely on Vitest's per-file
 * module isolation (default) — this file gets its own copy of
 * `_memoryAdapterWarned`, so the first render in test #1 trips it
 * exactly once and any subsequent render in the same test must NOT
 * re-warn. Test #2 supplies `storage` so the guard short-circuits
 * regardless of flag state.
 *
 * AG-Grid + the design-system module bundle are heavy under jsdom, so
 * we shim every framework dependency to the smallest possible surface.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

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
    MemoryAdapter: class { async loadGridLevelData() { return null; } async saveGridLevelData() {} },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
  };
});

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
  const platform = new GridPlatform({ gridId: 'devwarn-test', modules: [] });
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
  gridId: 'devwarn-test',
  rowData: [],
  columnDefs: [],
} as const;

describe('MarketsGrid — MemoryAdapter fallback dev warning', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    originalEnv = process.env.NODE_ENV;
    // Force a non-production env so the dev guard fires regardless of
    // how the test runner was invoked.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('warns exactly once across multiple renders without storage', () => {
    const first = render(<MarketsGrid {...baseProps} />);
    first.unmount();
    const second = render(<MarketsGrid {...baseProps} />);
    second.unmount();

    const warnCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[MarketsGrid]'),
    );
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0][0]).toMatch(/in-memory storage/);
    expect(warnCalls[0][0]).toMatch(/createConfigServiceStorage/);
  });

  it('stays silent when a storage factory is provided', () => {
    const memoryFactory = vi.fn(() => ({
      loadProfiles: async () => [],
      saveProfile: async () => {},
      deleteProfile: async () => {},
      loadActiveProfileId: async () => null,
      saveActiveProfileId: async () => {},
    }));

    const { unmount } = render(
      <MarketsGrid
        {...baseProps}
        storage={memoryFactory as never}
        appId="app-1"
        userId="user-1"
      />,
    );
    unmount();

    const warnCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[MarketsGrid]'),
    );
    expect(warnCalls).toHaveLength(0);
  });
});
