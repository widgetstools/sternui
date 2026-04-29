import React, { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GridApi, ColDef, GridReadyEvent } from 'ag-grid-community';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { useAgGridTheme } from '../theme/useAgGridTheme.js';

// Register AG Grid Enterprise modules
ModuleRegistry.registerModules([AllEnterpriseModule]);

export interface BlotterGridProps {
  columns: ColDef[];
  onGridReady: (api: GridApi) => void;
  getRowId?: (params: any) => string;
}

/**
 * BlotterGrid — AG Grid Enterprise wrapper with trading-optimized defaults.
 */
export const BlotterGrid: React.FC<BlotterGridProps> = ({
  columns,
  onGridReady,
  getRowId: getRowIdProp,
}) => {
  const gridApiRef = useRef<GridApi | null>(null);
  const { theme } = useAgGridTheme();

  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 100,
    filter: true,
    sortable: true,
    resizable: true,
    enableValue: true,
    enableRowGroup: true,
    enablePivot: true,
  }), []);

  const statusBar = useMemo(() => ({
    statusPanels: [
      { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' as const },
      { statusPanel: 'agSelectedRowCountComponent', align: 'center' as const },
      { statusPanel: 'agAggregationComponent', align: 'right' as const },
    ],
  }), []);

  // Stable references — fresh literals here would force AG-Grid to
  // re-evaluate selection/sidebar config on every render.
  const rowSelection = useMemo(
    () => ({ mode: 'multiRow' as const, checkboxes: false }),
    [],
  );

  const sideBar = useMemo(
    () => ({
      toolPanels: [
        { id: 'columns', labelDefault: 'Columns', labelKey: 'columns', iconKey: 'columns', toolPanel: 'agColumnsToolPanel' },
        { id: 'filters', labelDefault: 'Filters', labelKey: 'filters', iconKey: 'filter', toolPanel: 'agFiltersToolPanel' },
      ],
      defaultToolPanel: '',
    }),
    [],
  );

  const handleGridReady = useCallback((event: GridReadyEvent) => {
    gridApiRef.current = event.api;
    onGridReady(event.api);
  }, [onGridReady]);

  const getRowId = useMemo(() => {
    if (getRowIdProp) {
      return (params: any) => getRowIdProp(params.data);
    }
    return undefined;
  }, [getRowIdProp]);

  return (
    <div className="flex-1 w-full" style={{ minHeight: 0 }}>
      <AgGridReact
        theme={theme}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        statusBar={statusBar}
        onGridReady={handleGridReady}
        getRowId={getRowId}
        rowSelection={rowSelection}
        animateRows={false}
        rowBuffer={20}
        suppressColumnVirtualisation={false}
        suppressRowVirtualisation={false}
        sideBar={sideBar}
      />
    </div>
  );
};
