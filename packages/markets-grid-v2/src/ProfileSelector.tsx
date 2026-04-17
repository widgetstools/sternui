import React, { useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock, User } from 'lucide-react';
import { RESERVED_DEFAULT_PROFILE_ID, type ProfileMeta } from '@grid-customizer/core-v2';
import { Popover, PopoverTrigger, PopoverContent } from '@grid-customizer/core';

export interface ProfileSelectorProps {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isDirty: boolean;
  onCreate: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
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
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const active = profiles.find((p) => p.id === activeProfileId);
  const triggerLabel = active?.name ?? 'No profile';
  const canCreate = newName.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    await onCreate(newName.trim());
    setNewName('');
    setOpen(false);
  };

  return (
    <div className="gc-profile-selector" style={{ display: 'inline-flex' }}>
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
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px 8px',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--muted-foreground, #8b93a1)',
            }}>
              Profiles
            </span>
            <span style={{
              fontSize: 10, fontVariantNumeric: 'tabular-nums',
              color: 'var(--muted-foreground, #6b7280)',
            }}>
              {profiles.length}
            </span>
          </div>

          {/* List */}
          <div style={{ maxHeight: 288, overflowY: 'auto', padding: '0 6px 6px' }}>
            {profiles.length === 0 ? (
              <div style={{
                padding: '18px 12px', fontSize: 11, textAlign: 'center',
                color: 'var(--muted-foreground, #8b93a1)',
              }}>
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
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 14, height: 14,
                  }}>
                    {isActive ? (
                      <Check size={12} strokeWidth={2.5} style={{ color: 'var(--primary, #14b8a6)' }} />
                    ) : (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'color-mix(in srgb, var(--muted-foreground, #6b7280) 45%, transparent)',
                      }} />
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
                        if (window.confirm(`Delete profile "${p.name}"?`)) onDelete(p.id);
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
