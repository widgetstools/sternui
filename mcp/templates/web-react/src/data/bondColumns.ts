import type { ColDef } from "ag-grid-community";

export const bondColumnDefs: ColDef[] = [
  { field: "id", headerName: "ID", width: 110, pinned: "left" },
  { field: "cusip", headerName: "CUSIP", width: 120 },
  { field: "issuer", headerName: "Issuer", flex: 1, minWidth: 180 },
  { field: "coupon", headerName: "Coupon", width: 100, type: "numericColumn" },
  { field: "maturity", headerName: "Maturity", width: 130 },
  { field: "price", headerName: "Price", width: 100, type: "numericColumn" },
  { field: "yield", headerName: "Yield", width: 100, type: "numericColumn" },
  { field: "currency", headerName: "Ccy", width: 80 },
  { field: "rating", headerName: "Rating", width: 90 },
];

export const bondDefaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
};
