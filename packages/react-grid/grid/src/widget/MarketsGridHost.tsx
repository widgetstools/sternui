/**
 * MarketsGridHost — the inner shell rendered INSIDE the GridProvider.
 *
 * Split from the outer MarketsGrid because the controller hook
 * (`useMarketsGridController`) calls `useProfileManager`, `useGridApi`,
 * `useGridPlatform`, and `useModuleState` — all of which require the
 * GridProvider context. The outer wrapper sets the provider; this
 * component lives inside it.
 *
 * Pure layout document — every observable behaviour lives in the
 * controller hook or in named view-only sub-components
 * (`./PrimaryToolbar`, `./UnsavedSwitchDialog`, `./MarketsGridSurface`,
 * etc.). No state, no AG-Grid API access, no ProfileManager touching.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GetContextMenuItemsParams, GridReadyEvent } from 'ag-grid-community';
import { TooltipProvider } from '@starui/ui';
import { resolveGridDensity } from '@starui/design-system/adapters/ag-grid';
import type { AnyModule, StorageAdapter } from '@starui/engine';
import type { AdminAction, MarketsGridHandle, MarketsGridProps } from './types';
import { FormattingToolbar } from './FormattingToolbar';
import { EditingToolbar } from './editingToolbar/EditingToolbar';
import type { EditingToolbarHostProps } from './editingToolbar/resolveEditingToolbarAllow';
import { useEffectiveEditingToolbarAllow } from './editingToolbar/useEffectiveEditingToolbarAllow';
import { LazySettingsSheet, preloadSettingsSheet } from './LazySettingsSheet';
import { useMarketsGridController } from './useMarketsGridController';
import { useToolbarDateSettingsBridge } from '../customizer/modules/toolbar-date-settings/useToolbarDateSettingsBridge';
import { PrimaryToolbar } from './PrimaryToolbar';
import { ColumnSelectorDialog } from './column-selector';
import { UnsavedSwitchDialog } from './UnsavedSwitchDialog';
import { MarketsGridSurface } from './MarketsGridSurface';
import { SsrmMarketsGridSurfaceConnected as SsrmMarketsGridSurface } from '../engine/SsrmMarketsGridSurfaceConnected';
import { PerspectiveMarketsGridSurface } from '../engine/PerspectiveMarketsGridSurface.js';
import { SsrmSuggestBanner } from '../engine/SsrmSuggestBanner.js';
import { shouldSuggestSsrm } from '../engine/shouldSuggestSsrm.js';
import type { SSRMColDef, SSRMGridHandle } from '../engine/ssrmgrid-entry.js';
import { useGridPlatform } from '../customizer/hooks/GridProvider.js';
import {
  usePerspectiveCalcColumns,
  useSsrmCalcMaterialize,
  useSsrmColumnDefs,
} from '../engine/useSsrmColumnDefs.js';
import { materializeCalcFields } from '../engine/ssrmCalcColumns.js';
import { buildGridContextMenuItems } from './gridContextMenu';
import { StaleDataBanner } from './StaleDataBanner';
import { HistoricalViewBanner } from './HistoricalViewBanner';
import { GridChromeProvider } from './GridChromeContext';
import { useGeneralSettingsFromContext } from './GeneralSettingsContext';
import { useProfileSelectorActions } from './useProfileSelectorActions';

export interface MarketsGridHostProps<TData> {
  rowData: TData[];
  columnDefs: unknown[];
  gridOptions: Record<string, unknown>;
  hostOverrideKeys: ReadonlySet<string>;
  handleGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  theme: MarketsGridProps<TData>['theme'];
  gridId: string;
  rowHeight?: number;
  headerHeight?: number;
  animateRows?: boolean;
  sideBar: MarketsGridProps<TData>['sideBar'];
  statusBar: MarketsGridProps<TData>['statusBar'];
  defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  showToolbar: boolean;
  showFiltersToolbar: boolean;
  showFormattingToolbar: boolean;
  editingToolbarHostProps: EditingToolbarHostProps;
  showSaveButton: boolean;
  showSettingsButton: boolean;
  showColumnSelector: boolean;
  showVisualExcelExport: boolean;
  showProfileSelector: boolean;
  modules: AnyModule[];
  className: string | undefined;
  rootStyle: CSSProperties;
  gridRef: RefObject<AgGridReact<TData> | null>;
  storageAdapter: StorageAdapter | undefined;
  autoSaveDebounceMs: number | undefined;
  forwardedRef: ForwardedRef<MarketsGridHandle>;
  onReady: ((handle: MarketsGridHandle) => void) | undefined;
  adminActions: AdminAction[] | undefined;
  gridLevelData: unknown;
  onGridLevelDataLoad: ((data: unknown) => void) | undefined;
  headerExtras: ReactNode;
  componentName: string | undefined;
  instanceId: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
  caption: string | undefined;
  tabsHidden: boolean | undefined;
  onCaptionChange: ((next: string) => void) | undefined;
  onSavingChange: ((saving: boolean) => void) | undefined;
  dataStale: boolean;
  dataStaleMessage: string | undefined;
  historicalViewMode: boolean;
  historicalViewMessage: string | undefined;
  showToolbarDatePicker: boolean;
  toolbarDate: string;
  onToolbarDateChange: (next: string) => void;
  toolbarDateHistoryEnabled: boolean | undefined;
  toolbarActionsLayout: 'inline' | 'overflow';
  includeAllStreamSafeFilters: boolean;
  useSSRM?: boolean;
  /** Worker-held Table; when set, the Perspective surface is mounted. */
  perspectiveTable?: unknown;
  /**
   * `rowModel: 'perspective'` was asked for and the Table has not attached
   * yet. NOTHING may mount a grid in this window — see the render branch.
   */
  perspectivePending?: boolean;
  perspectiveKeyColumn?: string;
  perspectiveTreeFields?: readonly string[];
  perspectiveColumnWindow?: MarketsGridProps<TData>['perspectiveColumnWindow'];
  masterDetail?: MarketsGridProps<TData>['masterDetail'];
  suggestSsrmAbove?: number;
  onSuggestSsrm?: () => void;
  ssrmEngine?: 'custom' | 'perspective' | 'auto';
  ssrmExpectedRowCount?: number;
  rowIdField: string | readonly string[];
}

