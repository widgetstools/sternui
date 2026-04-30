/**
 * ColumnsTab — review + lightly edit the column definitions chosen on
 * FieldsTab.
 *
 * Deliberately MUCH thinner than v1's ColumnsTab (~514 LOC of
 * formatter/renderer dropdowns + manual-add forms). The 80% case is:
 *   - confirm the order
 *   - rename a header
 *   - tweak the cellDataType
 *   - delete a row
 *   - pick the row-id key column(s) — single OR composite
 *
 * Anything beyond that lives in a follow-up. The persisted config is
 * a `ColumnDefinition[]`, identical to what AG-Grid consumes — adding
 * formatters/renderers later just means surfacing those fields here.
 */

import { useMemo } from 'react';
import { Button, Input, Label, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@marketsui/ui';
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import type { ColumnDefinition } from '@marketsui/shared-types';
import { normalizeKeyColumns } from '@marketsui/shared-types';
import { MultiSelect } from '../MultiSelect.js';

const CELL_TYPES: ReadonlyArray<NonNullable<ColumnDefinition['cellDataType']>> = [
  'text', 'number', 'boolean', 'date', 'dateString', 'object',
];

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

  const update = (idx: number, patch: Partial<ColumnDefinition>) => {
    const next = columns.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const remove = (idx: number) => onChange(columns.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= columns.length) return;
    const next = columns.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between flex-shrink-0">
        <div className="text-xs text-muted-foreground">
          <strong className="text-foreground">{columns.length}</strong> column{columns.length === 1 ? '' : 's'}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          <KeyColumnPicker
            columns={columns}
            keyColumn={keyColumn}
            onChange={onKeyColumnChange}
          />
          <div className="space-y-2">
            <Header />
            {columns.map((col, idx) => (
              <Row
                key={`${col.field}-${idx}`}
                col={col}
                isFirst={idx === 0}
                isLast={idx === columns.length - 1}
                onChange={(patch) => update(idx, patch)}
                onRemove={() => remove(idx)}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
              />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
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
      className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5"
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

function Header() {
  return (
    <div className="grid grid-cols-[24px_2fr_2fr_1fr_auto] gap-2 items-center px-2">
      <span />
      <Label className="text-[11px] font-medium text-muted-foreground">Field</Label>
      <Label className="text-[11px] font-medium text-muted-foreground">Header</Label>
      <Label className="text-[11px] font-medium text-muted-foreground">Type</Label>
      <span />
    </div>
  );
}

function Row({
  col, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  col: ColumnDefinition;
  isFirst: boolean;
  isLast: boolean;
  onChange(patch: Partial<ColumnDefinition>): void;
  onRemove(): void;
  onMoveUp(): void;
  onMoveDown(): void;
}) {
  return (
    <div className="grid grid-cols-[24px_2fr_2fr_1fr_auto] gap-2 items-center bg-card border border-border rounded-md px-2 py-1.5">
      <span className="text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
      <span className="text-xs font-mono text-foreground truncate" title={col.field}>{col.field}</span>
      <Input
        className="h-7 text-xs"
        value={col.headerName}
        onChange={(e) => onChange({ headerName: e.target.value })}
      />
      <Select value={col.cellDataType ?? 'text'} onValueChange={(v) => onChange({ cellDataType: v as ColumnDefinition['cellDataType'] })}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CELL_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-0.5">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={isFirst} onClick={onMoveUp} title="Move up">
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={isLast} onClick={onMoveDown} title="Move down">
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={onRemove} title="Remove">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
