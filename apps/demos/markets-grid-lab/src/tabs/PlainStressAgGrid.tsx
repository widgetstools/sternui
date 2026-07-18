import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridReadyEvent,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import type { LabRow } from '../data/types';

ModuleRegistry.registerModules([AllEnterpriseModule]);

const plainTheme = themeQuartz.withParams(
  {
    accentColor: '#8AAAA7',
    backgroundColor: '#1f2836',
    browserColorScheme: 'dark',
    chromeBackgroundColor: {
      ref: 'foregroundColor',
      mix: 0.07,
      onto: 'backgroundColor',
    },
    columnBorder: true,
    fontSize: 12,
    foregroundColor: '#FFF',
    headerFontSize: 12,
    iconSize: 12,
    oddRowBackgroundColor: '#2A2E35',
    spacing: 4,
    wrapperBorderRadius: 2,
  },
  'dark',
);

export type PlainStressAgGridProps = {
  rowData: LabRow[];
  columnDefs: ColDef<LabRow>[];
  defaultColDef: ColDef;
  /** Reuses useLabRows onReady (ticks via applyTransactionAsync). */
  onReady: (handle: MarketsGridHandle) => void;
  rowHeight?: number;
};

/**
 * Bare AG Grid 36 CSRM — same row/col shape as Stress Test, no MarketsGrid
 * modules (profiles, CS, toolbars, SSRM). Used to A/B scroll jank.
 */
export function PlainStressAgGrid({
  rowData,
  columnDefs,
  defaultColDef,
  onReady,
  rowHeight = 28,
}: PlainStressAgGridProps) {
  const mergedDefault = useMemo<ColDef>(
    () => ({
      ...defaultColDef,
      enableCellChangeFlash: false,
      rowGroup: false,
    }),
    [defaultColDef],
  );

  const getRowId = useMemo(
    () => (p: { data?: LabRow }) => String(p.data?.id ?? ''),
    [],
  );

  const onGridReady = (e: GridReadyEvent<LabRow>) => {
    const api = e.api;
    onReady({
      gridApi: api,
      platform: null as never,
      profiles: null as never,
      saveAll: async () => undefined,
      exportVisualExcel: () => undefined,
      applyDataTransactionAsync: (tx) => {
        api.applyTransactionAsync({
          add: tx.add as LabRow[] | undefined,
          update: tx.update as LabRow[] | undefined,
          remove: tx.remove as LabRow[] | undefined,
        });
      },
    });
  };

  return (
    <div className="h-full min-h-0 w-full" data-testid="plain-stress-ag-grid">
      <AgGridReact<LabRow>
        theme={plainTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={mergedDefault}
        getRowId={getRowId}
        rowHeight={rowHeight}
        headerHeight={28}
        animateRows={false}
        rowBuffer={10}
        rowGroupPanelShow="never"
        pivotPanelShow="never"
        sideBar={false}
        suppressNoRowsOverlay
        onGridReady={onGridReady}
      />
    </div>
  );
}
