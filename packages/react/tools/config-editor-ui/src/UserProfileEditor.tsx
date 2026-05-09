import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';
import type {
  AppRegistryRow,
  RoleRow,
  UserProfileRow,
} from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';

interface DraftUserProfile {
  userId: string;
  displayName: string;
  appId: string;
  roleIds: string[];
}

const EMPTY_DRAFT: DraftUserProfile = {
  userId: '',
  displayName: '',
  appId: '',
  roleIds: [],
};

function rowToDraft(row: UserProfileRow): DraftUserProfile {
  return {
    userId: row.userId,
    displayName: row.displayName,
    appId: row.appId,
    roleIds: [...row.roleIds],
  };
}

export function UserProfileEditor() {
  const client = useConfigClient();
  const [profiles, setProfiles] = useState<UserProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [apps, setApps] = useState<AppRegistryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftUserProfile>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const [u, r, a] = await Promise.all([
      client.userProfiles.list(),
      client.roles.list(),
      client.apps.list(),
    ]);
    setProfiles(u);
    setRoles(r);
    setApps(a);
  }

  const roleById = useMemo(() => {
    const m = new Map<string, RoleRow>();
    for (const r of roles) m.set(r.roleId, r);
    return m;
  }, [roles]);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: UserProfileRow) {
    setMode('edit');
    setEditingId(row.userId);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  function toggleRole(roleId: string) {
    setDraft((d) => {
      const set = new Set(d.roleIds);
      if (set.has(roleId)) set.delete(roleId);
      else set.add(roleId);
      return { ...d, roleIds: Array.from(set) };
    });
  }

  const trimmedUserId = draft.userId.trim();
  const trimmedDisplayName = draft.displayName.trim();
  const trimmedAppId = draft.appId.trim();
  const canSave =
    trimmedUserId.length > 0 &&
    trimmedDisplayName.length > 0 &&
    trimmedAppId.length > 0 &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next: UserProfileRow = {
        userId: trimmedUserId,
        displayName: trimmedDisplayName,
        appId: trimmedAppId,
        roleIds: draft.roleIds,
      };
      if (mode === 'create') {
        await client.userProfiles.create(next);
      } else if (editingId) {
        await client.userProfiles.update(editingId, next);
      }
      await refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell
      title="User profiles"
      itemLabel="user profile"
      onCreate={startCreate}
      list={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  No user profiles defined.
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((row) => (
                <TableRow
                  key={row.userId}
                  data-testid={`user-profile-row-${row.userId}`}
                >
                  <TableCell className="font-mono">{row.userId}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.appId}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.roleIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      ) : (
                        row.roleIds.map((id) => (
                          <Badge key={id} variant="secondary">
                            {roleById.get(id)?.displayName ?? id}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => startEdit(row)}
                      data-testid={`user-profile-edit-${row.userId}`}
                    >
                      Edit
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      }
      drawer={{
        open,
        mode,
        onOpenChange: setOpen,
        canSave,
        saving,
        error,
        onSave: handleSave,
        body: (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-id">User ID</Label>
              <Input
                id="user-id"
                value={draft.userId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, userId: e.target.value }))
                }
                disabled={mode === 'edit'}
                placeholder="e.g. user_42"
                data-testid="user-profile-field-id"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-display-name">Display name</Label>
              <Input
                id="user-display-name"
                value={draft.displayName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, displayName: e.target.value }))
                }
                placeholder="Full name"
                data-testid="user-profile-field-display-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-app-id">App</Label>
              {apps.length > 0 ? (
                <Select
                  value={draft.appId || undefined}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, appId: v }))
                  }
                >
                  <SelectTrigger
                    id="user-app-id"
                    data-testid="user-profile-field-app-id"
                  >
                    <SelectValue placeholder="Choose an app" />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map((a) => (
                      <SelectItem key={a.appId} value={a.appId}>
                        {a.displayName} ({a.appId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="user-app-id"
                  value={draft.appId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, appId: e.target.value }))
                  }
                  placeholder="App ID"
                  data-testid="user-profile-field-app-id"
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
                {draft.roleIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No roles selected.
                  </span>
                ) : (
                  draft.roleIds.map((id) => (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => toggleRole(id)}
                      data-testid={`user-profile-chip-${id}`}
                    >
                      {roleById.get(id)?.displayName ?? id} ×
                    </Badge>
                  ))
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="self-start rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                    data-testid="user-profile-field-roles-trigger"
                  >
                    Manage roles
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  {roles.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      No roles available.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {roles.map((r) => {
                        const checked = draft.roleIds.includes(r.roleId);
                        return (
                          <label
                            key={r.roleId}
                            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleRole(r.roleId)}
                              data-testid={`user-profile-role-toggle-${r.roleId}`}
                            />
                            <span className="font-medium">
                              {r.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.roleId}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </>
        ),
      }}
    />
  );
}
