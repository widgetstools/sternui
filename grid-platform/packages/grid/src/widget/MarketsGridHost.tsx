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

import type {
  CSSProperties,
  ForwardedRef,
  ReactNode,
  RefObject,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GridReadyEvent } from 'ag-grid-community';
import type { AnyModule, StorageAdapter } from '@stargrid/engine';
import type { AdminAction, MarketsGridHandle, MarketsGridProps } from './types';
import { FormattingToolbar } from './FormattingToolbar';
import { SettingsSheet } from './SettingsSheet';
import { useMarketsGridController } from './useMarketsGridController';
import { PrimaryToolbar } from './PrimaryToolbar';
import { UnsavedSwitchDialog } from './UnsavedSwitchDialog';
import { MarketsGridSurface } from './MarketsGridSurface';

export interface MarketsGridHostProps<TData> {
  rowData: TData[];
  columnDefs: unknown[];
  gridOptions: Record<string, unknown>;
  handleGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  theme: MarketsGridProps<TData>['theme'];
  gridId: string;
  rowHeight?: number;
  headerHeight?: number;
  animateRows: boolean;
  sideBar: MarketsGridProps<TData>['sideBar'];
  statusBar: MarketsGridProps<TData>['statusBar'];
  defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  showToolbar: boolean;
  showFiltersToolbar: boolean;
  showFormattingToolbar: boolean;
  showSaveButton: boolean;
  showSettingsButton: boolean;
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
}

export function MarketsGridHost<TData>({
  rowData,
  columnDefs,
  gridOptions,
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
  showSaveButton,
  showSettingsButton,
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
}: MarketsGridHostProps<TData>) {
  // All state, effects, refs, and side-effect callbacks live in the
  // controller hook (`./useMarketsGridController`). This component is
  // intentionally JSX-only: prop forwarding + the hook call. See the
  // hook for the full lifecycle (gridLevelData persistence,
  // ProfileManager wiring, imperative handle, save-flash, pending-
  // switch dialog state, etc.).
  const {
    profiles,
    api: _api,
    headerCaseAttr,
    sheetRef,
    toolbarRef,
    isDirty,
    saveFlash,
    settingsOpen,
    setSettingsOpen,
    styleToolbarOpen,
    pendingSwitch,
    setPendingSwitch,
    handleOpenSettings,
    handleToggleStyleToolbar,
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
  });
  // `api` is forwarded through the imperative handle from the hook —
  // the view doesn't consume it directly, but the destructure makes
  // it explicit that the hook owns this signal.
  void _api;

  return (
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
      data-header-case={headerCaseAttr}
    >
      {/* Header extras — slot for consumer-supplied chrome that needs
           to live INSIDE the grid's frame but ABOVE the filters/format
           toolbars. The data-services container uses this for the
           data-provider picker (live + historical, mode toggle, refresh,
           edit). Hidden by default in v2; revealed only via Alt+Shift+P
           — a developer/support affordance, not surfaced to end users. */}
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
          styleToolbarOpen={styleToolbarOpen}
          onToggleStyleToolbar={handleToggleStyleToolbar}
          showProfileSelector={showProfileSelector}
          profiles={profiles}
          isDirty={isDirty}
          onRequestLoadProfile={requestLoadProfile}
          showSaveButton={showSaveButton}
          saveFlash={saveFlash}
          onSaveAll={handleSaveAll}
          showSettingsButton={showSettingsButton}
          onOpenSettings={handleOpenSettings}
          adminActions={adminActions}
          componentName={componentName}
          gridId={gridId}
          instanceId={instanceId}
          appId={appId}
          userId={userId}
        />
      )}

      {/* FormattingToolbar — pinned as a second toolbar row directly
           beneath the FiltersToolbar. Visibility is bound to the
           existing formatter toggle in the FiltersToolbar
           (`styleToolbarOpen`). When the viewport is narrow the
           toolbar's flex-wrap kicks in and the row grows vertically
           (1 row → 2 rows) so no content is clipped.

           DraggableFloat was replaced in favour of this pinned row —
           the float-style drag-to-reposition UX made the toolbar
           overlap narrow grid columns in multi-grid dashboards. */}
      {showFormattingToolbar && styleToolbarOpen && (
        <div
          className="ds-tb-pinned"
          data-testid="formatting-toolbar-pinned"
          style={{ flexShrink: 0 }}
        >
          <FormattingToolbar ref={toolbarRef} />
        </div>
      )}

      <MarketsGridSurface
        gridRef={gridRef}
        gridOptions={gridOptions}
        theme={theme}
        rowData={rowData}
        columnDefs={columnDefs}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        animateRows={animateRows}
        sideBar={sideBar}
        statusBar={statusBar}
        defaultColDef={defaultColDef}
        onGridReady={handleGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />

      <SettingsSheet
        ref={sheetRef}
        modules={modules}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialModuleId="conditional-styling"
      />

      <UnsavedSwitchDialog
        open={pendingSwitch !== null}
        onCancel={() => setPendingSwitch(null)}
        onDiscard={confirmSwitchDiscard}
        onSave={confirmSwitchSave}
      />
    </div>
  );
}
