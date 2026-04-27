/**
 * ColumnsTab — AG-Grid-based column editor with manual column support.
 * Configure column definitions with in-grid editing.
 *
 * Design system:
 *   Toolbar: px-4 py-3, labeled inputs using flex items-end gap-3
 *   Input labels: text-xs text-muted-foreground (above each input)
 *   Inputs: h-8 text-sm, fixed widths for predictable layout
 *   Select: shadcn Select component (not native <select>)
 *   Buttons: size="sm" (h-8) in toolbar for density
 *   Grid: headerHeight/rowHeight 32px, domLayout="normal"
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from '@marketsui/ui';
import { ModuleRegistry, type ColDef, type GridApi, type GridReadyEvent, type CellValueChangedEvent } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
import { useAgGridTheme } from '../../theme/index.js';
import { Plus, Trash2, Key, AlertTriangle } from 'lucide-react';
import type { FieldNode } from '@marketsui/shared-types';

/**
 * Minimal slice of provider config the Columns tab reads. Both STOMP
 * and REST configs expose `keyColumn`, so typing this loosely lets the
 * tab serve both transports without per-flavour duplication.
 */
type ConfigWithKeyColumn = { keyColumn?: string };
import type { ColumnDefinition } from '@marketsui/shared-types';

// Register AG-Grid Enterprise modules
ModuleRegistry.registerModules([AllEnterpriseModule]);

const getValueFormatterOptions = (cellDataType?: string): string[] => {
  switch (cellDataType) {
    case 'number':
      return [
        '', '0Decimal', '1Decimal', '2Decimal', '3Decimal', '4Decimal',
        '5Decimal', '6Decimal', '7Decimal', '8Decimal', '9Decimal',
        '0DecimalWithThousandSeparator', '1DecimalWithThousandSeparator',
        '2DecimalWithThousandSeparator', '3DecimalWithThousandSeparator',
        '4DecimalWithThousandSeparator', '5DecimalWithThousandSeparator',
        '6DecimalWithThousandSeparator', '7DecimalWithThousandSeparator',
        '8DecimalWithThousandSeparator', '9DecimalWithThousandSeparator',
      ];
    case 'date':
    case 'dateString':
      return [
        '', 'ISODate', 'ISODateTime', 'ISODateTimeMillis',
        'USDate', 'USDateTime', 'USDateTime12Hour',
        'EUDate', 'EUDateTime',
        'LongDate', 'ShortDate', 'LongDateTime', 'ShortDateTime',
        'Time24Hour', 'Time12Hour', 'TimeShort',
        'DateFromNow', 'UnixTimestamp', 'UnixTimestampMillis',
        'YYYY-MM-DD HH:mm:ss',
      ];
    default:
      return [''];
  }
};

const getCellRendererOptions = (cellDataType?: string): string[] => {
  switch (cellDataType) {
    case 'number':
      return ['', 'NumericCellRenderer'];
    default:
      return [''];
  }
};

interface ColumnsTabProps {
  selectedFields: Set<string>;
  inferredFields: FieldNode[];
  manualColumns: ColumnDefinition[];
  fieldColumnOverrides: Record<string, Partial<ColumnDefinition>>;
  onManualColumnsChange: (columns: ColumnDefinition[]) => void;
  onFieldColumnOverridesChange: (overrides: Record<string, Partial<ColumnDefinition>>) => void;
  onClearAll: () => void;
  /** Provider config — needed for the Row Identity callout. */
  config?: ConfigWithKeyColumn;
  /** Threaded through so the callout's "change" affordance can update keyColumn. */
  onConfigChange?: (field: string, value: unknown) => void;
}

