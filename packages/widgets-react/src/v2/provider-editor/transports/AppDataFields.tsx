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
 * Values are stored as strings (for simple text) or JSON strings
 * (for complex data). The editor keeps it simple: just type the value
 * and optionally mark it as JSON if it's structured data.
 *
 * Optional: mark sensitive (hide in UI) or set durability
 * (volatile = memory-only; persisted = ConfigService).
 */

import React, { useState } from 'react';
import { Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@marketsui/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { AppDataVariable, AppDataProviderConfig } from '@marketsui/shared-types';

type ValueType = 'string' | 'json';

export interface AppDataFieldsProps {
  cfg: AppDataProviderConfig;
  onChange(next: Partial<AppDataProviderConfig>): void;
}

interface Row {
  key: string;
  value: string;               // raw editor input
  type: ValueType;
  description?: string;
  sensitive?: boolean;
  durability?: 'volatile' | 'persisted';
}

export function AppDataFields({ cfg, onChange }: AppDataFieldsProps) {
  const rows = toRows(cfg.variables ?? {});

  const update = (next: Row[]) => onChange({ variables: fromRows(next) });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 m-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variables</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => update([...rows, { key: '', value: '', type: 'string' }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>

        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">
            No entries yet. Add a key/value pair, e.g. <code className="bg-muted px-1 rounded">asOfDate</code> = <code className="bg-muted px-1 rounded">2024-01-15</code>.
          </div>
        ) : (
          <div className="space-y-2">
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
    </div>
  );
}

function RowInputs({ row, onChange, onRemove }: { row: Row; onChange(r: Row): void; onRemove(): void }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border border-border rounded-md bg-card p-2 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground text-xs font-medium"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Input
            className="h-7 text-xs font-mono flex-1"
            value={row.key}
            onChange={(e) => onChange({ ...row, key: e.target.value })}
            placeholder="key"
          />
          <Select value={row.type} onValueChange={(v) => onChange({ ...row, type: v as ValueType })}>
            <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="json">json</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-7 text-xs font-mono flex-1"
            value={row.value}
            onChange={(e) => onChange({ ...row, value: e.target.value })}
            placeholder={row.type === 'json' ? '{"key":"value"}' : 'value'}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={onRemove}
            title="Remove"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="pl-6 space-y-2 border-t border-border/50 pt-2">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground block">Description</label>
            <Input
              className="h-7 text-xs"
              value={row.description ?? ''}
              onChange={(e) => onChange({ ...row, description: e.target.value || undefined })}
              placeholder="Optional notes"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={row.sensitive ?? false}
                onCheckedChange={(checked) => onChange({ ...row, sensitive: checked ? true : undefined })}
              />
              <span className="text-xs font-medium text-muted-foreground">Sensitive (hide in UI)</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground block">Durability</label>
            <Select value={row.durability ?? 'volatile'} onValueChange={(v) => onChange({ ...row, durability: v as 'volatile' | 'persisted' })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volatile" className="text-xs">volatile (memory-only)</SelectItem>
                <SelectItem value="persisted" className="text-xs">persisted (saved to config)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

function toRows(variables: Record<string, AppDataVariable>): Row[] {
  return Object.entries(variables).map(([_key, variable]) => {
    // Reconstruct value as string for editing
    let value: string;
    if (variable.type === 'json' && typeof variable.value === 'object') {
      value = JSON.stringify(variable.value, null, 2);
    } else {
      value = String(variable.value);
    }
    return {
      key: variable.key,
      value,
      type: variable.type as ValueType,
      description: variable.description,
      sensitive: variable.sensitive,
      durability: variable.durability,
    };
  });
}

function fromRows(rows: Row[]): Record<string, AppDataVariable> {
  const out: Record<string, AppDataVariable> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Use index-based temp key for empty rows so they appear in UI while editing.
    // These temp entries won't persist to config (empty key = incomplete entry).
    const key = r.key || `__editing_${i}`;
    out[key] = {
      key: r.key, // Store actual key (empty if not filled yet)
      value: coerce(r.value, r.type),
      type: r.type,
      description: r.description,
      sensitive: r.sensitive,
      durability: r.durability ?? 'volatile',
    };
  }
  return out;
}

function coerce(v: string, type: ValueType): string | object {
  if (type === 'json') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}
