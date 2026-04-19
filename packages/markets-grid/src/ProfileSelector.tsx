/**
 * ProfileSelector — compact dropdown that lists every saved profile and
 * lets the user switch active profile, create a new one, rename, and
 * delete. Sits in the primary toolbar next to the Save button.
 *
 * Wires against `useProfileManager`, so every action flows through the
 * framework-agnostic `ProfileManager` class under the hood (same path
 * auto-save uses). No direct storage-adapter access here.
 */
import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  RESERVED_DEFAULT_PROFILE_ID,
  type UseProfileManagerResult,
} from '@grid-customizer/core';

export interface ProfileSelectorProps {
  /**
   * Result of `useProfileManager(...)` from the host. Passed in rather than
   * hooked here because the hook allocates a fresh `ProfileManager`, and
   * we want the host + selector to share the same instance.
   */
  profiles: UseProfileManagerResult;
  'data-testid'?: string;
}

export function ProfileSelector({
  profiles,
  'data-testid': testId = 'profile-selector',
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [renameMode, setRenameMode] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const active = profiles.profiles.find((p) => p.id === profiles.activeProfileId);

  const handlePick = useCallback(async (id: string) => {
    if (id === profiles.activeProfileId) { setOpen(false); return; }
    await profiles.loadProfile(id);
    setOpen(false);
  }, [profiles]);

  const handleNew = useCallback(async () => {
    const name = window.prompt('Profile name:');
    if (!name || !name.trim()) return;
    await profiles.createProfile(name.trim());
    setOpen(false);
  }, [profiles]);

  const handleRename = useCallback(async (id: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    await profiles.renameProfile(id, trimmed);
    setRenameMode(null);
  }, [profiles]);

  const handleDelete = useCallback(async (id: string) => {
    if (id === RESERVED_DEFAULT_PROFILE_ID) return;
    if (!window.confirm('Delete this profile?')) return;
    await profiles.deleteProfile(id);
  }, [profiles]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          disabled={profiles.isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            padding: '0 10px',
            background: 'var(--ck-card, #22262b)',
            color: 'var(--ck-t0, #eaecef)',
            border: '1px solid var(--ck-border-hi, #3a4149)',
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 500,
            cursor: profiles.isLoading ? 'wait' : 'pointer',
            fontFamily: 'var(--ck-font-sans)',
          }}
        >
          <span style={{ color: 'var(--ck-green, #22c55e)', fontSize: 8 }}>●</span>
          <span>{active?.name ?? 'Profile'}</span>
          <ChevronDown size={10} strokeWidth={2} color="var(--ck-t2, #a0a8b4)" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        style={{
          padding: 4,
          width: 260,
          background: 'var(--ck-card, #22262b)',
          border: '1px solid var(--ck-border-hi, #3a4149)',
          color: 'var(--ck-t0, #eaecef)',
          fontFamily: 'var(--ck-font-sans)',
        }}
      >
        {profiles.profiles.map((p) => {
          const isActive = p.id === profiles.activeProfileId;
          const isRenaming = renameMode === p.id;
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                background: isActive ? 'var(--ck-surface, #1a1d21)' : 'transparent',
                borderRadius: 2,
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  defaultValue={p.name}
                  autoFocus
                  onBlur={(e) => handleRename(p.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(p.id, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setRenameMode(null);
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--ck-bg, #111417)',
                    border: '1px solid var(--ck-border-hi, #3a4149)',
                    color: 'var(--ck-t0, #eaecef)',
                    padding: '2px 6px',
                    fontSize: 11,
                    borderRadius: 2,
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handlePick(p.id)}
                  data-testid={`profile-item-${p.id}`}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ck-t0, #eaecef)',
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '2px 2px',
                  }}
                >
                  {isActive && <span style={{ color: 'var(--ck-green, #22c55e)', marginRight: 6 }}>✓</span>}
                  {p.name}
                </button>
              )}
              <button
                type="button"
                title="Rename"
                onClick={() => setRenameMode(p.id)}
                style={iconBtn}
              >
                <Pencil size={10} />
              </button>
              {p.id !== RESERVED_DEFAULT_PROFILE_ID && (
                <button
                  type="button"
                  title="Delete"
                  onClick={() => handleDelete(p.id)}
                  style={iconBtn}
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          );
        })}
        <div style={{ borderTop: '1px solid var(--ck-border, #2d3339)', marginTop: 4, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleNew}
            data-testid="profile-new"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--ck-green, #22c55e)',
              fontSize: 11,
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            <Plus size={12} strokeWidth={2.25} />
            <span>New profile</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  background: 'transparent',
  border: 'none',
  color: 'var(--ck-t2, #a0a8b4)',
  cursor: 'pointer',
  borderRadius: 2,
};
