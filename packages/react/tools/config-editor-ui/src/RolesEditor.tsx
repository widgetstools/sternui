import { useEffect, useState } from 'react';
import { Input, Label, Textarea } from '@starui/ui';
import type { PermissionRow, RoleRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';
import { EditorDataTable, type EditorTableColumn } from './EditorDataTable';
import { OptimisticLockDialog } from './OptimisticLockDialog';
import {
  formatErrors,
  hasBlockingError,
  validateRole,
  type ValidationError,
} from './validation';
import {
  guardOptimisticUpdate,
  isOptimisticLockError,
} from './useOptimisticUpdate';

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
  const [expectedUpdatedTime, setExpectedUpdatedTime] = useState<
    string | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

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
    setExpectedUpdatedTime(undefined);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: RoleRow) {
    setMode('edit');
    setEditingId(row.roleId);
    setExpectedUpdatedTime(row.updatedTime);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  function buildNextRow(): RoleRow {
    return {
      roleId: draft.roleId.trim(),
      displayName: draft.displayName.trim(),
      permissionIds: parsePermissionIds(draft.permissionIdsText),
    };
  }

  function liveErrors(): ValidationError[] {
    return validateRole(buildNextRow(), roles, mode);
  }

  const errors = liveErrors();
  const canSave = !hasBlockingError(errors) && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next = buildNextRow();
      if (mode === 'create') {
        await client.roles.create(next);
      } else if (editingId) {
        await guardOptimisticUpdate<RoleRow>({
          expectedUpdatedTime,
          fetchCurrent: () => client.roles.get(editingId),
        });
        await client.roles.update(editingId, next);
      }
      await refresh();
      setOpen(false);
    } catch (err) {
      if (isOptimisticLockError(err)) {
        setLockDialogOpen(true);
      } else {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    setLockDialogOpen(false);
    if (!editingId) return;
    const fresh = await client.roles.get(editingId);
    if (fresh) {
      setDraft(rowToDraft(fresh));
      setExpectedUpdatedTime(fresh.updatedTime);
    }
    await refresh();
  }

  function handleDiscard() {
    setLockDialogOpen(false);
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setExpectedUpdatedTime(undefined);
  }

  const knownPermissionIds = new Set(permissions.map((p) => p.permissionId));

  const columns: EditorTableColumn<RoleRow>[] = [
    {
      key: 'roleId',
      header: 'Role ID',
      cell: (r) => <span className="font-mono">{r.roleId}</span>,
      sortValue: (r) => r.roleId,
      width: '14rem',
    },
    {
      key: 'displayName',
      header: 'Display name',
      sortValue: (r) => r.displayName,
    },
    {
      key: 'permissionCount',
      header: 'Permissions',
      cell: (r) => (
        <span className="text-muted-foreground">{r.permissionIds.length}</span>
      ),
      sortValue: (r) => r.permissionIds.length,
      align: 'right',
      width: '8rem',
    },
  ];

  const blockingErrors = errors.filter(
    (e) => (e.severity ?? 'error') === 'error',
  );
  const drawerError =
    error ?? (blockingErrors.length > 0 ? formatErrors(blockingErrors) : null);

  return (
    <>
      <EditorShell
        title="Roles"
        itemLabel="role"
        onCreate={startCreate}
        list={
          <EditorDataTable
            rows={roles}
            columns={columns}
            rowKey={(r) => r.roleId}
            onEditRow={startEdit}
            emptyMessage="No roles defined."
            testIdPrefix="role"
          />
        }
        drawer={{
          open,
          mode,
          onOpenChange: setOpen,
          canSave,
          saving,
          error: drawerError,
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
      <OptimisticLockDialog
        open={lockDialogOpen}
        onOpenChange={setLockDialogOpen}
        onReload={handleReload}
        onDiscard={handleDiscard}
      />
    </>
  );
}
