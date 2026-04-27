/**
 * AppDataFields — key/value editor for AppData providers.
 *
 * AppData is a small key-value store, NOT a streaming source.
 * Other providers reference its keys via `{{name.key}}` templates.
 * Common entries:
 *   - `positions.asOfDate` — bound to the historical date picker
 *   - `positions.clientId` — the user's account scope token
 *   - `auth.token`        — bearer token shared across REST cfgs
 *
 * Values are stored as JSON-typed primitives (string / number /
 * boolean) — the editor surfaces a simple type chip per row so the
 * resolver knows how to render them when interpolated.
 */

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@marketsui/ui';
import { Plus, Trash2 } from 'lucide-react';

type Primitive = string | number | boolean;
type ValueType = 'string' | 'number' | 'boolean';

export interface AppDataFieldsCfg {
  /** Plain object of values keyed by the AppData key string. */
  values?: Record<string, Primitive>;
}

export interface AppDataFieldsProps {
  cfg: AppDataFieldsCfg;
  onChange(next: Partial<AppDataFieldsCfg>): void;
}

interface Row {
  key: string;
  value: string;          // raw editor input — coerced on save
  type: ValueType;
}

export function AppDataFields({ cfg, onChange }: AppDataFieldsProps) {
  const rows = toRows(cfg.values ?? {});

  const update = (next: Row[]) => onChange({ values: fromRows(next) });

  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key / Value Pairs</h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => update([...rows, { key: '', value: '', type: 'string' }])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add row
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          No entries yet. Add a row, e.g. <code className="bg-muted px-1 rounded">asOfDate</code> = <code className="bg-muted px-1 rounded">2024-01-15</code>.
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_2fr_auto] gap-2 items-center text-xs">
          <Label className="text-[11px] font-medium text-muted-foreground">Key</Label>
          <Label className="text-[11px] font-medium text-muted-foreground">Type</Label>
          <Label className="text-[11px] font-medium text-muted-foreground">Value</Label>
          <span />
          {rows.map((row, idx) => (
            <RowInputs
              key={idx}
              row={row}
              onChange={(next) => {
                const copy = rows.slice();
                copy[idx] = next;
                update(copy);
              }}
              onRemove={() => update(rows.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RowInputs({ row, onChange, onRemove }: { row: Row; onChange(r: Row): void; onRemove(): void }) {
  return (
    <>
      <Input
        className="h-8 text-xs font-mono"
        value={row.key}
        onChange={(e) => onChange({ ...row, key: e.target.value })}
        placeholder="key"
      />
      <Select value={row.type} onValueChange={(v) => onChange({ ...row, type: v as ValueType })}>
        <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="string">string</SelectItem>
          <SelectItem value="number">number</SelectItem>
          <SelectItem value="boolean">boolean</SelectItem>
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs font-mono"
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        placeholder={row.type === 'boolean' ? 'true | false' : 'value'}
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={onRemove}
        title="Remove row"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </>
  );
}

function toRows(values: Record<string, Primitive>): Row[] {
  return Object.entries(values).map(([key, value]) => {
    if (typeof value === 'number') return { key, value: String(value), type: 'number' as ValueType };
    if (typeof value === 'boolean') return { key, value: String(value), type: 'boolean' as ValueType };
    return { key, value: String(value), type: 'string' as ValueType };
  });
}

function fromRows(rows: Row[]): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const r of rows) {
    if (!r.key) continue;
    out[r.key] = coerce(r.value, r.type);
  }
  return out;
}

function coerce(v: string, type: ValueType): Primitive {
  if (type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'boolean') return v.trim().toLowerCase() === 'true';
  return v;
}
