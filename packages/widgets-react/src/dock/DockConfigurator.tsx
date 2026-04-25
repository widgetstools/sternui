import { useState, useCallback, useRef } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@marketsui/ui';
import {
  createMenuItem,
  type DockMenuItem,
  findMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addMenuItem,
  duplicateMenuItem,
  moveMenuItem,
  countItems,
} from '@marketsui/shared-types';

// ============================================================================
// Types
// ============================================================================

export interface DockConfiguratorProps {
  initialItems: DockMenuItem[];
  onItemsChange?: (items: DockMenuItem[]) => void;
  onApply?: (items: DockMenuItem[]) => Promise<void>;
}

// ============================================================================
// Icons (inline SVG components to avoid extra dependencies)
// ============================================================================

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconFolder({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconSave({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconMoveUp({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function IconMoveDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconAddChild({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  );
}

// ============================================================================
// TreeNode Component
// ============================================================================

interface TreeNodeProps {
  item: DockMenuItem;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

function TreeNode({ item, level, selectedId, expandedIds, onSelect, onToggleExpand }: TreeNodeProps) {
  const isSelected = item.id === selectedId;
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedIds.has(item.id);

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={cn(
          'flex items-center w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-primary/10 text-primary border border-primary/20',
          !isSelected && 'border border-transparent',
        )}
        style={{ paddingLeft: `${8 + level * 20}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(item.id); }}
            className="mr-1 p-0.5 rounded hover:bg-muted"
          >
            <IconChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
            />
          </span>
        ) : (
          <span className="mr-1 w-[18px]" />
        )}

        {/* Icon */}
        {hasChildren ? (
          <IconFolder className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
        ) : (
          <IconFile className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
        )}

        {/* Caption */}
        <span className="truncate flex-1">{item.caption}</span>

        {/* Child count badge */}
        {hasChildren && (
          <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1.5">
            {item.children!.length}
          </Badge>
        )}
      </button>

      {/* Render children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          <div
            className="absolute left-0 top-0 bottom-0 border-l border-border"
            style={{ marginLeft: `${18 + level * 20}px` }}
          />
          {item.children!.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// PropertiesPanel Component
// ============================================================================

interface PropertiesPanelProps {
  item: DockMenuItem;
  onUpdate: (id: string, updates: Partial<DockMenuItem>) => void;
}

function PropertiesPanel({ item, onUpdate }: PropertiesPanelProps) {
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="caption" className="text-xs font-medium text-muted-foreground">
          Display Name
        </Label>
        <Input
          id="caption"
          key={`caption-${item.id}`}
          defaultValue={item.caption}
          onBlur={(e) => onUpdate(item.id, { caption: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="url" className="text-xs font-medium text-muted-foreground">
          Component URL
        </Label>
        <Input
          id="url"
          key={`url-${item.id}`}
          defaultValue={item.url}
          onBlur={(e) => onUpdate(item.id, { url: e.target.value })}
          disabled={hasChildren}
          placeholder={hasChildren ? '(parent items don\'t have URLs)' : '/blotter/orders'}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="icon" className="text-xs font-medium text-muted-foreground">
          Icon Path
        </Label>
        <Input
          id="icon"
          key={`icon-${item.id}`}
          defaultValue={item.icon || ''}
          onBlur={(e) => onUpdate(item.id, { icon: e.target.value || undefined })}
          placeholder="/icons/blotter-dark.svg"
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="openMode" className="text-xs font-medium text-muted-foreground">
            Open Mode
          </Label>
          <Select
            key={`openMode-${item.id}`}
            defaultValue={item.openMode}
            onValueChange={(val) => onUpdate(item.id, { openMode: val as 'window' | 'view' })}
            disabled={hasChildren}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View</SelectItem>
              <SelectItem value="window">Window</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="order" className="text-xs font-medium text-muted-foreground">
            Sort Order
          </Label>
          <Input
            id="order"
            type="number"
            key={`order-${item.id}`}
            defaultValue={item.order}
            onBlur={(e) => onUpdate(item.id, { order: parseInt(e.target.value, 10) || 0 })}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Separator className="my-3" />

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Item ID</Label>
        <div className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1.5 rounded-md break-all">
          {item.id}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DockConfigurator Component
// ============================================================================

export function DockConfigurator({ initialItems, onItemsChange, onApply }: DockConfiguratorProps) {
  const [menuItems, setMenuItems] = useState<DockMenuItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = selectedId ? findMenuItem(menuItems, selectedId) : null;
  const totalCount = countItems(menuItems);

  // -- Mutation helper --
  const mutate = useCallback(
    (fn: (items: DockMenuItem[]) => DockMenuItem[]) => {
      setMenuItems((prev) => {
        const next = fn(prev);
        onItemsChange?.(next);
        return next;
      });
      setIsDirty(true);
    },
    [onItemsChange],
  );

  // -- Handlers --
  const handleAdd = useCallback(
    (parentId?: string) => {
      const item = createMenuItem({
        caption: parentId ? 'New Child Item' : 'New Menu Item',
        order: totalCount,
      });
      mutate((items) => addMenuItem(items, item, parentId));
      setSelectedId(item.id);
      if (parentId) {
        setExpandedIds((prev) => new Set(prev).add(parentId));
      }
    },
    [mutate, totalCount],
  );

  const handleDelete = useCallback(
    (id: string) => {
      mutate((items) => deleteMenuItem(items, id));
      if (selectedId === id) setSelectedId(null);
    },
    [mutate, selectedId],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const newId = `menu-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      mutate((items) => duplicateMenuItem(items, id, newId));
      setSelectedId(newId);
    },
    [mutate],
  );

  const handleUpdate = useCallback(
    (id: string, updates: Partial<DockMenuItem>) => {
      mutate((items) => updateMenuItem(items, id, updates));
    },
    [mutate],
  );

  const handleMoveUp = useCallback(
    (id: string) => {
      mutate((items) => {
        const idx = items.findIndex((item) => item.id === id);
        if (idx <= 0) return items;
        const result = [...items];
        [result[idx - 1], result[idx]] = [result[idx], result[idx - 1]];
        return result;
      });
    },
    [mutate],
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      mutate((items) => {
        const idx = items.findIndex((item) => item.id === id);
        if (idx < 0 || idx >= items.length - 1) return items;
        const result = [...items];
        [result[idx], result[idx + 1]] = [result[idx + 1], result[idx]];
        return result;
      });
    },
    [mutate],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // -- Save: apply via callback --
  const handleSave = useCallback(async () => {
    if (!onApply) return;
    setIsSaving(true);
    try {
      await onApply(menuItems);
      setIsDirty(false);
      console.log('[DockConfigurator] Dock updated with', menuItems.length, 'items');
    } catch (error) {
      console.error('[DockConfigurator] Failed to update dock', error);
    } finally {
      setIsSaving(false);
    }
  }, [menuItems, onApply]);

  // -- Export --
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(menuItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dock-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [menuItems]);

  // -- Import --
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          const items = Array.isArray(parsed) ? parsed : parsed.menuItems || parsed.config?.menuItems || [];
          setMenuItems(items);
          setIsDirty(true);
          setSelectedId(null);
          onItemsChange?.(items);
          console.log('[DockConfigurator] Imported', items.length, 'items');
        } catch (err) {
          console.error('[DockConfigurator] Invalid JSON file', err);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onItemsChange],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-background text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Dock Configuration</h2>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
            </Badge>
            {isDirty && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-yellow-500 border-yellow-500/50">
                Unsaved
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleImport}>
                  <IconUpload className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Import JSON</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport}>
                  <IconDownload className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export JSON</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-4 mx-1" />

            <Button
              size="sm"
              className="h-7 text-xs px-3"
              disabled={!isDirty || isSaving || !onApply}
              onClick={handleSave}
            >
              <IconSave className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Apply to Dock'}
            </Button>
          </div>
        </div>

        {/* Body: Tree + Properties split */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Tree View */}
          <div className="w-[280px] border-r border-border flex flex-col">
            {/* Tree toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAdd()}>
                    <IconPlus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add root item</TooltipContent>
              </Tooltip>

              {selectedId && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAdd(selectedId)}>
                        <IconAddChild className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add child</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicate(selectedId)}>
                        <IconCopy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicate</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveUp(selectedId)}>
                        <IconMoveUp className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move up</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveDown(selectedId)}>
                        <IconMoveDown className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move down</TooltipContent>
                  </Tooltip>

                  <div className="flex-1" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(selectedId)}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>

            {/* Tree list */}
            <ScrollArea className="flex-1">
              <div className="py-1">
                {menuItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <IconFolder className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">No menu items</p>
                    <p className="text-xs text-muted-foreground/60 mb-3">
                      Add items to populate the dock
                    </p>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAdd()}>
                      <IconPlus className="h-3 w-3 mr-1.5" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  menuItems.map((item) => (
                    <TreeNode
                      key={item.id}
                      item={item}
                      level={0}
                      selectedId={selectedId}
                      expandedIds={expandedIds}
                      onSelect={setSelectedId}
                      onToggleExpand={handleToggleExpand}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Properties Panel */}
          <div className="flex-1 overflow-auto">
            {selectedItem ? (
              <PropertiesPanel
                key={selectedItem.id}
                item={selectedItem}
                onUpdate={handleUpdate}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select an item to edit its properties
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </TooltipProvider>
  );
}
