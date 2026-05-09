import { useEffect, useMemo, useState } from 'react';
import { Button } from '@starui/ui';
import {
  RoleAssignmentMatrix,
  useConfigClient,
} from '@starui/config-editor-ui';
import type { RoleRow, UserProfileRow } from '@starui/config-service';

/**
 * Persistence wrapper around the controlled `<RoleAssignmentMatrix>`.
 *
 * Mirrors `PermissionMatrixView`'s structure: load original rows,
 * keep a working copy, persist only the diff via per-row updates so
 * the optimistic-locking guard kicks in per row.
 */

function diffByUserId(
  original: UserProfileRow[],
  next: UserProfileRow[],
): UserProfileRow[] {
  const orig = new Map(original.map((u) => [u.userId, u]));
  return next.filter((row) => {
    const before = orig.get(row.userId);
    if (!before) return true;
    if (before.roleIds.length !== row.roleIds.length) return true;
    return before.roleIds.some((id, i) => id !== row.roleIds[i]);
  });
}

export function RoleAssignmentMatrixView() {
  const client = useConfigClient();
  const [original, setOriginal] = useState<UserProfileRow[]>([]);
  const [working, setWorking] = useState<UserProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([client.userProfiles.list(), client.roles.list()])
      .then(([u, r]) => {
        if (cancelled) return;
        setOriginal(u);
        setWorking(u);
        setRoles(r);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load assignments',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const dirty = useMemo(() => diffByUserId(original, working), [original, working]);

  async function handleSave() {
    if (dirty.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const row of dirty) {
        await client.userProfiles.update(row.userId, {
          roleIds: row.roleIds,
        });
      }
      const fresh = await client.userProfiles.list();
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
        Loading role assignments…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Role assignment</h2>
          <p className="text-xs text-muted-foreground">
            Add or remove roles per user (or by role). Changes are
            staged locally and saved together.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-muted-foreground"
            data-testid="role-assignment-dirty-count"
          >
            {dirty.length} change{dirty.length === 1 ? '' : 's'}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={dirty.length === 0 || saving}
            onClick={handleRevert}
            data-testid="role-assignment-revert"
          >
            Revert
          </Button>
          <Button
            size="sm"
            disabled={dirty.length === 0 || saving}
            onClick={handleSave}
            data-testid="role-assignment-save"
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
      <RoleAssignmentMatrix
        users={working}
        roles={roles}
        onChange={setWorking}
      />
    </div>
  );
}
