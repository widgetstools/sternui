import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  type ForwardedRef,
  type ReactElement,
  type RefAttributes,
} from 'react';
import './grid-chrome.css';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import type { GridReadyEvent } from 'ag-grid-community';
import { useGridTheme } from './theme/useGridTheme.js';
import { installAgGridSetFilterValidateGuard } from './agGridSetFilterValidateGuard';
import { type AnyModule, type StorageAdapter } from '@starui/core';
import {
  GridProvider,
  calculatedColumnsModule,
  columnCustomizationModule,
  columnGroupsModule,
  columnTemplatesModule,
  conditionalStylingModule,
  generalSettingsModule,
  gridStateModule,
  savedFiltersModule,
  toolbarVisibilityModule,
} from '@starui/grid-react';
import type { MarketsGridHandle, MarketsGridProps } from './types';
import { isMarketsGridLocalStorageStorageFactory } from './createMarketsGridLocalStorageStorage';
import { useGridHost } from './useGridHost';
import { MarketsGridHost } from './MarketsGridHost';

let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  installAgGridSetFilterValidateGuard();
  _agRegistered = true;
}

// One-shot dev-only warning when the host forgets to pass `storage`
// (or the legacy `storageAdapter`). Module-scoped so the message fires
// at most once per page session even across many grid mounts. Reset
// only if the module is reloaded (HMR / a fresh page).
let _memoryAdapterWarned = false;

/**
 * Default module list — every shipped module, ordered the way the user's
 * profile round-trips expect. Hosts can pass `modules` to override.
 *
 * grid-state MUST run last (priority 200) so replay sees the finalized
 * column set from every structure module.
 */
export const DEFAULT_MODULES: AnyModule[] = [
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  calculatedColumnsModule,
  columnGroupsModule,
  conditionalStylingModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  gridStateModule,
];

