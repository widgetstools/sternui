import React, { useState, useCallback, useRef, useSyncExternalStore } from 'react';
import type { SettingsPanelProps } from '../../types/module';
import { Icons } from '../../ui/icons';
import { PropertySection, PropRow, PropText } from '../../ui/PropertyPanel';
import { Button } from '../../ui/shadcn/button';
import { Input } from '../../ui/shadcn/input';
import { isReservedDefaultProfile } from '../../hooks/useProfileManager';

// The Profiles panel is special — it uses useProfileManager which needs
// the core and storage adapter. Config is injected per-gridId through
// a tiny pub-sub so the panel re-renders whenever the manager state changes.

export interface ProfilesPanelConfig {
  profiles: Array<{
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    isDefault: boolean;
  }>;
  activeProfileId: string | null;
  loading: boolean;
  onSave: (name: string, description?: string) => void;
  onLoad: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onRename: (profileId: string, newName: string) => void;
  onSetDefault: (profileId: string | null) => void;
  onExport: (profileId: string) => void;
  onImport: (json: string) => void;
}

// ─── Per-gridId subscribable config store ──────────────────────────────────
const _configs = new Map<string, ProfilesPanelConfig>();
const _listeners = new Map<string, Set<() => void>>();

function notify(gridId: string) {
  const set = _listeners.get(gridId);
  if (!set) return;
  for (const l of set) l();
}

export function setProfilesPanelConfig(gridId: string, config: ProfilesPanelConfig | null) {
  if (config) _configs.set(gridId, config);
  else _configs.delete(gridId);
  notify(gridId);
}

function subscribe(gridId: string, listener: () => void) {
  let set = _listeners.get(gridId);
  if (!set) { set = new Set(); _listeners.set(gridId, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}

function getSnapshot(gridId: string): ProfilesPanelConfig | null {
  return _configs.get(gridId) ?? null;
}

export function ProfilesPanel({ gridId }: SettingsPanelProps) {
  const config = useSyncExternalStore(
    useCallback((l) => subscribe(gridId, l), [gridId]),
    useCallback(() => getSnapshot(gridId), [gridId]),
    useCallback(() => getSnapshot(gridId), [gridId]),
  );
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!config) {
    return (
      <div className="gc-empty">
        Profile manager not configured.<br />
        Pass a StorageAdapter to enable profile persistence.
      </div>
    );
  }

  const { profiles, activeProfileId, loading, onSave, onLoad, onDelete, onRename, onSetDefault, onExport, onImport } = config;

  function handleSave() {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName('');
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImport(reader.result);
      }
    };
    reader.readAsText(file);
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div>
      {/* Save new profile */}
      <PropertySection title="Save Current State" defaultOpen>
        <PropRow label="Profile Name" vertical>
          <div style={{ display: 'flex', gap: 6 }}>
            <Input
              placeholder="Profile name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              style={{ flex: 1 }}
            />
            <Button
              variant="default" size="sm"
              onClick={handleSave}
              disabled={!newName.trim() || loading}
            >
              <Icons.Save size={12} /> Save
            </Button>
          </div>
        </PropRow>
      </PropertySection>

      {/* Import / Export */}
      <PropertySection title="Import / Export" defaultOpen={false}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            variant="outline" size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icons.Upload size={12} /> Import JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
      </PropertySection>

      {/* Profile list */}
      <div className="gc-section">
        <div className="gc-section-title">Saved Profiles ({profiles.length})</div>

        {profiles.length === 0 ? (
          <div className="gc-empty">No saved profiles yet</div>
        ) : (
          profiles.map((profile) => {
            const isReserved = isReservedDefaultProfile(profile.id);
            return (
            <div
              key={profile.id}
              className="gc-profile-item"
              data-active={activeProfileId === profile.id}
              data-reserved={isReserved || undefined}
              onClick={() => onLoad(profile.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {renamingId === profile.id ? (
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) onRename(profile.id, renameValue.trim());
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameValue.trim()) onRename(profile.id, renameValue.trim());
                        setRenamingId(null);
                      }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{ height: 24, fontSize: 12 }}
                  />
                ) : (
                  <>
                    <div className="gc-profile-name">
                      {profile.name}
                      {profile.isDefault && (
                        <span style={{
                          fontSize: 9, marginLeft: 6, padding: '1px 4px',
                          borderRadius: 3, background: 'var(--gc-accent-muted)',
                          color: 'var(--gc-accent)',
                        }}>
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="gc-profile-meta">{formatDate(profile.updatedAt)}</div>
                  </>
                )}
              </div>

              <div className="gc-profile-actions" onClick={(e) => e.stopPropagation()}>
                {!isReserved && (
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => { setRenamingId(profile.id); setRenameValue(profile.name); }}
                    title="Rename"
                  >
                    <Icons.Edit size={11} />
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon-sm"
                  onClick={() => onSetDefault(profile.isDefault ? null : profile.id)}
                  title={profile.isDefault ? 'Unset default' : 'Set as default'}
                >
                  <Icons.Star size={11} />
                </Button>
                <Button
                  variant="ghost" size="icon-sm"
                  onClick={() => onExport(profile.id)}
                  title="Export JSON"
                >
                  <Icons.Download size={11} />
                </Button>
                {!isReserved && (
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => onDelete(profile.id)}
                    title="Delete"
                    style={{ color: 'var(--gc-danger)' }}
                  >
                    <Icons.Trash size={11} />
                  </Button>
                )}
              </div>
            </div>
          );
          })
        )}
      </div>
    </div>
  );
}
