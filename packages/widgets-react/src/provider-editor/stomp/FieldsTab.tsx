/**
 * FieldsTab — field selection interface with tree view, search, and sidebar.
 * Displays inferred schema for selecting fields to use as columns.
 *
 * Design system:
 *   Toolbar padding: px-4 py-3
 *   Tree area padding: p-2
 *   Sidebar: w-64 (256px), enough for dotted field paths
 *   Font: text-[13px] for field items (matches tree view)
 *   Section headers: text-xs font-semibold uppercase tracking-wider text-muted-foreground
 */

import React, { useMemo } from 'react';
import { Input, Checkbox, ScrollArea, Badge, Button, Label } from '@marketsui/ui';
import { Search, Database, Loader2, RefreshCw } from 'lucide-react';
import type { FieldNode } from '@marketsui/shared-types';
import { SimpleTreeView } from './SimpleTreeView.js';
import { filterFields } from '@marketsui/shared-types';
import type { InferenceSummary } from './hooks/useFieldInference.js';

/** Sample-size choices surfaced in the Fields tab. 200 is the default
 *  per the integration plan §7 — biased toward rows with the most
 *  non-null fields (completeness-weighted). */
const SAMPLE_SIZE_OPTIONS = [50, 100, 200, 500] as const;

interface FieldsTabProps {
  inferredFields: FieldNode[];
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  fieldSearchQuery: string;
  selectAllChecked: boolean;
  selectAllIndeterminate: boolean;
  onFieldToggle: (path: string) => void;
  onExpandToggle: (path: string) => void;
  onSearchChange: (query: string) => void;
  onSelectAllChange: (checked: boolean) => void;
  onClearAll: () => void;
  onInferFields?: () => void;
  inferring?: boolean;
  /** Target sample size; bound to user-facing selector. */
  sampleSize?: number;
  onSampleSizeChange?: (n: number) => void;
  /** Last-run summary; rendered as a header card when present. */
  lastSummary?: InferenceSummary | null;
}

export const FieldsTab: React.FC<FieldsTabProps> = ({
  inferredFields,
  selectedFields,
  expandedFields,
  fieldSearchQuery,
  selectAllChecked,
  selectAllIndeterminate,
  onFieldToggle,
  onExpandToggle,
  onSearchChange,
  onSelectAllChange,
  onClearAll,
  onInferFields,
  inferring = false,
  sampleSize = 200,
  onSampleSizeChange,
  lastSummary = null,
}) => {
  const filteredFields = useMemo(
    () => filterFields(inferredFields, fieldSearchQuery),
    [inferredFields, fieldSearchQuery]
  );

  if (inferredFields.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md p-8">
          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Fields Inferred</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click "Infer Fields" to fetch sample data and analyze the schema.
          </p>
          {onSampleSizeChange && (
            <div className="flex items-center justify-center gap-2 mb-4 text-xs text-muted-foreground">
              <span>Sample size:</span>
              <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
            </div>
          )}
          {onInferFields && (
            <Button onClick={onInferFields} disabled={inferring}>
              {inferring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inferring...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Infer Fields
                </>
              )}
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground mt-3 max-w-xs mx-auto">
            Inference uses completeness-weighted sampling — rows with the
            fewest null/empty fields take priority so the schema reflects
            actual coverage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Inference summary header */}
      {lastSummary && (
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="outline" className="text-[10px]">Inference</Badge>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{lastSummary.rowsUsed}</strong> rows used
              {lastSummary.rowsFetched > lastSummary.rowsUsed && (
                <span className="text-muted-foreground"> (of {lastSummary.rowsFetched} fetched)</span>
              )}
              <span className="mx-2">·</span>
              <strong className="text-foreground">{lastSummary.fieldsDetected}</strong> fields detected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onSampleSizeChange && (
              <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
            )}
            {onInferFields && (
              <Button
                size="sm"
                variant="outline"
                onClick={onInferFields}
                disabled={inferring}
                title="Re-fetch + re-infer with the current sample size"
              >
                {inferring
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                <span className="ml-1.5 text-xs">Re-sample</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Toolbar: search + select all */}
      <div className="px-4 py-3 border-b border-border space-y-3 flex-shrink-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={fieldSearchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Select All / count / Clear */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={selectAllIndeterminate ? 'indeterminate' : selectAllChecked}
              onCheckedChange={onSelectAllChange}
            />
            <label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
              Select All
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedFields.size} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              disabled={selectedFields.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Main content: tree + selected sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Tree view */}
        <div className="flex-1 min-w-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              {filteredFields.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No fields match your search
                </div>
              ) : (
                <SimpleTreeView
                  fields={filteredFields}
                  selectedFields={selectedFields}
                  expandedFields={expandedFields}
                  onToggleField={onFieldToggle}
                  onToggleExpand={onExpandToggle}
                />
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Selected fields sidebar */}
        <div className="w-64 border-l border-border bg-muted/30 flex flex-col flex-shrink-0" data-tab-sidebar="selected">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Selected
              </h4>
              <Badge variant="secondary" className="text-xs">
                {selectedFields.size}
              </Badge>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">
              {selectedFields.size === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No fields selected
                </div>
              ) : (
                <div className="space-y-0.5">
                  {Array.from(selectedFields)
                    .sort((a, b) => a.localeCompare(b))
                    .map(path => (
                      <div
                        key={path}
                        className="text-xs font-mono py-1.5 px-2 bg-accent/50 rounded hover:bg-accent transition-colors truncate"
                        title={path}
                      >
                        {path}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

// ─── Sample-size picker ──────────────────────────────────────────────

interface SampleSizePickerProps {
  value: number;
  onChange: (n: number) => void;
}

const SampleSizePicker: React.FC<SampleSizePickerProps> = ({ value, onChange }) => {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background p-0.5">
      {SAMPLE_SIZE_OPTIONS.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              active
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            aria-pressed={active}
            title={`Sample ${n} rows for inference`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
};

// Suppress unused-import lint for Label (used in Connection card; kept here for future expansions).
void Label;
