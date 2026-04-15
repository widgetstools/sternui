import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock } from 'lucide-react';
import { RESERVED_DEFAULT_PROFILE_ID, type ProfileMeta } from '@grid-customizer/core-v2';

export interface ProfileSelectorProps {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isDirty: boolean;
  onCreate: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
}

/**
 * Compact profile picker for the toolbar. Displays the active profile name
 * with a dirty dot, opens a popover listing all profiles + an inline create
 * input. Mirrors the v1 selector visually so the same E2E selectors and
 * existing CSS keep working.
 */
export function ProfileSelector({
  profiles,
  activeProfileId,
  isDirty,
  onCreate,
  onLoad,
  onDelete,
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — same UX rules v1 enforced.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = profiles.find((p) => p.id === activeProfileId);
  const triggerLabel = active?.name ?? 'No profile';

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setNewName('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="gc-profile-selector" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active ? (isDirty ? `${active.name} (unsaved changes)` : active.name) : 'Select or create a profile'}
        data-testid="profile-selector-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 10px',
          background: 'var(--card, #161a1e)',
          border: '1px solid var(--border, #313944)',
          borderRadius: 6,
          color: active ? 'var(--foreground, #eaecef)' : 'var(--muted-foreground, #a0a8b4)',
          cursor: 'pointer',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        <span
          aria-label={isDirty ? 'unsaved' : 'saved'}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: active
              ? (isDirty ? 'var(--bn-yellow, #f0b90b)' : 'var(--primary, #14b8a6)')
              : 'var(--muted-foreground, #6b7280)',
          }}
        />
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {triggerLabel}
        </span>
        <ChevronDown size={12} strokeWidth={1.75} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <div
          data-testid="profile-selector-popover"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            minWidth: 280, maxWidth: 'min(360px, calc(100vw - 24px))',
            background: 'var(--card, #1e2329)',
            border: '1px solid var(--border, #313944)',
            borderRadius: 6,
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            zIndex: 50, overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 4 }}>
            {profiles.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--muted-foreground, #a0a8b4)', textAlign: 'center' }}>
                No profiles yet — create one below
              </div>
            ) : profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              const isReserved = p.id === RESERVED_DEFAULT_PROFILE_ID;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`profile-row-${p.id}`}
                  onClick={() => { onLoad(p.id); setOpen(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onLoad(p.id); setOpen(false); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                    background: isActive ? 'var(--accent, rgba(20,184,166,0.12))' : 'transparent',
                    color: isActive ? 'var(--primary, #14b8a6)' : 'var(--foreground, #eaecef)',
                    fontSize: 11,
                  }}
                >
                  <Check size={12} strokeWidth={2.5} style={{ opacity: isActive ? 1 : 0, color: 'var(--primary, #14b8a6)' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
                    {p.name}
                  </span>
                  {isReserved ? (
                    // Default cannot be deleted — Lock icon keeps the row layout consistent
                    // with deletable rows so the click target lines up.
                    <span title="Built-in default profile (cannot be deleted)" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, color: 'var(--muted-foreground, #a0a8b4)', opacity: 0.55,
                    }}>
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
                        width: 20, height: 20, border: 'none', background: 'transparent',
                        color: 'var(--muted-foreground, #a0a8b4)', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{
            display: 'flex', gap: 4, padding: 6,
            borderTop: '1px solid var(--border, #313944)',
            background: 'var(--muted, rgba(255,255,255,0.02))',
          }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="New profile name..."
              autoFocus
              data-testid="profile-name-input"
              style={{
                flex: 1, minWidth: 0, height: 26, padding: '0 8px',
                background: 'var(--background, #0b0e11)',
                border: '1px solid var(--border, #313944)',
                borderRadius: 4, color: 'var(--foreground, #eaecef)',
                fontSize: 11, outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim()}
              title="Save current state as new profile"
              data-testid="profile-create-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 26, padding: '0 10px',
                background: newName.trim() ? 'var(--primary, #14b8a6)' : 'var(--muted, #2a2f37)',
                color: newName.trim() ? '#000' : 'var(--muted-foreground, #a0a8b4)',
                border: 'none', borderRadius: 4,
                fontSize: 11, fontWeight: 600,
                cursor: newName.trim() ? 'pointer' : 'not-allowed',
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
