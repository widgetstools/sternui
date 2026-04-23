import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock, User, Download, Upload, Copy } from 'lucide-react';
import { RESERVED_DEFAULT_PROFILE_ID, type ProfileMeta } from '@marketsui/core';
// Static-layout styles — AUDIT i5 partial migration. State-dependent
// styles stay inline (see ProfileSelector.css for rationale).
import './ProfileSelector.css';
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
} from '@marketsui/core';

export interface ProfileSelectorProps {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isDirty: boolean;
  onCreate: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called per-profile from the row's clone button. Suggested
   * implementation: dispatch `cloneProfile(sourceId, name)`. The parent
   * decides the default name ("Source Name (copy)" is conventional).
   * Omit to hide the clone affordance.
   */
  onClone?: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called per-profile from the row's download button AND from the
   * footer "Export active" action. Implementations should download a JSON
   * file. Omit to hide the export affordances.
   */
  onExport?: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called from the footer "Import…" action with a File the user
   * picked. Implementations should parse the JSON and call the profile
   * manager's importProfile. Omit to hide the import affordance.
   */
  onImport?: (file: File) => void | Promise<unknown>;
}

/**
 * Compact profile picker for the toolbar. Built on the shared shadcn Popover
 * so outside-click, Escape, portal rendering, and collision detection are
 * consistent with the rest of the app.
 */
