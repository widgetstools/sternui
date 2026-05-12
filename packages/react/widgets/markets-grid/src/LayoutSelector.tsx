import { useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock, User, Download, Upload, Copy, Pencil, X } from 'lucide-react';
import { RESERVED_DEFAULT_LAYOUT_ID, type LayoutMeta } from '@starui/core';
// Static-layout styles — AUDIT i5 partial migration. State-dependent
// styles stay inline (see LayoutSelector.css for rationale).
import './LayoutSelector.css';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  GhostIconButton,
} from '@starui/grid-react';

export interface LayoutSelectorProps {
  layouts: LayoutMeta[];
  activeLayoutId: string;
  isDirty: boolean;
  onCreate: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called per-layout from the row's clone button. Suggested
   * implementation: dispatch `cloneLayout(sourceId, name)`. The parent
   * decides the default name ("Source Name (copy)" is conventional).
   * Omit to hide the clone affordance.
   */
  onClone?: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called when the user finishes inline-renaming a layout
   * row. Receives the layout id and the trimmed new name. Implementations
   * should dispatch `renameLayout(id, name)`. Omit to hide the rename
   * affordance. The reserved Default layout is never renameable.
   */
  onRename?: (id: string, name: string) => void | Promise<unknown>;
  /**
   * Optional: called per-layout from the row's download button AND from the
   * footer "Export active" action. Implementations should download a JSON
   * file. Omit to hide the export affordances.
   */
  onExport?: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called from the footer "Import…" action with a File the user
   * picked. Implementations should parse the JSON and call the layout
   * manager's importLayout. Omit to hide the import affordance.
   */
  onImport?: (file: File) => void | Promise<unknown>;
}

/**
 * Compact layout picker for the toolbar. Built on the shared shadcn Popover
 * so outside-click, Escape, portal rendering, and collision detection are
 * consistent with the rest of the app.
 */
