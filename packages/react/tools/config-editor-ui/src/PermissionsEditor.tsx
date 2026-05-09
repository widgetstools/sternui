import { useEffect, useMemo, useState } from 'react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@starui/ui';
import type { PermissionRow, RoleRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';
import { EditorDataTable, type EditorTableColumn } from './EditorDataTable';
import { OptimisticLockDialog } from './OptimisticLockDialog';
import {
  formatErrors,
  hasBlockingError,
  validatePermission,
  type ValidationError,
} from './validation';
import {
  guardOptimisticUpdate,
  isOptimisticLockError,
} from './useOptimisticUpdate';

interface DraftPermission {
  permissionId: string;
  description: string;
  category: string;
  /** Free-text override when the user wants a category that isn't in the dropdown. */
  customCategory: string;
  useCustomCategory: boolean;
}

const CUSTOM_SENTINEL = '__custom__';

const EMPTY_DRAFT: DraftPermission = {
  permissionId: '',
  description: '',
  category: '',
  customCategory: '',
  useCustomCategory: false,
};

function rowToDraft(row: PermissionRow): DraftPermission {
  return {
    permissionId: row.permissionId,
    description: row.description,
    category: row.category,
    customCategory: '',
    useCustomCategory: false,
  };
}

export function PermissionsEditor() {
  const client = useConfigClient();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [_roles, setRoles] = useState<RoleRow[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftPermission>(EMPTY_DRAFT);
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
    const [p, r] = await Promise.all([
      client.permissions.list(),
      client.roles.list(),
    ]);
    setPermissions(p);
    setRoles(r);
  }

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const p of permissions) {
      if (p.category) seen.add(p.category);
    }
    return Array.from(seen).sort();
  }, [permissions]);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setExpectedUpdatedTime(undefined);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: PermissionRow) {
    setMode('edit');
    setEditingId(row.permissionId);
    setExpectedUpdatedTime(row.updatedTime);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  function buildNextRow(): PermissionRow {
    const effectiveCategory = (
      draft.useCustomCategory ? draft.customCategory : draft.category
    ).trim();
    return {
      permissionId: draft.permissionId.trim(),
      description: draft.description.trim(),
      category: effectiveCategory,
    };
  }

  function liveErrors(): ValidationError[] {
    return validatePermission(buildNextRow(), permissions, mode);
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
        await client.permissions.create(next);
      } else if (editingId) {
        await guardOptimisticUpdate<PermissionRow>({
          expectedUpdatedTime,
          fetchCurrent: () => client.permissions.get(editingId),
        });
        await client.permissions.update(editingId, next);
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
    const fresh = await client.permissions.get(editingId);
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

  const columns: EditorTableColumn<PermissionRow>[] = [
    {
      key: 'permissionId',
      header: 'Permission ID',
      cell: (r) => <span className="font-mono">{r.permissionId}</span>,
      sortValue: (r) => r.permissionId,
      width: '16rem',
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (r) => r.category,
      width: '12rem',
    },
    {
      key: 'description',
      header: 'Description',
      cell: (r) => <span className="text-muted-foreground">{r.description}</span>,
      sortValue: (r) => r.description,
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
        title="Permissions"
        itemLabel="permission"
        onCreate={startCreate}
        list={
          <EditorDataTable
            rows={permissions}
            columns={columns}
            rowKey={(r) => r.permissionId}
            onEditRow={startEdit}
            emptyMessage="No permissions defined."
            testIdPrefix="permission"
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
                <Label htmlFor="permission-id">Permission ID</Label>
                <Input
                  id="permission-id"
                  value={draft.permissionId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, permissionId: e.target.value }))
                  }
                  disabled={mode === 'edit'}
                  placeholder="e.g. config:write"
                  data-testid="permission-field-id"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="permission-category">Category</Label>
                <Select
                  value={
                    draft.useCustomCategory
                      ? CUSTOM_SENTINEL
                      : draft.category || undefined
                  }
                  onValueChange={(v) => {
                    if (v === CUSTOM_SENTINEL) {
                      setDraft((d) => ({ ...d, useCustomCategory: true }));
                    } else {
                      setDraft((d) => ({
                        ...d,
                        useCustomCategory: false,
                        category: v,
                      }));
                    }
                  }}
                >
                  <SelectTrigger
                    id="permission-category"
                    data-testid="permission-field-category"
                  >
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_SENTINEL}>
                      + New category…
                    </SelectItem>
                  </SelectContent>
                </Select>
                {draft.useCustomCategory ? (
                  <Input
                    value={draft.customCategory}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        customCategory: e.target.value,
                      }))
                    }
                    placeholder="New category name"
                    data-testid="permission-field-custom-category"
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="permission-description">Description</Label>
                <Textarea
                  id="permission-description"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, description: e.target.value }))
                  }
                  rows={3}
                  placeholder="What does this permission allow?"
                  data-testid="permission-field-description"
                />
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
