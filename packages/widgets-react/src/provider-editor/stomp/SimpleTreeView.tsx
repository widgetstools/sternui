/**
 * SimpleTreeView — lightweight hierarchical tree with checkboxes.
 * Built with shadcn/ui primitives, no external tree library.
 *
 * Design system:
 *   Row height: h-8 (32px) for comfortable click targets
 *   Font: text-[13px] for field names (between xs and sm for density)
 *   Badge: text-[11px] monospace, fixed-width container for column alignment
 *   Indent: 20px per depth level
 *   Sample values: shown via title tooltip, not inline (preserves alignment)
 */

import React, { useMemo } from 'react';
import { Checkbox } from '@marketsui/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FieldNode } from '@marketsui/shared-types';

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20',
  number: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  boolean: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20',
  date: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  object: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20',
  array: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/20',
};

interface SimpleTreeViewProps {
  fields: FieldNode[];
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  onToggleField: (path: string) => void;
  onToggleExpand: (path: string) => void;
}

export const SimpleTreeView: React.FC<SimpleTreeViewProps> = ({
  fields,
  selectedFields,
  expandedFields,
  onToggleField,
  onToggleExpand,
}) => {
  return (
    <div>
      {fields.map(field => (
        <TreeNodeComponent
          key={field.path}
          node={field}
          depth={0}
          selectedFields={selectedFields}
          expandedFields={expandedFields}
          onToggleField={onToggleField}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  );
};

interface TreeNodeProps {
  node: FieldNode;
  depth: number;
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  onToggleField: (path: string) => void;
  onToggleExpand: (path: string) => void;
}

const TreeNodeComponent: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedFields,
  expandedFields,
  onToggleField,
  onToggleExpand,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedFields.has(node.path);
  const isLeaf = !hasChildren;

  const checkState = useMemo(() => {
    if (isLeaf) {
      return { checked: selectedFields.has(node.path), indeterminate: false };
    }

    const leafPaths: string[] = [];
    const collectLeaves = (n: FieldNode) => {
      if (!n.children || n.children.length === 0) {
        if (n.type !== 'object') leafPaths.push(n.path);
      } else {
        n.children.forEach(collectLeaves);
      }
    };
    if (node.children) node.children.forEach(collectLeaves);

    const selectedCount = leafPaths.filter(p => selectedFields.has(p)).length;
    const totalCount = leafPaths.length;

    if (selectedCount === 0) return { checked: false, indeterminate: false };
    if (selectedCount === totalCount) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  }, [node, isLeaf, selectedFields]);

  const typeColorClass = TYPE_COLORS[node.type] || TYPE_COLORS.string;
  const paddingLeft = depth * 20 + 8;

  // Build tooltip with sample value
  const tooltip = isLeaf && node.sample != null
    ? `${node.path} = ${String(node.sample)}`
    : node.path;

  return (
    <>
      <div
        className="flex items-center h-8 pr-2 rounded-sm hover:bg-accent/50 cursor-pointer transition-colors"
        style={{ paddingLeft }}
        title={tooltip}
      >
        {/* Expand/Collapse — fixed 20px */}
        {hasChildren ? (
          <button
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onToggleExpand(node.path)}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="flex-shrink-0 w-5" />
        )}

        {/* Checkbox — fixed width with gap */}
        <div className="flex-shrink-0 mr-2">
          <Checkbox
            checked={checkState.indeterminate ? 'indeterminate' : checkState.checked}
            onCheckedChange={() => onToggleField(node.path)}
          />
        </div>

        {/* Field name — fills remaining space, truncates */}
        <span
          className="text-[13px] truncate flex-1 min-w-0"
          onClick={() => hasChildren ? onToggleExpand(node.path) : onToggleField(node.path)}
        >
          {node.name}
        </span>

        {/* Type badge — fixed-width container so badges align across rows */}
        <div className="flex-shrink-0 w-[60px] flex justify-end ml-2">
          <span className={`text-[11px] font-mono px-1.5 py-px rounded ${typeColorClass}`}>
            {node.type}
          </span>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map(child => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFields={selectedFields}
              expandedFields={expandedFields}
              onToggleField={onToggleField}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </>
  );
};
