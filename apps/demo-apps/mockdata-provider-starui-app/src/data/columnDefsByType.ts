import type { ColDef } from 'ag-grid-community';
import { positionColumnDefs } from './positionColumns';
import { tradeColumnDefs } from './tradeColumns';
import { orderColumnDefs } from './orderColumns';

export interface DataTypeConfig {
  columnDefs: ColDef[];
  rowIdField: string;
  defaultColDef: ColDef;
}

const defaultColDef: ColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

export const columnDefsByType: Record<
  'positions' | 'trades' | 'orders',
  DataTypeConfig
> = {
  positions: { columnDefs: positionColumnDefs, rowIdField: 'cusip',   defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};
