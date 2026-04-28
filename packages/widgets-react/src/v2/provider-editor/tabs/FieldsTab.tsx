/**
 * FieldsTab — pick which inferred fields to expose as columns.
 *
 * Workflow:
 *   1. User clicks "Infer Fields" (footer of the editor) — calls
 *      probe + inferFields under the hood, populates `inferredFields`.
 *   2. This tab shows the field tree with checkboxes.
 *   3. Selected fields are committed via `onCfgChange` as a list of
 *      column definitions; ColumnsTab renders the resulting list.
 *
 * Lighter than v1's tab — drops the multi-tier "select all /
 * indeterminate / search / sample-size pill" UI in favour of a flat
 * tree + select-all + a sample-size dropdown. The 80% case stays
 * simple; the long tail of features can come back if missed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge, Label } from '@marketsui/ui';
import { Database, Loader2, Search, RefreshCw } from 'lucide-react';
import type { FieldNode, ProviderConfig, ColumnDefinition } from '@marketsui/shared-types';
import { collectNonObjectLeaves, filterFields } from '@marketsui/shared-types';

const SAMPLE_SIZES = [50, 100, 200, 500] as const;

export interface FieldsTabProps {
  cfg: ProviderConfig;
  inferredFields: FieldNode[];
  inferenceSummary: { rowsFetched: number; rowsUsed: number; fieldsDetected: number } | null;
  inferring: boolean;
  inferenceError: string | null;
  sampleSize: number;
  onSampleSizeChange(n: number): void;
  onInfer(): void;
  /** Called when the user commits a selection — typically by toggling
   *  checkboxes. The container persists this into cfg.columnDefinitions. */
  onColumnsChange(columns: ColumnDefinition[]): void;
  /** Currently committed selection — the cfg.columnDefinitions list. */
  selectedColumnFields: readonly string[];
}