export function ProfileSelector({
  profiles,
  activeProfileId,
  isDirty,
  onCreate,
  onLoad,
  onDelete,
  onClone,
  onExport,
  onImport,
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Pending-delete drives the shadcn AlertDialog. We track the FULL row
  // (not just the id) so the dialog can render the profile's display name
  // without having to re-lookup from `profiles` after the delete has
  // already removed it from the list.
  const [pendingDelete, setPendingDelete] = useState<ProfileMeta | null>(null);

  const active = profiles.find((p) => p.id === activeProfileId);
  const triggerLabel = active?.name ?? 'No profile';
  const canCreate = newName.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    await onCreate(newName.trim());
    setNewName('');
    setOpen(false);
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
    <div className="gc-profile-selector">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={active ? (isDirty ? `${active.name} (unsaved changes)` : active.name) : 'Select or create a profile'}
            data-testid="profile-selector-trigger"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 28, padding: '0 10px 0 8px',
              background: 'var(--card, #161a1e)',
              border: '1px solid var(--border, #313944)',
              borderRadius: 6,
              color: active ? 'var(--foreground, #eaecef)' : 'var(--muted-foreground, #a0a8b4)',
              cursor: 'pointer',
              fontSize: 11,
              lineHeight: 1,
              transition: 'border-color 120ms, background 120ms',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <User size={12} strokeWidth={1.75} style={{ opacity: 0.75 }} />
              <span
                aria-label={isDirty ? 'unsaved changes' : 'saved'}
                style={{
                  position: 'absolute', top: -2, right: -3,
                  width: 6, height: 6, borderRadius: '50%',
                  background: active
                    ? (isDirty ? 'var(--bn-yellow, #f0b90b)' : 'var(--primary, #14b8a6)')
                    : 'var(--muted-foreground, #6b7280)',
                  boxShadow: '0 0 0 1.5px var(--card, #161a1e)',
                }}
              />
            </span>
            <span style={{
              maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontWeight: 500, letterSpacing: 0.1,
            }}>
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
          data-testid="profile-selector-popover"
          className="!p-0 !w-auto"
          style={{
            minWidth: 288,
            maxWidth: 'min(340px, calc(100vw - 24px))',
            overflow: 'hidden',
            borderRadius: 8,
          }}
        >
          {/* Header */}
          <div className="gc-ps-header">
            <span className="gc-ps-header-label">Profiles</span>
            <span className="gc-ps-header-count">{profiles.length}</span>
          </div>

          {/* List */}
          <div className="gc-ps-list">
            {profiles.length === 0 ? (
              <div className="gc-ps-empty">
                No profiles yet — create one below
              </div>
            ) : profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              const isReserved = p.id === RESERVED_DEFAULT_PROFILE_ID;
              const isHovered = hoverId === p.id;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`profile-row-${p.id}`}
                  onMouseEnter={() => setHoverId(p.id)}
                  onMouseLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                  onClick={() => { onLoad(p.id); setOpen(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onLoad(p.id); setOpen(false); } }}
                  style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 8px 7px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isActive
                      ? 'color-mix(in srgb, var(--primary, #14b8a6) 8%, transparent)'
                      : isHovered
                        ? 'color-mix(in srgb, var(--foreground, #eaecef) 5%, transparent)'
                        : 'transparent',
                    color: 'var(--foreground, #eaecef)',
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
                      background: isActive ? 'var(--primary, #14b8a6)' : 'transparent',
                    }}
                  />

                  {/* Leading indicator */}
                  <span className="gc-ps-row-indicator">
                    {isActive ? (
                      <Check size={12} strokeWidth={2.5} style={{ color: 'var(--primary, #14b8a6)' }} />
                    ) : (
                      <span className="gc-ps-row-dot" />
                    )}
                  </span>

                  {/* Name */}
                  <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: isActive ? 600 : 450,
                    color: isActive ? 'var(--foreground, #eaecef)' : 'var(--foreground, #d7dde5)',
                    letterSpacing: 0.1,
                  }}>
                    {p.name}
                  </span>

                  {/* Dirty dot beside active row name */}
                  {isActive && isDirty && (
                    <span
                      title="Unsaved changes"
                      aria-label="unsaved"
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--bn-yellow, #f0b90b)',
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Per-row clone button — duplicates the profile with
                      a "(copy)" suffix and activates it. Revealed on
                      hover just like export/delete. */}
                  {onClone && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClone(p.id);
                        setOpen(false);
                      }}
                      title={`Clone "${p.name}"`}
                      aria-label={`Clone profile ${p.name}`}
                      data-testid={`profile-clone-${p.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted-foreground, #8b93a1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 120ms, background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--primary, #14b8a6) 14%, transparent)';
                        e.currentTarget.style.color = 'var(--primary, #14b8a6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--muted-foreground, #8b93a1)';
                      }}
                    >
                      <Copy size={11} strokeWidth={1.75} />
                    </button>
                  )}

                  {/* Per-row export button — revealed on hover next to delete */}
                  {onExport && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(p.id);
                      }}
                      title={`Export "${p.name}" as JSON`}
                      aria-label={`Export profile ${p.name}`}
                      data-testid={`profile-export-${p.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted-foreground, #8b93a1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 120ms, background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--primary, #14b8a6) 14%, transparent)';
                        e.currentTarget.style.color = 'var(--primary, #14b8a6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--muted-foreground, #8b93a1)';
                      }}
                    >
                      <Download size={11} strokeWidth={1.75} />
                    </button>
                  )}

                  {/* Trailing affordance */}
                  {isReserved ? (
                    <span
                      title="Built-in default profile"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22,
                        color: 'var(--muted-foreground, #8b93a1)',
                        opacity: 0.55,
                      }}
                    >
                      <Lock size={11} strokeWidth={1.75} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Close the profile popover as we open the confirm
                        // dialog — otherwise clicks inside the dialog would
                        // fall through to the popover's dismiss layer and
                        // race with the AlertDialog's focus trap.
                        setOpen(false);
                        setPendingDelete(p);
                      }}
                      title="Delete profile"
                      aria-label={`Delete profile ${p.name}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--muted-foreground, #8b93a1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 120ms, background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--destructive, #ef4444) 14%, transparent)';
                        e.currentTarget.style.color = 'var(--destructive, #ef4444)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--muted-foreground, #8b93a1)';
                      }}
                    >
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Separator */}
          <div style={{
            height: 1,
            background: 'color-mix(in srgb, var(--border, #313944) 60%, transparent)',
          }} />

          {/* Create new */}
          <div style={{ padding: '10px 10px 12px' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--muted-foreground, #8b93a1)',
              marginBottom: 6,
            }}>
              Save current as
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--background, #0b0e11)',
                border: `1px solid ${inputFocused
                  ? 'color-mix(in srgb, var(--primary, #14b8a6) 55%, var(--border, #313944))'
                  : 'var(--border, #313944)'}`,
                borderRadius: 6,
                boxShadow: inputFocused
                  ? '0 0 0 3px color-mix(in srgb, var(--primary, #14b8a6) 14%, transparent)'
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
                placeholder="New profile name"
                autoFocus
                data-testid="profile-name-input"
                style={{
                  flex: 1, minWidth: 0, height: 30, padding: '0 10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--foreground, #eaecef)',
                  fontSize: 11,
                  outline: 'none',
                  letterSpacing: 0.1,
                }}
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                title="Save current state as new profile"
                data-testid="profile-create-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 30, padding: '0 12px',
                  background: canCreate ? 'var(--primary, #14b8a6)' : 'transparent',
                  color: canCreate ? '#0b0e11' : 'var(--muted-foreground, #6b7280)',
                  border: 'none',
                  borderLeft: `1px solid ${canCreate ? 'transparent' : 'var(--border, #313944)'}`,
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
              <div style={{
                height: 1,
                background: 'color-mix(in srgb, var(--border, #313944) 60%, transparent)',
              }} />
              <div style={{
                display: 'flex', gap: 6,
                padding: '8px 10px 10px',
              }}>
                {onExport && (
                  <button
                    type="button"
                    onClick={() => { onExport(activeProfileId); }}
                    title="Export the active profile to a JSON file"
                    data-testid="profile-export-active-btn"
                    style={{
                      flex: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      height: 28,
                      background: 'transparent',
                      border: '1px solid var(--border, #313944)',
                      borderRadius: 6,
                      color: 'var(--foreground, #eaecef)',
                      fontSize: 11, fontWeight: 500, letterSpacing: 0.15,
                      cursor: 'pointer',
                      transition: 'border-color 120ms, background 120ms, color 120ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary, #14b8a6) 55%, var(--border, #313944))';
                      e.currentTarget.style.color = 'var(--primary, #14b8a6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border, #313944)';
                      e.currentTarget.style.color = 'var(--foreground, #eaecef)';
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
                      data-testid="profile-import-file"
                      style={{ display: 'none' }}
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
                      title="Import a profile from a JSON file"
                      data-testid="profile-import-btn"
                      style={{
                        flex: 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        height: 28,
                        background: 'transparent',
                        border: '1px solid var(--border, #313944)',
                        borderRadius: 6,
                        color: 'var(--foreground, #eaecef)',
                        fontSize: 11, fontWeight: 500, letterSpacing: 0.15,
                        cursor: 'pointer',
                        transition: 'border-color 120ms, background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary, #14b8a6) 55%, var(--border, #313944))';
                        e.currentTarget.style.color = 'var(--primary, #14b8a6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border, #313944)';
                        e.currentTarget.style.color = 'var(--foreground, #eaecef)';
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

      {/* Delete-profile confirmation — shadcn AlertDialog replaces the
          native window.confirm so the flow matches the rest of the app's
          design system AND doesn't block the renderer while the prompt
          is open (window.confirm freezes everything including pending
          React effects and IndexedDB reads). */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(nextOpen: boolean) => { if (!nextOpen) setPendingDelete(null); }}
      >
        <AlertDialogContent data-testid="profile-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name ?? ''}&quot; will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-delete-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="profile-delete-confirm-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
