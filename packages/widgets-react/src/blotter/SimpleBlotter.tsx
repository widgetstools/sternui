import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { GridApi, ColDef } from 'ag-grid-community';
import type { WidgetProps } from '@marketsui/widget-sdk';
import { useWidget, renderSlot } from '@marketsui/widget-sdk';
import { useBlotterDI } from '../BlotterProvider.js';
import { BlotterToolbar } from './BlotterToolbar.js';
import { BlotterGrid } from './BlotterGrid.js';
import { useBlotterDataConnection } from './hooks/useBlotterDataConnection.js';
import { useGridStateManager } from './hooks/useGridStateManager.js';
import type { BlotterSlots, BlotterSlotContext, GridColumnConfig, LayoutState, ToolbarButton } from './types.js';

export interface SimpleBlotterProps extends WidgetProps {
  slots?: BlotterSlots;
  onReady?: () => void;
  onError?: (error: Error) => void;
  getRowId?: (row: Record<string, unknown>) => string;
}

/**
 * SimpleBlotter — the main blotter widget, powered by useWidget() and AG Grid Enterprise.
 * Supports slot-based extensibility, DI for data providers, and hierarchical config.
 */
export const SimpleBlotter: React.FC<SimpleBlotterProps> = ({
  configId,
  slots,
  onReady,
  onError,
  getRowId,
}) => {
  const widget = useWidget(configId);
  const { dataProvider, actionRegistry } = useBlotterDI();

  // ─── Grid API ──────────────────────────────────────
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, unknown>[]>([]);
  const initialLayoutAppliedRef = useRef(false);

  const { captureGridState, applyGridState, resetGridState } = useGridStateManager(gridApi);

  // ─── Component-specific data (nested in config.config) ──
  const configData = widget.config?.config as Record<string, unknown> | undefined;

  // ─── Column definitions from config ────────────────
  const columns = useMemo((): ColDef[] => {
    const columnsConfig = configData?.columns as GridColumnConfig[] | undefined;
    if (!columnsConfig || !Array.isArray(columnsConfig)) return [];

    return columnsConfig.map((col) => {
      const colDef: ColDef = {
        field: col.field,
        headerName: col.headerName || col.field,
        width: col.width || 150,
        filter: true,
        sortable: true,
      };

      if (col.cellDataType) colDef.cellDataType = col.cellDataType;
      if (col.editable !== undefined) colDef.editable = col.editable;
      if (col.hide !== undefined) colDef.hide = col.hide;
      if (col.pinned) colDef.pinned = col.pinned;
      if (col.flex !== undefined) colDef.flex = col.flex;

      return colDef;
    });
  }, [configData?.columns]);

  // ─── Data connection ───────────────────────────────
  const providerId = (configData?.providerId as string) || null;

  useBlotterDataConnection({
    gridApi,
    providerId,
    dataProvider,
    getRowId,
  });

  // ─── Toolbar buttons from config ───────────────────
  const toolbarButtons = useMemo((): ToolbarButton[] => {
    const toolbar = configData?.toolbar as { customButtons?: ToolbarButton[] } | undefined;
    return toolbar?.customButtons || [];
  }, [configData?.toolbar]);

  // ─── Grid ready handler ────────────────────────────
  const handleGridReady = useCallback((api: GridApi) => {
    setGridApi(api);

    // Track row selection
    api.addEventListener('selectionChanged', () => {
      setSelectedRows(api.getSelectedRows());
    });

    onReady?.();
  }, [onReady]);

  // ─── Layout operations ─────────────────────────────
  const handleSelectLayout = useCallback(async (layoutId: string) => {
    const state = await widget.loadLayout(layoutId) as LayoutState | null;
    if (state && gridApi) {
      applyGridState(state);
    }
  }, [widget, gridApi, applyGridState]);

  const handleSaveLayout = useCallback(async () => {
    const state = captureGridState();
    const name = `Layout ${new Date().toLocaleString()}`;
    await widget.saveLayout(name, state);
  }, [widget, captureGridState]);

  // Apply default layout on first load
  useEffect(() => {
    if (!gridApi || initialLayoutAppliedRef.current || widget.isLoading) return;

    const defaultLayout = widget.layouts.find(l => l.isDefault);
    if (defaultLayout) {
      widget.loadLayout(defaultLayout.id).then((state) => {
        if (state) applyGridState(state as LayoutState);
      });
    }
    initialLayoutAppliedRef.current = true;
  }, [gridApi, widget.isLoading, widget.layouts, widget.loadLayout, applyGridState]);

  // ─── Lifecycle: save grid state on platform save ───
  useEffect(() => {
    widget.onSave(() => {
      if (gridApi && widget.activeLayout) {
        const state = captureGridState();
        widget.saveLayout(widget.activeLayout.name, state);
      }
    });
  }, [widget, gridApi, captureGridState]);

  // ─── Error forwarding ──────────────────────────────
  useEffect(() => {
    if (widget.error && onError) {
      onError(widget.error);
    }
  }, [widget.error, onError]);

  // ─── Custom action handler ─────────────────────────
  const handleCustomAction = useCallback((actionId: string) => {
    actionRegistry?.execute(actionId, {
      gridApi,
      selectedRows,
      configId,
      widget,
    });
  }, [actionRegistry, gridApi, selectedRows, configId, widget]);

  // ─── Settings ──────────────────────────────────────
  const handleOpenSettings = useCallback(() => {
    widget.openSettings('toolbar-customization', {
      configId,
    });
  }, [widget, configId]);

  // ─── Slot context ──────────────────────────────────
  const slotContext: BlotterSlotContext = useMemo(() => ({
    widget,
    gridApi,
    selectedRows,
  }), [widget, gridApi, selectedRows]);

  // ─── Loading state ─────────────────────────────────
  if (widget.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading configuration...
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────
  if (widget.error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Error: {widget.error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {renderSlot(slots?.header, slotContext)}
      {renderSlot(slots?.beforeToolbar, slotContext)}

      <BlotterToolbar
        widget={widget}
        layouts={widget.layouts}
        activeLayoutId={widget.activeLayout?.id || null}
        onSelectLayout={handleSelectLayout}
        onSaveLayout={handleSaveLayout}
        customButtons={toolbarButtons}
        onCustomAction={handleCustomAction}
        onOpenSettings={handleOpenSettings}
      />

      {renderSlot(slots?.afterToolbar, slotContext)}

      <BlotterGrid
        columns={columns}
        onGridReady={handleGridReady}
        getRowId={getRowId}
      />

      {renderSlot(slots?.statusBar, slotContext)}
      {renderSlot(slots?.footer, slotContext)}
    </div>
  );
};