export function FieldsTab(props: FieldsTabProps) {
  const {
    cfg,
    inferredFields, inferenceSummary, inferring, inferenceError,
    sampleSize, onSampleSizeChange, onInfer,
    onColumnsChange, selectedColumnFields,
  } = props;

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedColumnFields));

  // Sync from cfg when columns change externally (e.g. on re-load).
  useEffect(() => {
    setSelected(new Set(selectedColumnFields));
  }, [selectedColumnFields]);

  const allLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const f of inferredFields) leaves.push(...collectNonObjectLeaves(f));
    return leaves;
  }, [inferredFields]);

  const filtered = useMemo(() => filterFields(inferredFields, search), [inferredFields, search]);

  const commit = (next: Set<string>) => {
    setSelected(next);
    const cols = buildColumns(inferredFields, [...next]);
    onColumnsChange(cols);
  };

  const toggleField = (path: string) => {
    const node = findNode(inferredFields, path);
    const next = new Set(selected);
    if (node && node.children) {
      const leaves = collectNonObjectLeaves(node);
      const allOn = leaves.every((l) => next.has(l));
      if (allOn) leaves.forEach((l) => next.delete(l));
      else leaves.forEach((l) => next.add(l));
    } else {
      if (next.has(path)) next.delete(path);
      else next.add(path);
    }
    commit(next);
  };

  const selectAll = (checked: boolean) => {
    commit(new Set(checked ? allLeaves : []));
  };

  const allSelected = allLeaves.length > 0 && allLeaves.every((l) => selected.has(l));
  const someSelected = !allSelected && allLeaves.some((l) => selected.has(l));

  if (inferredFields.length === 0) {
    return <EmptyInference cfg={cfg} sampleSize={sampleSize} onSampleSizeChange={onSampleSizeChange} onInfer={onInfer} inferring={inferring} error={inferenceError} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {inferenceSummary && (
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="outline" className="text-[10px]">Inference</Badge>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{inferenceSummary.rowsUsed}</strong> rows used
              {inferenceSummary.rowsFetched > inferenceSummary.rowsUsed && <span> (of {inferenceSummary.rowsFetched})</span>}
              <span className="mx-2">·</span>
              <strong className="text-foreground">{inferenceSummary.fieldsDetected}</strong> fields detected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
            <Button size="sm" variant="outline" onClick={onInfer} disabled={inferring} title="Re-fetch + re-infer">
              {inferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5 text-xs">Re-sample</span>
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-border space-y-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={someSelected ? 'indeterminate' : allSelected}
              onCheckedChange={(v) => selectAll(Boolean(v))}
            />
            <Label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer">
              Select All
            </Label>
          </div>
          <Badge variant="secondary" className="text-xs">{selected.size} selected</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          <FieldList nodes={filtered} selected={selected} onToggle={toggleField} />
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────

function findNode(fields: FieldNode[], path: string): FieldNode | undefined {
  for (const f of fields) {
    if (f.path === path) return f;
    if (f.children) {
      const found = findNode(f.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

function buildColumns(fields: FieldNode[], selectedPaths: string[]): ColumnDefinition[] {
  const byPath = new Map<string, FieldNode>();
  const walk = (nodes: FieldNode[]) => {
    for (const n of nodes) {
      byPath.set(n.path, n);
      if (n.children) walk(n.children);
    }
  };
  walk(fields);
  const out: ColumnDefinition[] = [];
  for (const path of selectedPaths) {
    const node = byPath.get(path);
    if (!node) continue;
    out.push({
      field: path,
      headerName: humanize(node.name),
      cellDataType: mapType(node.type),
      filter: true,
      sortable: true,
      resizable: true,
    });
  }
  return out;
}

function humanize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
}

function mapType(t: FieldNode['type']): ColumnDefinition['cellDataType'] {
  if (t === 'number' || t === 'boolean' || t === 'date' || t === 'object') return t;
  return 'text';
}

// ─── nested view ──────────────────────────────────────────────────

function FieldList({ nodes, selected, onToggle, depth = 0 }: { nodes: FieldNode[]; selected: Set<string>; onToggle(p: string): void; depth?: number }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const leaves = node.children ? collectNonObjectLeaves(node) : [node.path];
        const checkedAll = leaves.every((l) => selected.has(l));
        const checkedSome = !checkedAll && leaves.some((l) => selected.has(l));
        return (
          <li key={node.path}>
            <div className="flex items-center gap-2 py-1 hover:bg-accent/40 rounded px-1.5" style={{ paddingLeft: `${depth * 16 + 6}px` }}>
              <Checkbox
                checked={checkedSome ? 'indeterminate' : checkedAll}
                onCheckedChange={() => onToggle(node.path)}
              />
              <span className="text-[13px] font-mono">{node.name}</span>
              <span className="text-[10px] text-muted-foreground">{node.type}</span>
              {node.children && <span className="text-[10px] text-muted-foreground">({node.children.length})</span>}
            </div>
            {node.children && node.children.length > 0 && (
              <FieldList nodes={node.children} selected={selected} onToggle={onToggle} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SampleSizePicker({ value, onChange }: { value: number; onChange(n: number): void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
      <SelectContent>
        {SAMPLE_SIZES.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">{n} rows</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function EmptyInference({ cfg, sampleSize, onSampleSizeChange, onInfer, inferring, error }: { cfg: ProviderConfig; sampleSize: number; onSampleSizeChange(n: number): void; onInfer(): void; inferring: boolean; error: string | null }) {
  void cfg;
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-sm">
        <Database className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
        <h3 className="text-sm font-semibold mb-1">No fields inferred yet</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Click <strong>Infer Fields</strong> to fetch a sample snapshot and analyze the row schema.
        </p>
        <div className="flex items-center justify-center gap-2 mb-3 text-xs text-muted-foreground">
          <span>Sample size:</span>
          <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
        </div>
        <Button size="sm" onClick={onInfer} disabled={inferring}>
          {inferring ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Inferring…</> : <><Database className="h-3.5 w-3.5 mr-1.5" /> Infer Fields</>}
        </Button>
        {error && <p className="text-[11px] text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}
