import { useEffect, useMemo, useState } from 'react';
import { Button } from '@starui/ui';
import { PermissionMatrix, useConfigClient } from '@starui/config-editor-ui';
import type { PermissionRow, RoleRow } from '@starui/config-service';

/**
 * Persistence wrapper around the controlled `<PermissionMatrix>`.
 *
 * The matrix itself is controlled and emits the next `roles` array
 * on every cell click — it does not call the client. This wrapper
 * loads roles + permissions, holds the working copy in local state,
 * and persists with one `client.roles.update` call per dirty row on
 * "Save changes". Decision 12.5 (optimistic locking) is enforced
 * by the underlying client which rejects with `OptimisticLockError`
 * if a row moved on between load and save.
 */

function diffByRoleId(original: RoleRow[], next: RoleRow[]): RoleRow[] {
  const orig = new Map(original.map((r) => [r.roleId, r]));
  return next.filter((row) => {
    const before = orig.get(row.roleId);
    if (!before) return true;
    if (before.permissionIds.length !== row.permissionIds.length) return true;
    return before.permissionIds.some((id, i) => id !== row.permissionIds[i]);
  });
}

export function PermissionMatrixView() {
  const client = useConfigClient();
  const [original, setOriginal] = useState<RoleRow[]>([]);
  const [working, setWorking] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([client.roles.list(), client.permissions.list()])
      .then(([r, p]) => {
        if (cancelled) return;
        setOriginal(r);
        setWorking(r);
        setPermissions(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load matrix');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const dirty = useMemo(() => diffByRoleId(original, working), [original, working]);

  async function handleSave() {
    if (dirty.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const row of dirty) {
        await client.roles.update(row.roleId, {
          permissionIds: row.permissionIds,
        });
      }
      const fresh = await client.roles.list();
      setOriginal(fresh);
      setWorking(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    setWorking(original);
    setError(null);
  }

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading permission matrix…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Permission matrix</h2>
          <p className="text-xs text-muted-foreground">
            Toggle a cell to grant or revoke a permission. Changes are
            staged locally and saved together.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-muted-foreground"
            data-testid="permission-matrix-dirty-count"
          >
            {dirty.length} change{dirty.length === 1 ? '' : 's'}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={dirty.length === 0 || saving}
            onClick={handleRevert}
            data-testid="permission-matrix-revert"
          >
            Revert
          </Button>
          <Button
            size="sm"
            disabled={dirty.length === 0 || saving}
            onClick={handleSave}
            data-testid="permission-matrix-save"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <PermissionMatrix
        roles={working}
        permissions={permissions}
        onChange={setWorking}
      />
    </div>
  );
}