export const ColumnsTab: React.FC<ColumnsTabProps> = ({
  selectedFields,
  inferredFields,
  manualColumns,
  fieldColumnOverrides,
  onManualColumnsChange,
  onFieldColumnOverridesChange,
  onClearAll,
  config,
  onConfigChange,
}) => {
  const [newColumn, setNewColumn] = useState({ field: '', header: '', type: 'text' as ColumnDefinition['cellDataType'] });
  const [, setGridApi] = useState<GridApi | null>(null);
  const { theme } = useAgGridTheme();

  const getFieldType = useCallback((path: string): string | undefined => {
    const findField = (fields: FieldNode[]): FieldNode | undefined => {
      for (const field of fields) {
        if (field.path === path) return field;
        if (field.children) {
          const found = findField(field.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return findField(inferredFields)?.type;
  }, [inferredFields]);

  const getAllColumns = useCallback(() => {
    const columns: any[] = [];

    Array.from(selectedFields).forEach(path => {
      const override = fieldColumnOverrides[path] || {};
      const fieldType = getFieldType(path);
      const cellDataType = override.cellDataType || (
        fieldType === 'number' ? 'number' :
        fieldType === 'boolean' ? 'boolean' :
        fieldType === 'date' ? 'date' : 'text'
      );

      const valueFormatter = override.valueFormatter !== undefined ? override.valueFormatter :
        (cellDataType === 'number' ? '2DecimalWithThousandSeparator' :
         cellDataType === 'date' || cellDataType === 'dateString' ? 'YYYY-MM-DD HH:mm:ss' : '');
      const cellRenderer = override.cellRenderer !== undefined ? override.cellRenderer :
        (cellDataType === 'number' ? 'NumericCellRenderer' : '');

      columns.push({
        field: path,
        headerName: override.headerName || path.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
        cellDataType,
        valueFormatter,
        cellRenderer,
        source: 'field',
      });
    });

    manualColumns.forEach(col => {
      const valueFormatter = col.valueFormatter !== undefined ? col.valueFormatter :
        (col.cellDataType === 'number' ? '2DecimalWithThousandSeparator' :
         col.cellDataType === 'date' || col.cellDataType === 'dateString' ? 'YYYY-MM-DD HH:mm:ss' : '');
      const cellRenderer = col.cellRenderer !== undefined ? col.cellRenderer :
        (col.cellDataType === 'number' ? 'NumericCellRenderer' : '');

      columns.push({
        ...col,
        valueFormatter,
        cellRenderer,
        source: 'manual',
      });
    });

    return columns;
  }, [selectedFields, manualColumns, fieldColumnOverrides, getFieldType]);

  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'actions',
      headerName: '',
      width: 40,
      pinned: 'left' as const,
      cellRenderer: (params: any) => (
        <button
          className="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            if (params.data.source === 'manual') {
              onManualColumnsChange(manualColumns.filter(col => col.field !== params.data.field));
            }
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      ),
    },
    {
      field: 'field',
      headerName: 'Field',
      width: 180,
      sortable: true,
      filter: true,
    },
    {
      field: 'cellDataType',
      headerName: 'Type',
      width: 100,
      sortable: true,
      filter: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['text', 'number', 'boolean', 'date', 'dateString', 'object'],
      },
      editable: true,
    },
    {
      field: 'headerName',
      headerName: 'Header',
      flex: 1,
      minWidth: 150,
      sortable: true,
      filter: true,
      editable: true,
    },
    {
      field: 'valueFormatter',
      headerName: 'Formatter',
      width: 200,
      sortable: true,
      filter: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: (params: any) => ({
        values: getValueFormatterOptions(params.data?.cellDataType),
      }),
      editable: true,
    },
    {
      field: 'cellRenderer',
      headerName: 'Renderer',
      width: 140,
      sortable: true,
      filter: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: (params: any) => ({
        values: getCellRendererOptions(params.data?.cellDataType),
      }),
      editable: true,
    },
  ], [manualColumns, onManualColumnsChange]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    setGridApi(event.api);
  }, []);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef, newValue } = event;

    if (data.source === 'manual') {
      const index = manualColumns.findIndex(col => col.field === data.field);
      if (index !== -1) {
        const updated = [...manualColumns];
        if (colDef?.field === 'cellDataType') {
          updated[index] = {
            ...updated[index],
            cellDataType: newValue,
            valueFormatter: newValue === 'number' ? '2DecimalWithThousandSeparator' :
              (newValue === 'date' || newValue === 'dateString' ? 'YYYY-MM-DD HH:mm:ss' : ''),
            cellRenderer: newValue === 'number' ? 'NumericCellRenderer' : undefined,
          };
        } else if (colDef?.field) {
          updated[index] = { ...updated[index], [colDef.field]: newValue };
        }
        onManualColumnsChange(updated);
      }
    } else if (data.source === 'field') {
      if (colDef?.field === 'cellDataType') {
        onFieldColumnOverridesChange({
          ...fieldColumnOverrides,
          [data.field]: {
            ...fieldColumnOverrides[data.field],
            cellDataType: newValue,
            valueFormatter: newValue === 'number' ? '2DecimalWithThousandSeparator' :
              (newValue === 'date' || newValue === 'dateString' ? 'YYYY-MM-DD HH:mm:ss' : ''),
            cellRenderer: newValue === 'number' ? 'NumericCellRenderer' : undefined,
          },
        });
      } else if (colDef?.field) {
        onFieldColumnOverridesChange({
          ...fieldColumnOverrides,
          [data.field]: {
            ...fieldColumnOverrides[data.field],
            [colDef.field]: newValue,
          },
        });
      }
    }
  }, [manualColumns, fieldColumnOverrides, onManualColumnsChange, onFieldColumnOverridesChange]);

  const handleAddColumn = () => {
    if (!newColumn.field || !newColumn.header) return;

    const column: ColumnDefinition = {
      field: newColumn.field,
      headerName: newColumn.header,
      cellDataType: newColumn.type,
      valueFormatter: newColumn.type === 'number' ? '2DecimalWithThousandSeparator' :
        (newColumn.type === 'date' || newColumn.type === 'dateString' ? 'YYYY-MM-DD HH:mm:ss' : ''),
      cellRenderer: newColumn.type === 'number' ? 'NumericCellRenderer' : undefined,
    };

    onManualColumnsChange([...manualColumns, column]);
    setNewColumn({ field: '', header: '', type: 'text' });
  };

  const columns = getAllColumns();

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Row identity callout — explicit picker for the column that
          uniquely identifies a row. AG-Grid's getRowId reads from this;
          delta updates can't match rows without a stable id. */}
      {(config && onConfigChange) && (
        <RowIdentityCallout
          keyColumn={config.keyColumn ?? ''}
          inferredFields={inferredFields}
          onChange={(next) => onConfigChange('keyColumn', next)}
        />
      )}

      {/* Add manual column toolbar — labeled inputs aligned at bottom */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-muted/30">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Field</Label>
            <Input
              value={newColumn.field}
              onChange={e => setNewColumn({ ...newColumn, field: e.target.value })}
              placeholder="e.g., price"
              className="h-8 text-sm w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Header</Label>
            <Input
              value={newColumn.header}
              onChange={e => setNewColumn({ ...newColumn, header: e.target.value })}
              placeholder="e.g., Price"
              className="h-8 text-sm w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={newColumn.type}
              onValueChange={v => setNewColumn({ ...newColumn, type: v as ColumnDefinition['cellDataType'] })}
            >
              <SelectTrigger className="h-8 w-[120px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="dateString">Date String</SelectItem>
                <SelectItem value="object">Object</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handleAddColumn}
            disabled={!newColumn.field || !newColumn.header}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearAll}
            disabled={columns.length === 0}
            className="text-muted-foreground"
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* AG-Grid */}
      <div className="flex-1 overflow-hidden bg-background">
        <AgGridReact
          theme={theme}
          rowData={columns}
          columnDefs={columnDefs}
          onGridReady={onGridReady}
          onCellValueChanged={onCellValueChanged}
          headerHeight={32}
          rowHeight={32}
          suppressMovableColumns={true}
          suppressCellFocus={true}
          suppressRowHoverHighlight={false}
          domLayout="normal"
        />
      </div>
    </div>
  );
};

