import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock } from 'lucide-react';
import { type ProfileMeta, isReservedDefaultProfile } from '@grid-customizer/core';

export interface ProfileSelectorProps {
  profiles: ProfileMeta[];
  activeProfileId: string | null;
  activeProfileName: string | null;
  isDirty: boolean;
  onSave: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
}

/**
 * Compact profile selector + creator for the grid header.
 * - Shows the active profile name with a dirty indicator.
 * - Click opens a popover with the full profile list (click to load, × to delete).
 * - Bottom of the popover has an inline input + Save button to create a new profile.
 */
export function ProfileSelector({
  profiles,
  activeProfileId,
  activeProfileName,
  isDirty,
  onSave,
  onLoad,
  onDelete,
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  // Which side of the trigger to anchor the popover to.
  // Default 'right' (opens leftward) since the selector usually sits near the
  // right edge of a toolbar. Flips to 'left' when the trigger is close to the
  // left viewport edge so the popover still fits.
  const [anchor, setAnchor] = useState<'left' | 'right'>('right');

  // Recompute anchor when opening based on trigger position vs. viewport width.
  React.useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const POPOVER_MIN_WIDTH = 280;
    const spaceOnLeft = rect.right;            // trigger's right edge from viewport left
    const spaceOnRight = window.innerWidth - rect.left;
    // Prefer opening leftward (anchor right) when there's room on the left side
    if (spaceOnLeft >= POPOVER_MIN_WIDTH) {
      setAnchor('right');
    } else if (spaceOnRight >= POPOVER_MIN_WIDTH) {
      setAnchor('left');
    } else {
      // Neither side has full room — stick with whichever has more space
      setAnchor(spaceOnLeft >= spaceOnRight ? 'right' : 'left');
    }
  }, [open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on ESC
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name) return;
    await onSave(name);
    setNewName('');
    setOpen(false);
  };

  const triggerLabel = activeProfileName ?? 'No profile';

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={activeProfileName ? (isDirty ? `${activeProfileName} (unsaved changes)` : activeProfileName) : 'Select or create a profile'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 10px',
          background: 'var(--card, #161a1e)',
          border: '1px solid var(--border, #313944)',
          borderRadius: 6,
          color: activeProfileName ? 'var(--foreground, #eaecef)' : 'var(--muted-foreground, #a0a8b4)',
          cursor: 'pointer',
          fontFamily: "var(--fi-mono, 'JetBrains Mono', monospace)",
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        <span
          aria-label={isDirty ? 'unsaved' : 'saved'}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: activeProfileName
              ? (isDirty ? 'var(--bn-yellow, #f0b90b)' : 'var(--primary, #14b8a6)')
              : 'var(--muted-foreground, #6b7280)',
          }}
        />
        <span style={{
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: 500,
        }}>
          {triggerLabel}
        </span>
        <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)',
            ...(anchor === 'right' ? { right: 0 } : { left: 0 }),
            minWidth: 280,
            maxWidth: 'min(360px, calc(100vw - 24px))',
            background: 'var(--card, #1e2329)',
            border: '1px solid var(--border, #313944)',
            borderRadius: 6,
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            zIndex: 50,
            overflow: 'hidden',
            fontFamily: "var(--fi-sans, 'Geist', sans-serif)",
          }}
        >
          {/* Profile list */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 4 }}>
            {profiles.length === 0 ? (
              <div style={{
                padding: '10px 12px',
                fontSize: 11,
                color: 'var(--muted-foreground, #a0a8b4)',
                textAlign: 'center',
              }}>
                No profiles yet — create one below
              </div>
            ) : (
              profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                const isReserved = isReservedDefaultProfile(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { onLoad(p.id); setOpen(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onLoad(p.id); setOpen(false); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: isActive ? 'var(--accent, rgba(20,184,166,0.12))' : 'transparent',
                      color: isActive ? 'var(--primary, #14b8a6)' : 'var(--foreground, #eaecef)',
                      fontSize: 11,
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--muted, rgba(255,255,255,0.04))'; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      style={{ opacity: isActive ? 1 : 0, color: 'var(--primary, #14b8a6)' }}
                    />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
                      {p.name}
                    </span>
                    {p.isDefault && !isReserved && (
                      <span style={{
                        fontSize: 8, padding: '1px 5px', borderRadius: 2,
                        background: 'var(--primary, #14b8a6)', color: '#000', fontWeight: 600,
                        letterSpacing: '0.04em',
                      }}>
                        DEFAULT
                      </span>
                    )}
                    {isReserved ? (
                      // Built-in profile cannot be deleted — show a small Lock icon
                      // in the trash slot so the row layout stays consistent and
                      // users see why they can't delete it.
                      <span
                        title="Built-in default profile (cannot be deleted)"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20,
                          color: 'var(--muted-foreground, #a0a8b4)',
                          opacity: 0.55,
                        }}
                      >
                        <Lock size={10} strokeWidth={1.75} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete profile "${p.name}"?`)) onDelete(p.id);
                        }}
                        title="Delete profile"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20,
                          border: 'none', background: 'transparent',
                          color: 'var(--muted-foreground, #a0a8b4)',
                          borderRadius: 3, cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--destructive, #ef4444)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground, #a0a8b4)'; }}
                      >
                        <Trash2 size={11} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Create new profile */}
          <div style={{
            display: 'flex', gap: 4, padding: 6,
            borderTop: '1px solid var(--border, #313944)',
            background: 'var(--muted, rgba(255,255,255,0.02))',
          }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNew(); }}
              placeholder="New profile name..."
              autoFocus
              style={{
                flex: 1, minWidth: 0,
                height: 26, padding: '0 8px',
                background: 'var(--background, #0b0e11)',
                border: '1px solid var(--border, #313944)',
                borderRadius: 4,
                color: 'var(--foreground, #eaecef)',
                fontSize: 11,
                fontFamily: "var(--fi-sans, 'Geist', sans-serif)",
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleSaveNew}
              disabled={!newName.trim()}
              title="Save current state as new profile"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 26, padding: '0 10px',
                background: newName.trim() ? 'var(--primary, #14b8a6)' : 'var(--muted, #2a2f37)',
                color: newName.trim() ? '#000' : 'var(--muted-foreground, #a0a8b4)',
                border: 'none', borderRadius: 4,
                fontSize: 11, fontWeight: 600,
                cursor: newName.trim() ? 'pointer' : 'not-allowed',
                fontFamily: "var(--fi-sans, 'Geist', sans-serif)",
              }}
            >
              <Plus size={12} strokeWidth={2.25} />
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
