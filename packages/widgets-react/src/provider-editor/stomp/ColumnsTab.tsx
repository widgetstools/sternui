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
} from '@marketsui/ui';
import { ModuleRegistry, type ColDef, type GridApi, type GridReadyEvent, type CellValueChangedEvent } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { AgGridReact } from 'ag-grid-react';
import { useAgGridTheme } from '../../theme/index.js';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldNode } from '@marketsui/shared-types';
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
}

export const ColumnsTab: React.FC<ColumnsTabProps> = ({
  selectedFields,
  inferredFields,
  manualColumns,
  fieldColumnOverrides,
  onManualColumnsChange,
  onFieldColumnOverridesChange,
  onClearAll,
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
