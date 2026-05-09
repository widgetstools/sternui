import { useEffect, useState } from 'react';
import {
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@starui/ui';
import type { PermissionRow, RoleRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';

interface DraftRole {
  roleId: string;
  displayName: string;
  /** Comma- or newline-separated list of permission ids. */
  permissionIdsText: string;
}

const EMPTY_DRAFT: DraftRole = {
  roleId: '',
  displayName: '',
  permissionIdsText: '',
};

function rowToDraft(row: RoleRow): DraftRole {
  return {
    roleId: row.roleId,
    displayName: row.displayName,
    permissionIdsText: row.permissionIds.join(', '),
  };
}

function parsePermissionIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function RolesEditor() {
  const client = useConfigClient();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftRole>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const [r, p] = await Promise.all([
      client.roles.list(),
      client.permissions.list(),
    ]);
    setRoles(r);
    setPermissions(p);
  }

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: RoleRow) {
    setMode('edit');
    setEditingId(row.roleId);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  const trimmedRoleId = draft.roleId.trim();
  const trimmedDisplayName = draft.displayName.trim();
  const canSave =
    trimmedRoleId.length > 0 && trimmedDisplayName.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next: RoleRow = {
        roleId: trimmedRoleId,
        displayName: trimmedDisplayName,
        permissionIds: parsePermissionIds(draft.permissionIdsText),
      };
      if (mode === 'create') {
        await client.roles.create(next);
      } else if (editingId) {
        await client.roles.update(editingId, next);
      }
      await refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const knownPermissionIds = new Set(permissions.map((p) => p.permissionId));

  return (
    <EditorShell
      title="Roles"
      itemLabel="role"
      onCreate={startCreate}
      list={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role ID</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No roles defined.
                </TableCell>
              </TableRow>
            ) : (
              roles.map((row) => (
                <TableRow key={row.roleId} data-testid={`role-row-${row.roleId}`}>
                  <TableCell className="font-mono">{row.roleId}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.permissionIds.length}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => startEdit(row)}
                      data-testid={`role-edit-${row.roleId}`}
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
              <Label htmlFor="role-id">Role ID</Label>
              <Input
                id="role-id"
                value={draft.roleId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, roleId: e.target.value }))
                }
                disabled={mode === 'edit'}
                placeholder="e.g. admin"
                data-testid="role-field-id"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-display-name">Display name</Label>
              <Input
                id="role-display-name"
                value={draft.displayName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, displayName: e.target.value }))
                }
                placeholder="e.g. Administrator"
                data-testid="role-field-display-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-permissions">Permission IDs</Label>
              <Textarea
                id="role-permissions"
                value={draft.permissionIdsText}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, permissionIdsText: e.target.value }))
                }
                rows={4}
                placeholder="config:read, config:write"
                data-testid="role-field-permissions"
              />
              <p className="text-xs text-muted-foreground">
                Comma- or newline-separated.{' '}
                {permissions.length > 0
                  ? `Known IDs: ${permissions
                      .slice(0, 6)
                      .map((p) => p.permissionId)
                      .join(', ')}${permissions.length > 6 ? '…' : ''}`
                  : 'No permissions defined yet.'}
              </p>
              {parsePermissionIds(draft.permissionIdsText).some(
                (id) => !knownPermissionIds.has(id),
              ) ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Some IDs are not in the permissions table — they will be
                  saved as-is.
                </p>
              ) : null}
            </div>
          </>
        ),
      }}
    />
  );
}