export function LayoutSelector({
  layouts,
  activeLayoutId,
  isDirty,
  onCreate,
  onLoad,
  onDelete,
  onClone,
  onRename,
  onExport,
  onImport,
}: LayoutSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Pending-delete drives the shadcn AlertDialog. We track the FULL row
  // (not just the id) so the dialog can render the layout's display name
  // without having to re-lookup from `layouts` after the delete has
  // already removed it from the list.
  const [pendingDelete, setPendingDelete] = useState<LayoutMeta | null>(null);

  const active = layouts.find((p) => p.id === activeLayoutId);
  const triggerLabel = active?.name ?? 'No layout';
  const canCreate = newName.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    await onCreate(newName.trim());
    setNewName('');
    setOpen(false);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const commitRename = async () => {
    if (!renamingId || !onRename) return cancelRename();
    const target = layouts.find((p) => p.id === renamingId);
    const next = renameDraft.trim();
    // No-op when blank or unchanged — quietly cancel rather than fire a
    // pointless write.
    if (!next || (target && next === target.name)) return cancelRename();
    const id = renamingId;
    cancelRename();
    try {
      await onRename(id, next);
    } catch (err) {
      console.warn('[markets-grid] layout rename failed:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    // Close the dialog before awaiting the delete so focus returns to the
    // trigger cleanly and Radix doesn't fight us over focus restoration.
    setPendingDelete(null);
    await onDelete(target.id);
  };

  return (
    <div className="ds-layout-selector">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={active ? (isDirty ? `${active.name} (unsaved changes)` : active.name) : 'Select or create a layout'}
            data-testid="layout-selector-trigger"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 28, padding: '0 10px 0 8px',
              background: 'var(--ds-surface-primary)',
              border: '1px solid var(--ds-border-primary)',
              borderRadius: 6,
              color: active ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: 1,
              transition: 'border-color 120ms, background 120ms',
            }}
          >
            <span className="relative inline-flex items-center">
              <User size={12} strokeWidth={1.75} className="opacity-75" />
              <span
                aria-label={isDirty ? 'unsaved changes' : 'saved'}
                style={{
                  position: 'absolute', top: -2, right: -3,
                  width: 6, height: 6, borderRadius: '50%',
                  background: active
                    ? (isDirty ? 'var(--ds-accent-warning)' : 'var(--ds-accent-info)')
                    : 'var(--ds-text-muted)',
                  boxShadow: '0 0 0 1.5px var(--ds-surface-primary)',
                }}
              />
            </span>
            <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap font-medium tracking-[0.1px]">
              {triggerLabel}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={1.75}
              style={{
                opacity: 0.6,
                transition: 'transform 150ms',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          data-testid="layout-selector-popover"
          className="!p-0 !w-auto"
          style={{
            minWidth: 288,
            maxWidth: 'min(340px, calc(100vw - 24px))',
            overflow: 'hidden',
            borderRadius: 8,
          }}
        >
          {/* Header */}
          <div className="ds-ps-header">
            <span className="ds-ps-header-label">Layouts</span>
            <span className="ds-ps-header-count">{layouts.length}</span>
          </div>

          {/* List */}
          <div className="ds-ps-list ds-scrollbar">
            {layouts.length === 0 ? (
              <div className="ds-ps-empty">
                No layouts yet — create one below
              </div>
            ) : layouts.map((p) => {
              const isActive = p.id === activeLayoutId;
              const isReserved = p.id === RESERVED_DEFAULT_LAYOUT_ID;
              const isRenaming = renamingId === p.id;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`layout-row-${p.id}`}
                  data-row-hover-target=""
                  className="ds-ps-row"
                  data-active={isActive ? 'true' : undefined}
                  onClick={() => { if (!isRenaming) { onLoad(p.id); setOpen(false); } }}
                  onKeyDown={(e) => { if (!isRenaming && e.key === 'Enter') { onLoad(p.id); setOpen(false); } }}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 8px 7px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isActive
                      ? 'color-mix(in srgb, var(--ds-accent-info) 8%, transparent)'
                      : 'transparent',
                    color: 'var(--ds-text-primary)',
                    fontSize: 11,
                    transition: 'background 120ms',
                  }}
                >
                  {/* Active accent bar */}
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 2, top: 7, bottom: 7,
                      width: 2, borderRadius: 2,
                      background: isActive ? 'var(--ds-accent-info)' : 'transparent',
                    }}
                  />

                  {/* Leading indicator */}
                  <span className="ds-ps-row-indicator">
                    {isActive ? (
                      <Check size={12} strokeWidth={2.5} className="text-[var(--ds-accent-info)]" />
                    ) : (
                      <span className="ds-ps-row-dot" />
                    )}
                  </span>

                  {/* Name — switches to inline input while renaming */}
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameDraft}
                      autoFocus
                      data-testid={`layout-rename-input-${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                      }}
                      onBlur={() => { void commitRename(); }}
                      style={{
                        flex: 1, minWidth: 0, height: 22, padding: '0 6px',
                        background: 'var(--ds-surface-ground)',
                        border: '1px solid color-mix(in srgb, var(--ds-accent-info) 55%, var(--ds-border-primary))',
                        borderRadius: 4,
                        color: 'var(--ds-text-primary)',
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 450,
                        letterSpacing: 0.1,
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span style={{
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: isActive ? 600 : 450,
                      color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-primary)',
                      letterSpacing: 0.1,
                    }}>
                      {p.name}
                    </span>
                  )}

                  {/* Dirty dot beside active row name */}
                  {isActive && isDirty && (
                    <span
                      title="Unsaved changes"
                      aria-label="unsaved"
                      className="w-1.5 h-1.5 rounded-full bg-[var(--ds-accent-warning)] shrink-0"
                    />
                  )}

                  {/* Per-row rename button — switches the row into
                      inline-edit mode. Hidden for the reserved Default
                      layout (renaming would break the lookup contract). */}
                  {onRename && !isReserved && !isRenaming && (
                    <GhostIconButton
                      reveal="on-row-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(p.id);
                        setRenameDraft(p.name);
                      }}
                      title={`Rename "${p.name}"`}
                      aria-label={`Rename layout ${p.name}`}
                      data-testid={`layout-rename-${p.id}`}
                    >
                      <Pencil size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}

                  {/* Cancel-rename button — only rendered while this row
                      is in edit mode. Mousedown (not click) so it fires
                      before the input's blur-commits handler. */}
                  {isRenaming && (
                    <GhostIconButton
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelRename();
                      }}
                      title="Cancel rename"
                      aria-label="Cancel rename"
                      data-testid={`layout-rename-cancel-${p.id}`}
                    >
                      <X size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}

                  {/* Per-row clone button — duplicates the layout with
                      a "(copy)" suffix and activates it. Revealed on
                      hover just like export/delete. */}
                  {onClone && !isRenaming && (
                    <GhostIconButton
                      reveal="on-row-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClone(p.id);
                        setOpen(false);
                      }}
                      title={`Clone "${p.name}"`}
                      aria-label={`Clone layout ${p.name}`}
                      data-testid={`layout-clone-${p.id}`}
                    >
                      <Copy size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}

                  {/* Per-row export button — revealed on hover next to delete */}
                  {onExport && !isRenaming && (
                    <GhostIconButton
                      reveal="on-row-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(p.id);
                      }}
                      title={`Export "${p.name}" as JSON`}
                      aria-label={`Export layout ${p.name}`}
                      data-testid={`layout-export-${p.id}`}
                    >
                      <Download size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}

                  {/* Trailing affordance — suppressed while renaming so
                      the input owns the row's right edge. */}
                  {isRenaming ? null : isReserved ? (
                    <span
                      title="Built-in default layout"
                      className="flex items-center justify-center w-[22px] h-[22px] text-[var(--ds-text-secondary)] opacity-[0.55]"
                    >
                      <Lock size={12} strokeWidth={2.25} />
                    </span>
                  ) : (
                    <GhostIconButton
                      variant="destructive"
                      reveal="on-row-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Close the layout popover as we open the confirm
                        // dialog — otherwise clicks inside the dialog would
                        // fall through to the popover's dismiss layer and
                        // race with the AlertDialog's focus trap.
                        setOpen(false);
                        setPendingDelete(p);
                      }}
                      title="Delete layout"
                      aria-label={`Delete layout ${p.name}`}
                    >
                      <Trash2 size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}
                </div>
              );
            })}
          </div>

          {/* Separator */}
          <div className="h-px bg-[color-mix(in_srgb,var(--ds-border-primary)_60%,transparent)]" />

          {/* Create new */}
          <div className="px-2.5 pt-2.5 pb-3">
            <div className="text-[10px] font-semibold tracking-[0.6px] uppercase text-[var(--ds-text-secondary)] mb-1.5">
              Save current as
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--ds-surface-ground)',
                border: `1px solid ${inputFocused
                  ? 'color-mix(in srgb, var(--ds-accent-info) 55%, var(--ds-border-primary))'
                  : 'var(--ds-border-primary)'}`,
                borderRadius: 6,
                boxShadow: inputFocused
                  ? '0 0 0 3px color-mix(in srgb, var(--ds-accent-info) 14%, transparent)'
                  : 'none',
                transition: 'border-color 120ms, box-shadow 120ms',
                overflow: 'hidden',
              }}
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setNewName(''); (e.currentTarget as HTMLInputElement).blur(); }
                }}
                placeholder="New layout name"
                autoFocus
                data-testid="layout-name-input"
                className="flex-1 min-w-0 h-[30px] px-2.5 bg-transparent border-none text-foreground text-[11px] outline-none tracking-[0.1px]"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                title="Save current state as new layout"
                data-testid="layout-create-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 30, padding: '0 12px',
                  background: canCreate ? 'var(--ds-accent-info)' : 'transparent',
                  color: canCreate ? 'hsl(var(--primary-foreground))' : 'var(--ds-text-muted)',
                  border: 'none',
                  borderLeft: `1px solid ${canCreate ? 'transparent' : 'var(--ds-border-primary)'}`,
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
                  cursor: canCreate ? 'pointer' : 'not-allowed',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                <Plus size={12} strokeWidth={2.25} />
                Save
              </button>
            </div>
          </div>

          {/* Import / Export row — rendered only when the host wired the
              callbacks. Keeps the popover compact for consumers that don't
              need the feature. */}
          {(onExport || onImport) && (
            <>
              <div className="h-px bg-[color-mix(in_srgb,var(--ds-border-primary)_60%,transparent)]" />
              <div className="flex gap-1.5 px-2.5 pt-2 pb-2.5">
                {onExport && (
                  <button
                    type="button"
                    onClick={() => { onExport(activeLayoutId); }}
                    title="Export the active layout to a JSON file"
                    data-testid="layout-export-active-btn"
                    style={{
                      flex: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      height: 28,
                      background: 'transparent',
                      border: '1px solid var(--ds-border-primary)',
                      borderRadius: 6,
                      color: 'var(--ds-text-primary)',
                      fontSize: 11, fontWeight: 500, letterSpacing: 0.15,
                      cursor: 'pointer',
                      transition: 'border-color 120ms, background 120ms, color 120ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ds-accent-info) 55%, var(--ds-border-primary))';
                      e.currentTarget.style.color = 'var(--ds-accent-info)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ds-border-primary)';
                      e.currentTarget.style.color = 'var(--ds-text-primary)';
                    }}
                  >
                    <Download size={12} strokeWidth={1.75} />
                    Export
                  </button>
                )}
                {onImport && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      data-testid="layout-import-file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onImport(file);
                        // Clear so re-picking the same file still fires change.
                        e.target.value = '';
                        setOpen(false);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Import a layout from a JSON file"
                      data-testid="layout-import-btn"
                      style={{
                        flex: 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        height: 28,
                        background: 'transparent',
                        border: '1px solid var(--ds-border-primary)',
                        borderRadius: 6,
                        color: 'var(--ds-text-primary)',
                        fontSize: 11, fontWeight: 500, letterSpacing: 0.15,
                        cursor: 'pointer',
                        transition: 'border-color 120ms, background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ds-accent-info) 55%, var(--ds-border-primary))';
                        e.currentTarget.style.color = 'var(--ds-accent-info)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--ds-border-primary)';
                        e.currentTarget.style.color = 'var(--ds-text-primary)';
                      }}
                    >
                      <Upload size={12} strokeWidth={1.75} />
                      Import
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Delete-layout confirmation — shadcn AlertDialog replaces the
          native window.confirm so the flow matches the rest of the app's
          design system AND doesn't block the renderer while the prompt
          is open (window.confirm freezes everything including pending
          React effects and IndexedDB reads). */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(nextOpen: boolean) => { if (!nextOpen) setPendingDelete(null); }}
      >
        <AlertDialogContent data-testid="layout-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete layout?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name ?? ''}&quot; will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="layout-delete-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="layout-delete-confirm-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
