/**
 * ColumnsTab — review + lightly edit the column definitions chosen on
 * FieldsTab.
 *
 * Uses AG-Grid (Community) for display so the list scales to hundreds
 * of columns without DOM bloat. Features:
 *   - drag-to-reorder rows
 *   - inline edit for Header Name
 *   - dropdown select for Cell Data Type
 *   - delete row
 *   - Key Column picker (single or composite)
 */

import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  CellValueChangedEvent,
  GetRowIdParams,
  ICellRendererParams,
  RowDragEndEvent,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { Button, Label } from '@marketsui/ui';
import { Trash2 } from 'lucide-react';
import type { ColumnDefinition } from '@marketsui/shared-types';
import { normalizeKeyColumns } from '@marketsui/shared-types';
import { MultiSelect } from '../MultiSelect.js';
import { useAgGridTheme } from '../../../theme/useAgGridTheme.js';

const CELL_TYPES: ReadonlyArray<NonNullable<ColumnDefinition['cellDataType']>> = [
  'text', 'number', 'boolean', 'date', 'dateString', 'object',
];

type RowData = ColumnDefinition & { _rowId: string };

export interface ColumnsTabProps {
  columns: ColumnDefinition[];
  onChange(next: ColumnDefinition[]): void;
  /**
   * Current row-key configuration. Single string for a one-column
   * key, an array for a composite key (joined with `-` at runtime).
   */
  keyColumn: string | readonly string[] | undefined;
  /**
   * Receives the next selection. The editor wrapper decides how to
   * store it — empty → undefined, single → string, multi → array.
   */
  onKeyColumnChange(next: readonly string[]): void;
}

export function ColumnsTab({ columns, onChange, keyColumn, onKeyColumnChange }: ColumnsTabProps) {
  const { theme } = useAgGridTheme();

  // Enrich with a stable row id so AG-Grid tracks rows across
  // parent-driven re-renders. field+idx handles duplicate field names.
  const rowData = useMemo<RowData[]>(
    () => columns.map((col, idx) => ({ ...col, _rowId: `${col.field}-${idx}` })),
    [columns],
  );

  const getRowId = useCallback((p: GetRowIdParams<RowData>) => p.data._rowId, []);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<RowData>) => {
      const id = e.data._rowId;
      const next = columns.map((col, idx) =>
        `${col.field}-${idx}` === id
          ? { ...col, [e.colDef.field as string]: e.newValue }
          : col,
      );
      onChange(next);
    },
    [columns, onChange],
  );

  // After managed drag completes, read the new visual order from the grid.
  const onRowDragEnd = useCallback(
    (e: RowDragEndEvent<RowData>) => {
      const next: ColumnDefinition[] = [];
      e.api.forEachNode((node) => {
        if (!node.data) return;
        const { _rowId: _id, ...col } = node.data;
        next.push(col as ColumnDefinition);
      });
      onChange(next);
    },
    [onChange],
  );

  // Stable ref so colDefs (empty-dep memo) always call the latest
  // delete handler without needing to be recreated on each columns change.
  const onDelete = useCallback(
    (rowId: string) =>
      onChange(columns.filter((col, idx) => `${col.field}-${idx}` !== rowId)),
    [columns, onChange],
  );
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const colDefs = useMemo<ColDef<RowData>[]>(
    () => [
      {
        rowDrag: true,
        width: 36,
        maxWidth: 36,
        resizable: false,
        sortable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        headerName: '',
      },
      {
        field: 'field',
        headerName: 'Field',
        flex: 2,
        editable: false,
        cellClass: 'font-mono',
      },
      {
        field: 'headerName',
        headerName: 'Header',
        flex: 2,
        editable: true,
      },
      {
        field: 'cellDataType',
        headerName: 'Type',
        width: 140,
        editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: [...CELL_TYPES] },
        // Default absent cellDataType to 'text' (matches AG-Grid's own default).
        valueGetter: (p) => p.data?.cellDataType ?? 'text',
      },
      {
        headerName: '',
        width: 44,
        maxWidth: 44,
        resizable: false,
        sortable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        cellRenderer: DeleteCellRenderer,
        cellRendererParams: { onDeleteRef },
      },
    ],
    // Empty deps: delete is routed via onDeleteRef.current so this
    // never needs to be recreated — avoids AG-Grid re-applying colDefs
    // on every columns change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <h3 className="text-sm font-semibold mb-1">No columns selected</h3>
          <p className="text-xs text-muted-foreground">
            Pick fields on the <strong>Fields</strong> tab and they'll appear here as
            grid columns. You can rename headers and adjust the cell type after.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between flex-shrink-0">
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{columns.length}</strong>{' '}
          column{columns.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
        <KeyColumnPicker
          columns={columns}
          keyColumn={keyColumn}
          onChange={onKeyColumnChange}
        />

        <div className="flex-1 min-h-0">
          <AgGridReact<RowData>
            theme={theme}
            modules={[AllCommunityModule]}
            rowData={rowData}
            columnDefs={colDefs}
            getRowId={getRowId}
            rowDragManaged
            singleClickEdit
            onCellValueChanged={onCellValueChanged}
            onRowDragEnd={onRowDragEnd}
            headerHeight={28}
            rowHeight={32}
            defaultColDef={{
              resizable: true,
              sortable: false,
              suppressHeaderMenuButton: true,
            }}
            suppressContextMenu
          />
        </div>
      </div>
    </div>
  );
}

// ─── Delete cell renderer ──────────────────────────────────────────

type DeleteRendererParams = {
  onDeleteRef: React.MutableRefObject<(rowId: string) => void>;
};

function DeleteCellRenderer({ data, colDef }: ICellRendererParams<RowData>) {
  const { onDeleteRef } = (
    colDef as ColDef & { cellRendererParams: DeleteRendererParams }
  ).cellRendererParams;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
      title="Remove column"
      onClick={() => onDeleteRef.current(data!._rowId)}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}

// ─── Key column picker ─────────────────────────────────────────────
//
// One-column key OR composite key: picking N columns produces a row
// id that joins each column's value with `-` at runtime. Empty
// selection unsets the key (the editor will need to populate it
// before downstream consumers can stream rows correctly).

function KeyColumnPicker({
  columns,
  keyColumn,
  onChange,
}: {
  columns: ColumnDefinition[];
  keyColumn: string | readonly string[] | undefined;
  onChange(next: readonly string[]): void;
}) {
  const options = useMemo(
    () =>
      columns.map((c) => ({
        value: c.field,
        label: c.field,
        hint: c.cellDataType,
      })),
    [columns],
  );

  const value = useMemo(() => normalizeKeyColumns(keyColumn) ?? [], [keyColumn]);
  const composite = value.length > 1;

  return (
    <section
      className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5 flex-shrink-0"
      data-testid="columns-tab-keycolumn"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[11px] font-medium text-muted-foreground">
          Key Column{value.length > 1 ? 's' : ''} <span className="text-destructive">*</span>
        </Label>
        {composite && (
          <span className="text-[10px] font-mono text-muted-foreground">
            id = {value.map((v) => `[${v}]`).join(' + "-" + ')}
          </span>
        )}
      </div>
      <MultiSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={columns.length === 0 ? 'Pick fields first…' : 'Select column(s)…'}
        emptyMessage="No columns — add fields on the Fields tab"
        disabled={columns.length === 0}
      />
      <p className="text-[11px] text-muted-foreground">
        Drives AG-Grid <code className="text-foreground">getRowId</code> + the worker-side
        cache key. Pick a single column for a simple key, or two or more for a composite key
        (values joined with <code className="text-foreground">-</code>).
      </p>
    </section>
  );
}
