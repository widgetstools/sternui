/**
 * AppDataFields — AG-Grid table editor for AppData key/value pairs.
 *
 * AppData is a small key-value store, NOT a streaming source.
 * Other providers reference its keys via `{{name.key}}` templates.
 * Common entries:
 *   - `positions.asOfDate` — bound to the historical date picker
 *   - `positions.clientId` — the user's account scope token
 *   - `auth.token`        — bearer token shared across REST cfgs
 *
 * UI: simple form on top to add new pairs, AG-Grid table shows all
 * existing pairs with inline editing and delete action.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellValueChangedEvent, GetRowIdParams, ICellRendererParams } from 'ag-grid-community';
import { AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { Button, Input, Label, useTheme } from '@marketsui/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { AppDataVariable, AppDataProviderConfig } from '@marketsui/shared-types';
import { agGridLightParams, agGridDarkParams } from '@marketsui/design-system/adapters/ag-grid';

export interface AppDataFieldsProps {
  cfg: AppDataProviderConfig;
  onChange(next: Partial<AppDataProviderConfig>): void;
}

type RowData = AppDataVariable & { _rowId: string };

export function AppDataFields({ cfg, onChange }: AppDataFieldsProps) {
  const { resolvedTheme } = useTheme();
  const gridTheme = themeQuartz.withParams(
    resolvedTheme === 'light' ? agGridLightParams : agGridDarkParams,
  );

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const variables = cfg.variables ?? {};
  const existingKeys = useMemo(() => new Set(Object.keys(variables)), [variables]);

  const handleAddPair = useCallback(() => {
    if (!newKey.trim() || existingKeys.has(newKey)) return;

    const newVariable: AppDataVariable = {
      key: newKey,
      value: newValue,
      type: 'string',
      durability: 'volatile',
    };

    onChange({
      variables: {
        ...variables,
        [newKey]: newVariable,
      },
    });

    setNewKey('');
    setNewValue('');
  }, [newKey, newValue, variables, existingKeys, onChange]);

  const rowData = useMemo<RowData[]>(
    () =>
      Object.entries(variables).map(([key, v], idx) => ({
        ...v,
        _rowId: `${key}-${idx}`,
      })),
    [variables],
  );

  const getRowId = useCallback((p: GetRowIdParams<RowData>) => p.data._rowId, []);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<RowData>) => {
      const id = e.data._rowId;
      const originalKey = e.data.key;
      const newKey = e.colDef.field === 'key' ? e.newValue : originalKey;

      onChange({
        variables: Object.entries(variables).reduce(
          (acc, [key, v]) => {
            if (v.key === originalKey) {
              acc[newKey] = { ...v, [e.colDef.field as string]: e.newValue };
            } else {
              acc[key] = v;
            }
            return acc;
          },
          {} as Record<string, AppDataVariable>,
        ),
      });
    },
    [variables, onChange],
  );

  const onDelete = useCallback(
    (rowId: string) => {
      const keyToDelete = rowData.find((r) => r._rowId === rowId)?.key;
      if (!keyToDelete) return;

      onChange({
        variables: Object.entries(variables).reduce(
          (acc, [key, v]) => {
            if (v.key !== keyToDelete) {
              acc[key] = v;
            }
            return acc;
          },
          {} as Record<string, AppDataVariable>,
        ),
      });
    },
    [variables, rowData, onChange],
  );

  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const colDefs = useMemo<ColDef<RowData>[]>(
    () => [
      {
        field: 'key',
        headerName: 'Key',
        flex: 1,
        editable: true,
        cellClass: 'font-mono',
      },
      {
        field: 'value',
        headerName: 'Value',
        flex: 2,
        editable: true,
        cellClass: 'font-mono',
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
    [],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
        <div className="rounded-md border border-border bg-card px-3 py-2.5 flex-shrink-0">
          <Label className="text-[11px] font-medium text-muted-foreground block mb-2">
            Add New Variable
          </Label>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Key *</label>
              <Input
                placeholder="e.g., asOfDate"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="h-8 text-xs"
              />
              {existingKeys.has(newKey) && newKey && (
                <p className="text-[10px] text-destructive">Key already exists</p>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Value</label>
              <Input
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <Button
              size="sm"
              onClick={handleAddPair}
              disabled={!newKey.trim() || existingKeys.has(newKey)}
              className="h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {rowData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              No variables yet. Add one using the form above.
            </div>
          ) : (
            <AgGridReact<RowData>
              theme={gridTheme}
              modules={[AllCommunityModule]}
              rowData={rowData}
              columnDefs={colDefs}
              getRowId={getRowId}
              singleClickEdit
              onCellValueChanged={onCellValueChanged}
              headerHeight={28}
              rowHeight={32}
              defaultColDef={{
                resizable: true,
                sortable: false,
                suppressHeaderMenuButton: true,
              }}
              suppressContextMenu
            />
          )}
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
      title="Remove variable"
      onClick={() => onDeleteRef.current(data!._rowId)}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}