// ─── Row identity callout ─────────────────────────────────────────────

interface RowIdentityCalloutProps {
  keyColumn: string;
  inferredFields: FieldNode[];
  onChange: (next: string) => void;
}

const RowIdentityCallout: React.FC<RowIdentityCalloutProps> = ({
  keyColumn, inferredFields, onChange,
}) => {
  // Suggest leaf field paths the user could pick — keeps the dropdown
  // useful even before they've selected fields for columns.
  const candidates = useMemo(() => {
    const out: string[] = [];
    const walk = (fields: FieldNode[]): void => {
      for (const f of fields) {
        if (f.type !== 'object' || !f.children?.length) {
          out.push(f.path);
        }
        if (f.children) walk(f.children);
      }
    };
    walk(inferredFields);
    return out;
  }, [inferredFields]);

  const isSet = Boolean(keyColumn);
  const isInferred = isSet && candidates.includes(keyColumn);
  // The id is set but doesn't appear in inferred fields — flag as a
  // potential typo or stale reference.
  const isOrphan = isSet && candidates.length > 0 && !isInferred;

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
      <Alert
        className={
          isSet
            ? (isOrphan ? 'bg-background border-amber-500/50' : 'bg-background')
            : 'bg-background border-destructive/40'
        }
      >
        {isOrphan ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        ) : (
          <Key className="h-4 w-4" />
        )}
        <AlertDescription className="text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              <strong className="text-foreground">Row identity:</strong>{' '}
              {isSet ? (
                <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{keyColumn}</code>
              ) : (
                <span className="text-destructive font-medium">not set</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Label htmlFor="row-identity-input" className="text-[11px] text-muted-foreground sr-only">
                Key column
              </Label>
              {candidates.length > 0 ? (
                <Select value={keyColumn} onValueChange={onChange}>
                  <SelectTrigger className="h-7 w-[200px] text-xs" id="row-identity-input">
                    <SelectValue placeholder="Pick a unique column" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((path) => (
                      <SelectItem key={path} value={path}>
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="row-identity-input"
                  value={keyColumn}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="e.g. orderId"
                  className="h-7 w-[200px] text-xs font-mono"
                />
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {isOrphan ? (
              <>
                <span className="text-amber-600 dark:text-amber-500 font-medium">⚠ </span>
                <code>{keyColumn}</code> isn't in the inferred field set — typo, or
                inference hasn't run for this column yet. AG-Grid's <code>getRowId</code> needs a
                column that's always present.
              </>
            ) : isSet ? (
              <>
                Drives AG-Grid's <code>getRowId</code> + the worker's RowCache upsert. Updates
                only land on existing rows when this column matches.
              </>
            ) : (
              <>
                Pick the column that uniquely identifies a row. Without it, delta updates
                can't match incoming rows to grid rows and the snapshot is the only data
                that ever renders.
              </>
            )}
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
