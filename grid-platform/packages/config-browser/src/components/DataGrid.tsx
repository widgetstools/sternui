/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { CellStyle, ColDef, GridOptions, RowClickedEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import {
  MultiFilterModule,
  SetFilterModule,
  StatusBarModule,
} from "ag-grid-enterprise";
import { agGridThemeFor } from "../agGridTheme";

ModuleRegistry.registerModules([AllCommunityModule, MultiFilterModule, SetFilterModule, StatusBarModule]);

interface DataGridProps {
  rows: any[];
  theme: "dark" | "light";
  quickFilter: string;
  primaryKey: string;
  onRowClick: (row: any) => void;
}

/**
 * Generic AG-Grid wrapper. Auto-derives columns from the first row's
 * keys; object/array values are rendered as truncated JSON so you
 * always see *something* in the cell. Click a row to open the JSON
 * editor drawer.
 */
export function DataGrid({
  rows,
  theme,
  quickFilter,
  primaryKey,
  onRowClick,
}: DataGridProps) {
  const columnDefs = useMemo<ColDef[]>((): ColDef[] => {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    // PK column first
    const ordered = [primaryKey, ...keys.filter((k) => k !== primaryKey)];
    return ordered.map((key) => ({
      field: key,
      headerName: key,
      pinned: key === primaryKey ? "left" : undefined,
      width: key === primaryKey ? 220 : undefined,
      valueFormatter: (params) => {
        const v = params.value;
        if (v === undefined || v === null) return "";
        if (typeof v === "object") {
          const json = JSON.stringify(v);
          return json.length > 80 ? json.slice(0, 80) + "…" : json;
        }
        if (typeof v === "boolean") return v ? "true" : "false";
        return String(v);
      },
      cellStyle: (params: any): CellStyle | null => {
        if (params.value === undefined || params.value === null) {
          return { color: "var(--de-text-ghost)", fontStyle: "italic" } as CellStyle;
        }
        if (typeof params.value === "object") {
          return { fontFamily: "var(--ds-font-mono)", color: "var(--de-text-secondary)" } as CellStyle;
        }
        if (key === primaryKey) {
          return { fontFamily: "var(--ds-font-mono)", fontWeight: "600" } as CellStyle;
        }
        return null;
      },
    }));
  }, [rows, primaryKey]);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: "agMultiColumnFilter",
    filterParams: {
      filters: [
        {
          filter: "agTextColumnFilter",
          filterParams: { buttons: ["reset"], debounceMs: 200 },
        },
        { filter: "agSetColumnFilter" },
      ],
    },
    floatingFilter: true,
    minWidth: 80,
    flex: 1,
  }), []);

  const statusBar = useMemo(() => ({
    statusPanels: [
      { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" as const },
      { statusPanel: "agSelectedRowCountComponent", align: "center" as const },
      { statusPanel: "agAggregationComponent", align: "right" as const },
    ],
  }), []);

  const gridOptions = useMemo<GridOptions>(
    () => ({
      rowHeight: 32,
      headerHeight: 34,
      suppressCellFocus: true,
      animateRows: true,
      theme: agGridThemeFor(theme),
    }),
    [theme],
  );

  const handleRowClick = (e: RowClickedEvent) => {
    if (e.data) onRowClick(e.data);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative" }}>
      <AgGridReact
        theme={agGridThemeFor(theme)}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        statusBar={statusBar}
        gridOptions={gridOptions}
        quickFilterText={quickFilter}
        onRowClicked={handleRowClick}
      />
    </div>
  );
}
