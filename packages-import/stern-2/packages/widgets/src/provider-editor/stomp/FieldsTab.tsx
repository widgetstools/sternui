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
import { Input, Checkbox, ScrollArea, Badge, Button } from '@stern/ui';
import { Search, Database, Loader2 } from 'lucide-react';
import type { FieldNode } from '@stern/shared-types';
import { SimpleTreeView } from './SimpleTreeView.js';
import { filterFields } from '@stern/shared-types';

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
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
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
        <div className="w-64 border-l border-border bg-muted/30 flex flex-col flex-shrink-0">
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