function MarketsGridHostInner<TData>({
  rowData,
  columnDefs,
  gridOptions,
  hostOverrideKeys,
  handleGridReady,
  onGridPreDestroyed,
  theme,
  gridId,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  showToolbar,
  showFiltersToolbar,
  showFormattingToolbar,
  editingToolbarHostProps,
  showSaveButton,
  showSettingsButton,
  showColumnSelector,
  showVisualExcelExport,
  showProfileSelector,
  modules,
  className,
  rootStyle,
  gridRef,
  storageAdapter,
  autoSaveDebounceMs,
  forwardedRef,
  onReady,
  adminActions,
  gridLevelData,
  onGridLevelDataLoad,
  headerExtras,
  componentName,
  instanceId,
  appId,
  userId,
  caption,
  tabsHidden,
  onCaptionChange,
  onSavingChange,
  dataStale,
  dataStaleMessage,
  historicalViewMode,
  historicalViewMessage,
  showToolbarDatePicker,
  toolbarDate,
  onToolbarDateChange,
  toolbarDateHistoryEnabled,
  toolbarActionsLayout,
  includeAllStreamSafeFilters,
  useSSRM,
  perspectiveTable,
  perspectivePending,
  perspectiveKeyColumn,
  perspectiveTreeFields,
  perspectiveColumnWindow,
  masterDetail,
  suggestSsrmAbove,
  onSuggestSsrm,
  ssrmEngine,
  ssrmExpectedRowCount,
  rowIdField,
}: MarketsGridHostProps<TData>) {
  const ssrmRef = useRef<SSRMGridHandle>(null);
  const [ssrmSuggestDismissed, setSsrmSuggestDismissed] = useState(false);
  const showSsrmSuggest = shouldSuggestSsrm({
    useSSRM: Boolean(useSSRM),
    rowCount: Array.isArray(rowData) ? rowData.length : 0,
    threshold: suggestSsrmAbove,
    dismissed: ssrmSuggestDismissed,
  });
  const platform = useGridPlatform();

  /**
   * `masterDetail` / `perspectiveTreeFields` are read by the Perspective
   * surface only. Say so out loud.
   *
   * A prop that silently does nothing on the surface it was set on is the
   * exact failure this path keeps producing — it is how the saved-filter
   * counts, the alerts rescan and the header badges all came to be missing
   * without a single warning anywhere. A dev-only console warning costs
   * nothing and makes the next one a five-second diagnosis.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (perspectiveTable || perspectivePending) return;
    const unsupported: string[] = [];
    if (masterDetail) unsupported.push('masterDetail');
    if (perspectiveTreeFields?.length) unsupported.push('perspectiveTreeFields');
    if (perspectiveColumnWindow?.enabled) unsupported.push('perspectiveColumnWindow');
    if (unsupported.length === 0) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[MarketsGrid] ${unsupported.join(' and ')} ${
        unsupported.length > 1 ? 'are' : 'is'
      } read by the Perspective surface only, and this grid is not on it. ` +
        "Set rowModel='perspective' with a perspectiveTable, or remove the prop.",
    );
  }, [
    masterDetail,
    perspectiveTreeFields,
    perspectiveColumnWindow,
    perspectiveTable,
    perspectivePending,
  ]);
  // Calculated columns become Perspective expression columns on the pull path;
  // without this they are absent entirely, since the planner only ran for SSRM.
  const perspectiveCalc = usePerspectiveCalcColumns(
    platform,
    columnDefs as never,
    Boolean(perspectiveTable),
  );

  const ssrmColumnDefs = useSsrmColumnDefs(
    platform,
    columnDefs as SSRMColDef[],
    Boolean(useSSRM),
  );
  const ssrmCalcMaterialize = useSsrmCalcMaterialize(
    platform,
    columnDefs as ColDef[],
    Boolean(useSSRM),
  );
  const ssrmRowData = useMemo(() => {
    if (!useSSRM || ssrmCalcMaterialize.materializePlans.length === 0) {
      return rowData as Record<string, unknown>[];
    }
    return materializeCalcFields(
      rowData as Record<string, unknown>[],
      ssrmCalcMaterialize.materializePlans,
      ssrmCalcMaterialize.evalRow,
    );
  }, [rowData, useSSRM, ssrmCalcMaterialize]);
  const generalSettings = useGeneralSettingsFromContext();
  const headerCaseAttr = generalSettings?.headerCaseUppercase ? 'upper' : undefined;
  const gridDensity = resolveGridDensity(generalSettings);

  const {
    profiles,
    api,
    sheetRef,
    toolbarRef,
    isDirty,
    saveFlash,
    settingsOpen,
    setSettingsOpen,
    settingsFocusRequest,
    styleToolbarOpen,
    pendingSwitch,
    setPendingSwitch,
    handleOpenSettings,
    openColumnSettings,
    columnSelectorOpen,
    setColumnSelectorOpen,
    handleOpenColumnSelector,
    handleToggleStyleToolbar,
    editingToolbarOpen,
    handleToggleEditingToolbar,
    handleExportVisualExcel,
    visualExcelExportEnabled,
    handleSaveAll,
    requestLoadProfile,
    confirmSwitchSave,
    confirmSwitchDiscard,
  } = useMarketsGridController({
    gridId,
    storageAdapter,
    autoSaveDebounceMs,
    forwardedRef,
    onReady,
    gridLevelData,
    onGridLevelDataLoad,
    onSavingChange,
    headerCaseAttr,
    useSSRM,
    ssrmRef,
    ssrmCalcMaterialize,
    rowIdField,
  });

  const [settingsMounted, setSettingsMounted] = useState(false);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const handleOpenSettingsTracked = useCallback(() => {
    setSettingsMounted(true);
    handleOpenSettings();
  }, [handleOpenSettings]);

  // Cell right-click menu — prepend "Settings" + "Remove from Grid" to
  // AG-Grid's defaults. "Settings" mounts + opens the customizer on the
  // clicked column; "Remove from Grid" hides it via the native visibility
  // API (re-showable from the side bar's Columns panel). Stable identity
  // (deps are both stable callbacks) so MarketsGridSurface's memo doesn't
  // make AgGridReact re-process the option each render.
  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams) =>
      buildGridContextMenuItems(params, {
        openColumnSettings: (colId) => {
          setSettingsMounted(true);
          openColumnSettings(colId);
        },
      }),
    [openColumnSettings],
  );

  // Warm the settings-sheet chunk while the grid is idle so the first
  // "Grid settings" click doesn't pay the lazy-chunk load. The sheet
  // itself stays unmounted until first open (settingsMounted above), so
  // this is the only place a pre-open preload can actually run.
  useEffect(() => {
    if (!showSettingsButton) return;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => preloadSettingsSheet());
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => preloadSettingsSheet(), 2000);
    return () => clearTimeout(t);
  }, [showSettingsButton]);

  const profileActions = useProfileSelectorActions(profiles, requestLoadProfile);

  const editingToolbarAllow = useEffectiveEditingToolbarAllow(editingToolbarHostProps);

  const toolbarDateBridge = useToolbarDateSettingsBridge({
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
  });

  const chromeState = useMemo(
    () => ({
      settingsOpen,
      setSettingsOpen,
      styleToolbarOpen,
      editingToolbarOpen,
      saveFlash,
      isDirty,
    }),
    [settingsOpen, setSettingsOpen, styleToolbarOpen, editingToolbarOpen, saveFlash, isDirty],
  );

  return (
    <GridChromeProvider value={chromeState}>
    <TooltipProvider delayDuration={200}>
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
      data-header-case={headerCaseAttr}
      data-stale={dataStale ? 'true' : undefined}
      data-historical-view={historicalViewMode ? 'true' : undefined}
    >
      {historicalViewMode ? (
        <HistoricalViewBanner
          message={
            historicalViewMessage ??
            'Viewing historical data — editing is disabled.'
          }
        />
      ) : null}
      {showSsrmSuggest && suggestSsrmAbove != null ? (
        <SsrmSuggestBanner
          rowCount={Array.isArray(rowData) ? rowData.length : 0}
          threshold={suggestSsrmAbove}
          onAccept={() => {
            onSuggestSsrm?.();
            setSsrmSuggestDismissed(true);
          }}
          onDismiss={() => setSsrmSuggestDismissed(true)}
        />
      ) : null}
      {dataStale ? (
        <StaleDataBanner
          message={
            dataStaleMessage ??
            'Grid data is stale — provider disconnected. Edits are disabled until the connection is restored.'
          }
        />
      ) : null}
      {headerExtras ? (
        <div
          className="ds-toolbar-primary ds-primary-row"
          data-grid-header-extras
        >
          {headerExtras}
        </div>
      ) : null}
      {showToolbar && (
        <PrimaryToolbar
          tabsHidden={tabsHidden}
          caption={caption}
          onCaptionChange={onCaptionChange}
          showFiltersToolbar={showFiltersToolbar}
          showFormattingToolbar={showFormattingToolbar}
          showAutoFormat={showFormattingToolbar}
          styleToolbarOpen={styleToolbarOpen}
          onToggleStyleToolbar={handleToggleStyleToolbar}
          showEditingToolbar={editingToolbarAllow.rowVisible}
          editingToolbarOpen={editingToolbarOpen}
          onToggleEditingToolbar={handleToggleEditingToolbar}
          showColumnSelector={showColumnSelector}
          onOpenColumnSelector={handleOpenColumnSelector}
          showProfileSelector={showProfileSelector}
          profileList={profiles.profiles}
          activeProfileId={profiles.activeProfileId ?? ''}
          profileActions={profileActions}
          isDirty={isDirty}
          showSaveButton={showSaveButton}
          saveFlash={saveFlash}
          onSaveAll={handleSaveAll}
          showSettingsButton={showSettingsButton}
          onOpenSettings={handleOpenSettingsTracked}
          showVisualExcelExport={showVisualExcelExport}
          visualExcelExportEnabled={visualExcelExportEnabled}
          onExportVisualExcel={handleExportVisualExcel}
          adminActions={adminActions}
          componentName={componentName}
          gridId={gridId}
          instanceId={instanceId}
          appId={appId}
          userId={userId}
          showToolbarDatePicker={showToolbarDatePicker}
          toolbarDate={toolbarDateBridge.toolbarDate}
          onToolbarDateChange={toolbarDateBridge.onToolbarDateChange}
          toolbarDateHistoryEnabled={toolbarDateBridge.toolbarDateHistoryEnabled}
          toolbarActionsLayout={toolbarActionsLayout}
          gridDensity={gridDensity}
        />
      )}

      {editingToolbarOpen && editingToolbarAllow.rowVisible && (
        <EditingToolbar allow={editingToolbarAllow} />
      )}

      {showFormattingToolbar && styleToolbarOpen && (
        <div
          className="ds-tb-pinned"
          data-testid="formatting-toolbar-pinned"
          style={{ flexShrink: 0 }}
        >
          <FormattingToolbar ref={toolbarRef} />
        </div>
      )}

      {!perspectiveTable && perspectivePending ? (
        /*
         * Perspective was asked for and the Table has not attached yet. Hold
         * the slot EMPTY rather than falling through to the CSRM surface.
         *
         * MEASURED, and the cause of three separate "the toolbar is dead"
         * bugs: attaching to the worker-held Table is async, so this branch
         * used to render `MarketsGridSurface` for the first few hundred ms.
         * That grid fired `onGridReady`, which attached the api to the
         * platform and activated every module. When the Table arrived the
         * branch flipped, THAT grid unmounted, and `onGridPreDestroyed` ran
         * `platform.destroy()` — which sets `destroyed` permanently and nulls
         * the platform ref. The Perspective grid then mounted and fired its
         * own `onGridReady` into the destroyed platform, where it is a no-op
         * (`GridPlatform.onGridReady` opens with `if (this.destroyed) return`).
         * A fresh platform was built for the next render and never saw a grid
         * at all: `api` null, `mountedGrid` false, no module ever activated.
         *
         * Everything that talks to AG Grid directly kept working — grouping,
         * sorting, the context menu, density — so the grid looked healthy.
         * Everything that goes through the platform was dead: the formatting
         * toolbar and auto-formatter (`useActiveColumns` reads
         * `platform.api`), the saved-filter "+" button, and profile
         * save/restore (the grid-state module never activated, so nothing was
         * captured and nothing restored).
         *
         * One grid mounts per platform, once. That is the invariant.
         */
        <div style={{ flex: 1, minHeight: 0, width: '100%' }} data-testid="perspective-attach-pending" />
      ) : perspectiveTable ? (
        // The book lives once in a worker; this window reads its viewport.
        // Everything above this line — toolbar, formatting, customizer,
        // profiles — is unchanged, which is the point: AG Grid stays the
        // surface and only the row supply moves.
        <PerspectiveMarketsGridSurface
          table={perspectiveTable as never}
          gridOptions={gridOptions}
          hostOverrideKeys={hostOverrideKeys}
          keyColumn={
            perspectiveKeyColumn ?? (typeof rowIdField === 'string' ? rowIdField : 'id')
          }
          columnDefs={perspectiveCalc.defs}
          calcExpressions={perspectiveCalc.expressions}
          treeFields={perspectiveTreeFields}
          columnWindow={perspectiveColumnWindow}
          masterDetail={masterDetail}
          theme={theme}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          sideBar={sideBar}
          statusBar={statusBar}
          defaultColDef={defaultColDef as never}
          includeAllStreamSafeFilters={includeAllStreamSafeFilters}
          gridRef={gridRef as never}
          getContextMenuItems={getContextMenuItems}
          onGridReady={handleGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
          grandTotalRow={
            gridOptions.grandTotalRow as
              | boolean
              | 'top'
              | 'bottom'
              | 'pinnedTop'
              | 'pinnedBottom'
              | undefined
          }
          groupTotalRow={gridOptions.groupTotalRow as 'top' | 'bottom' | undefined}
        />
      ) : useSSRM ? (
        <SsrmMarketsGridSurface
          ref={ssrmRef}
          rowData={ssrmRowData}
          columnDefs={ssrmColumnDefs}
          rowIdField={typeof rowIdField === 'string' ? rowIdField : 'id'}
          theme={theme}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          sideBar={sideBar}
          statusBar={useSSRM ? undefined : statusBar}
          defaultColDef={defaultColDef as never}
          includeAllStreamSafeFilters={includeAllStreamSafeFilters}
          onGridReady={handleGridReady}
          ssrmEngine={ssrmEngine}
          ssrmExpectedRowCount={ssrmExpectedRowCount}
          grandTotalRow={
            gridOptions.grandTotalRow as
              | boolean
              | 'top'
              | 'bottom'
              | 'pinnedTop'
              | 'pinnedBottom'
              | undefined
          }
          groupTotalRow={gridOptions.groupTotalRow as 'top' | 'bottom' | undefined}
        />
      ) : (
        <MarketsGridSurface
          gridRef={gridRef}
          gridOptions={gridOptions}
          hostOverrideKeys={hostOverrideKeys}
          theme={theme}
          rowData={rowData}
          columnDefs={columnDefs}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          animateRows={animateRows}
          sideBar={sideBar}
          statusBar={statusBar}
          defaultColDef={defaultColDef}
          getContextMenuItems={getContextMenuItems}
          onGridReady={handleGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
          includeAllStreamSafeFilters={includeAllStreamSafeFilters}
        />
      )}

      {(settingsMounted || settingsOpen) && (
        <LazySettingsSheet
          ref={sheetRef}
          modules={modules}
          open={settingsOpen}
          onClose={handleCloseSettings}
          initialModuleId="general-settings"
          focusRequest={settingsFocusRequest ?? undefined}
        />
      )}

      <UnsavedSwitchDialog
        open={pendingSwitch !== null}
        onCancel={() => setPendingSwitch(null)}
        onDiscard={confirmSwitchDiscard}
        onSave={confirmSwitchSave}
      />

      {showColumnSelector && (
        <ColumnSelectorDialog
          open={columnSelectorOpen}
          onOpenChange={setColumnSelectorOpen}
          api={api}
        />
      )}
    </div>
    </TooltipProvider>
    </GridChromeProvider>
  );
}

export const MarketsGridHost = memo(MarketsGridHostInner) as typeof MarketsGridHostInner;
