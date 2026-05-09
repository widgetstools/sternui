import { useEffect, useMemo, useState } from 'react';
import {
  Input,
  Label,
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
  Textarea,
} from '@starui/ui';
import type { PermissionRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';

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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftPermission>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setPermissions(await client.permissions.list());
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
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: PermissionRow) {
    setMode('edit');
    setEditingId(row.permissionId);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  const trimmedId = draft.permissionId.trim();
  const trimmedDescription = draft.description.trim();
  const effectiveCategory = (
    draft.useCustomCategory ? draft.customCategory : draft.category
  ).trim();
  const canSave =
    trimmedId.length > 0 &&
    trimmedDescription.length > 0 &&
    effectiveCategory.length > 0 &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next: PermissionRow = {
        permissionId: trimmedId,
        description: trimmedDescription,
        category: effectiveCategory,
      };
      if (mode === 'create') {
        await client.permissions.create(next);
      } else if (editingId) {
        await client.permissions.update(editingId, next);
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
      title="Permissions"
      itemLabel="permission"
      onCreate={startCreate}
      list={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No permissions defined.
                </TableCell>
              </TableRow>
            ) : (
              permissions.map((row) => (
                <TableRow
                  key={row.permissionId}
                  data-testid={`permission-row-${row.permissionId}`}
                >
                  <TableCell className="font-mono">{row.permissionId}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.description}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => startEdit(row)}
                      data-testid={`permission-edit-${row.permissionId}`}
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
  );
}