function MarketsGridInner<TData = unknown>(
  props: MarketsGridProps<TData>,
  ref: ForwardedRef<MarketsGridHandle>,
) {
  const {
    rowData,
    columnDefs: baseColumnDefs,
    theme: themeProp,
    gridId,
    rowIdField = 'id',
    appData,
    modules = DEFAULT_MODULES,
    rowHeight = 36,
    headerHeight = 32,
    animateRows = true,
    sideBar,
    statusBar,
    defaultColDef,
    showToolbar = true,
    showFiltersToolbar = false,
    showFormattingToolbar = false,
    showSaveButton = true,
    showSettingsButton = true,
    showProfileSelector = true,
    storageAdapter,
    autoSaveDebounceMs,
    onGridReady: onGridReadyProp,
    className,
    style,
    // v2 additions
    instanceId,
    appId,
    userId,
    storage,
    onReady,
    adminActions,
    gridLevelData,
    onGridLevelDataLoad,
    headerExtras,
    componentName,
    caption,
    tabsHidden,
    onCaptionChange,
    onSavingChange,
  } = props;

  ensureAgGridRegistered();

  // Canonical stern theme (dark/light follows `[data-theme]` on <html>).
  // Apps can still pass `theme` for one-off overrides, but the default
  // keeps every grid in lockstep with the host's theme attribute.
  const internalTheme = useGridTheme();
  const theme = themeProp ?? internalTheme;

  const gridRef = useRef<AgGridReact<TData>>(null);

  const { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed } = useGridHost({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as never,
    appData,
  });

  const handleGridReady = useCallback(
    (event: GridReadyEvent) => {
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] AG-Grid onGridReady gridId=%s rowIdField=%s columns=%d`,
        gridId, rowIdField, Array.isArray(columnDefs) ? columnDefs.length : 0);
      onGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp, gridId, rowIdField, columnDefs],
  );

  const rootStyle = useMemo(
    () => ({ display: 'flex', flexDirection: 'column' as const, height: '100%', ...style }),
    [style],
  );

  // Resolve effective instance id — framework-hosted widgets pass
  // `instanceId` explicitly (from customData / launch env). Standalone
  // consumers omit it; we fall back to `gridId` so the key is still
  // stable per-grid.
  const effectiveInstanceId = instanceId ?? gridId;

  // Required-companion assertion: a storage factory combined with an
  // empty identity is almost always a bug (rows land in whatever
  // scope the factory defaults to — usually "dev-host" — and get
  // mixed across users). Surface it loudly so the developer catches
  // the misconfiguration on first mount rather than shipping to
  // users who then wonder why profiles vanish.
  if (
    storage &&
    (!appId || !userId) &&
    !isMarketsGridLocalStorageStorageFactory(storage)
  ) {
    throw new Error(
      '<MarketsGrid storage={...}> requires `appId` and `userId` props unless `storage` is ' +
        '`createMarketsGridLocalStorageStorage()`. ConfigService-backed factories scope rows by ' +
        '(appId, userId, instanceId); without both identities the factory cannot produce a correctly-scoped adapter. ' +
        `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
    );
  }

  // Storage precedence: factory > direct adapter > MemoryAdapter default.
  // Factory receives an opts object carrying the resolved identity
  // triple; factories can ignore `appId`/`userId` if they only key on
  // instanceId (local-storage, in-memory), or honor them (ConfigService).
  const resolvedAdapter = useMemo<StorageAdapter | undefined>(() => {
    if (storage) return storage({ instanceId: effectiveInstanceId, appId, userId, gridId });
    return storageAdapter as StorageAdapter | undefined;
  }, [storage, storageAdapter, effectiveInstanceId, appId, userId, gridId]);

  // Dev-only nudge — when neither a `storage` factory nor a direct
  // `storageAdapter` is wired, the inner Host falls through to a
  // `MemoryAdapter` and every profile / layout / grid-level-data
  // change vanishes on reload. This is the half-day gotcha every new
  // framework consumer hits exactly once. Fire a single warn per
  // page session, only outside production builds.
  if (
    !storage &&
    !storageAdapter &&
    !_memoryAdapterWarned &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production'
  ) {
    _memoryAdapterWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[MarketsGrid] No storage prop provided. Using in-memory storage — ' +
      'profiles, layouts and grid-level-data WILL be lost on reload. ' +
      'Wire @starui/config-service via createConfigServiceStorage(...) to persist.',
    );
  }

  return (
    <GridProvider platform={platform}>
      <MarketsGridHost
        rowData={rowData}
        columnDefs={columnDefs}
        gridOptions={gridOptions}
        handleGridReady={handleGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
        theme={theme}
        gridId={gridId}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        animateRows={animateRows}
        sideBar={sideBar}
        statusBar={statusBar}
        defaultColDef={defaultColDef}
        showToolbar={showToolbar}
        showFiltersToolbar={showFiltersToolbar}
        showFormattingToolbar={showFormattingToolbar}
        showSaveButton={showSaveButton}
        showSettingsButton={showSettingsButton}
        showProfileSelector={showProfileSelector}
        modules={modules}
        className={className}
        rootStyle={rootStyle}
        gridRef={gridRef}
        storageAdapter={resolvedAdapter}
        autoSaveDebounceMs={autoSaveDebounceMs}
        forwardedRef={ref}
        onReady={onReady}
        adminActions={adminActions}
        gridLevelData={gridLevelData}
        onGridLevelDataLoad={onGridLevelDataLoad}
        headerExtras={headerExtras}
        componentName={componentName}
        instanceId={instanceId}
        appId={appId}
        userId={userId}
        caption={caption}
        tabsHidden={tabsHidden}
        onCaptionChange={onCaptionChange}
        onSavingChange={onSavingChange}
      />
    </GridProvider>
  );
}

// Generic forwardRef cast — canonical TS workaround for typed generic handles.
// Consumers get correct inference on TData AND ref access to MarketsGridHandle.
export const MarketsGrid = forwardRef(MarketsGridInner) as <TData = unknown>(
  props: MarketsGridProps<TData> & RefAttributes<MarketsGridHandle>,
) => ReactElement;
