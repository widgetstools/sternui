/**
 * Base column defs for the axe blotter. The bid/ask/spread/size columns
 * route reads through the PendingEditBuffer (so staged edits paint
 * yellow before commit), and writes back through the EditCoordinator.
 *
 * Important: these are the BASE defs — header names, alignment,
 * formatters, and conditional cell colors are layered on at runtime
 * by `buildAxeProfile.ts`, which writes through the column-customization
 * + conditional-styling module states. That's what showcases "use the
 * API, not the UI tool".
 */
import type { ColDef } from 'ag-grid-community';
import type { AxeRow } from './data';
import type { EditCoordinator, PendingEditBuffer } from './editing';
import { round } from './data';

export interface ColumnContext {
  buffer: PendingEditBuffer;
  /** Lazy because the coordinator is built after onGridReady fires. */
  getCoordinator: () => EditCoordinator | null;
}

function pendingValueGetter(field: keyof AxeRow, ctx: ColumnContext) {
  return (params: { data?: AxeRow }) => {
    if (!params.data) return undefined;
    const e = ctx.buffer.get(params.data.id, field);
    if (e && (e.state === 'VALID' || e.state === 'COMMITTING' || e.state === 'COMMITTED_FLASH')) {
      return e.value;
    }
    return params.data[field];
  };
}

function pendingValueSetter(field: keyof AxeRow, ctx: ColumnContext) {
  return (params: { data: AxeRow; newValue: unknown }) => {
    const newVal = parseFloat(String(params.newValue));
    if (Number.isNaN(newVal)) return false;
    const coord = ctx.getCoordinator();
    if (!coord) return false;
    coord.stage({ rowId: params.data.id, colId: field, value: newVal, origin: 'cellEditor' });
    // Don't write directly — buffer drives display via the value getter.
    return false;
  };
}

function pendingCellClass(field: keyof AxeRow, ctx: ColumnContext) {
  return (params: { data?: AxeRow }) => {
    if (!params.data) return null;
    const e = ctx.buffer.get(params.data.id, field);
    if (!e) return null;
    // Only the ANIMATED / GRADIENT states stay on cellClass — pending /
    // warn / committed are handled by the conditional-styling module
    // through the row's __p_<col> shadow fields (buildAxeProfile.ts).
    if (e.state === 'COMMITTING') return 'cell-committing';
    if (e.state === 'REJECTED') return 'cell-rejected';
    if (e.conflict) return 'cell-conflict';
    return null;
  };
}

// Style the cell text directly via cellClass + valueFormatter — AG-Grid
// 35 doesn't render HTML strings returned from cellRenderer, so we keep
// the side column to plain text + class.
const sideCellClass = (p: { value?: AxeRow['side'] }) =>
  p.value === 'B' ? 'side-buy' : p.value === 'S' ? 'side-sell' : null;
const sideValueFormatter = (p: { value?: AxeRow['side'] }) =>
  p.value === 'B' ? 'BUY' : p.value === 'S' ? 'SELL' : '';

export function buildBaseColumns(ctx: ColumnContext): ColDef<AxeRow>[] {
  return [
    { field: 'cusip',  headerName: 'CUSIP',  width: 110, pinned: 'left',  editable: false, filter: 'agTextColumnFilter' },
    { field: 'issuer', headerName: 'Issuer', width: 200, pinned: 'left',  editable: false, filter: 'agTextColumnFilter' },
    {
      field: 'side',
      headerName: 'Side',
      width: 70,
      editable: false,
      cellClass: sideCellClass,
      valueFormatter: sideValueFormatter,
      filter: 'agSetColumnFilter',
    },
    {
      field: 'size',
      headerName: 'Size',
      width: 80,
      editable: true,
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueGetter: pendingValueGetter('size', ctx),
      valueSetter: pendingValueSetter('size', ctx),
      cellClass: pendingCellClass('size', ctx),
      valueFormatter: (p) => (p.value == null ? '' : `${p.value}MM`),
    },
    {
      field: 'bid',
      headerName: 'Bid',
      width: 95,
      editable: true,
      headerClass: 'linked-col-header',
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueGetter: pendingValueGetter('bid', ctx),
      valueSetter: pendingValueSetter('bid', ctx),
      cellClass: pendingCellClass('bid', ctx),
      valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(3)),
    },
    {
      field: 'ask',
      headerName: 'Ask',
      width: 95,
      editable: true,
      headerClass: 'linked-col-header',
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueGetter: pendingValueGetter('ask', ctx),
      valueSetter: pendingValueSetter('ask', ctx),
      cellClass: pendingCellClass('ask', ctx),
      valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(3)),
    },
    {
      field: 'spread',
      headerName: 'Spread',
      width: 120,
      editable: true,
      headerClass: 'linked-col-header',
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueGetter: pendingValueGetter('spread', ctx),
      valueSetter: pendingValueSetter('spread', ctx),
      cellClass: pendingCellClass('spread', ctx),
      valueFormatter: (p) => (p.value == null ? '' : `+${Number(p.value).toFixed(1)}`),
    },
    {
      field: 'yield',
      headerName: 'Yield',
      width: 90,
      editable: false,
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(3)),
    },
    {
      field: 'last',
      headerName: 'Last',
      width: 85,
      editable: false,
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(3)),
    },
    {
      field: 'model',
      headerName: 'Model FV',
      width: 90,
      editable: false,
      type: 'numericColumn',
      filter: 'agNumberColumnFilter',
      valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(3)),
    },
    {
      // Note column — explains pending-edit context per row. Mirrors the
      // architecture mock §02 exactly: terse text like `linked tick · -2bp`,
      // em-dash `—` for primary-only edits, blank when no pending. Cells
      // themselves carry the ◆ / ⚠ glyph; we don't repeat it here.
      //
      // Values come from buffer state (not row data) so the valueGetter
      // must be force-refreshed on every buffer change — App.tsx handles
      // via gridApi.refreshCells({ columns: ['note'] }).
      colId: 'note',
      headerName: 'Note',
      width: 180,
      editable: false,
      sortable: false,
      filter: false,
      cellClass: () => 'note-cell',
      valueGetter: (params: { data?: AxeRow }) => {
        if (!params.data) return '';
        const rowEntries = ctx.buffer.all().filter((e) => e.rowId === params.data!.id);
        if (rowEntries.length === 0) return '';

        const conflict = rowEntries.find((e) => e.conflict);
        if (conflict) return '⚠ underlying ticked';

        const warned = rowEntries.find((e) => e.warn);
        if (warned) return `⚠ ${warned.warn}`;

        const linkageEdits = rowEntries.filter((e) => e.origin === 'linkage');
        if (linkageEdits.length === 0) return '—';

        // A linkage exists. The primary edit's delta (signed) is the
        // headline — bp for spread, pt for bid/ask.
        const primary = rowEntries.find((e) => e.origin === 'primary') ?? rowEntries[0];
        const delta = primary.value - primary.before;
        if (delta === 0) return '—';
        const sign = delta > 0 ? '+' : '';
        if (primary.colId === 'spread') return `linked tick · ${sign}${delta.toFixed(1)}bp`;
        if (primary.colId === 'bid' || primary.colId === 'ask') return `linked tick · ${sign}${delta.toFixed(3)}pt`;
        return `linked tick · ${linkageEdits.length} cells`;
      },
    },
  ];
}

/** Round helper exported here too so callers don't need a second import. */
export { round };
