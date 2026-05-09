import { useMemo, useState } from 'react';
import {
  Checkbox,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';
import type { PermissionRow, RoleRow } from '@starui/config-service';

/**
 * Roles × permissions checkbox grid — the centerpiece RBAC surface
 * from design Decision 12.1. Rows are roles, columns are permissions
 * grouped by `category`. Cells toggle membership in
 * `role.permissionIds`.
 *
 * Controlled component: every cell click emits the next `roles`
 * array via `onChange`. The host owns persistence (a "Save changes"
 * button outside this matrix), which keeps the Session 14
 * optimistic-locking flow simple — one saveConfig call per row, not
 * one per toggle.
 */

export interface PermissionMatrixProps {
  roles: RoleRow[];
  permissions: PermissionRow[];
  onChange: (next: RoleRow[]) => void;
}

const UNCATEGORISED = '(uncategorised)';

interface CategoryGroup {
  category: string;
  permissions: PermissionRow[];
}

function groupByCategory(permissions: PermissionRow[]): CategoryGroup[] {
  const map = new Map<string, PermissionRow[]>();
  for (const p of permissions) {
    const key = p.category?.trim() || UNCATEGORISED;
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, perms]) => ({
      category,
      permissions: [...perms].sort((a, b) =>
        a.permissionId.localeCompare(b.permissionId),
      ),
    }));
}

function togglePermission(role: RoleRow, permissionId: string): RoleRow {
  const has = role.permissionIds.includes(permissionId);
  return {
    ...role,
    permissionIds: has
      ? role.permissionIds.filter((id) => id !== permissionId)
      : [...role.permissionIds, permissionId],
  };
}

export function PermissionMatrix({
  roles,
  permissions,
  onChange,
}: PermissionMatrixProps) {
  const [filter, setFilter] = useState('');

  const visiblePermissions = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return permissions;
    return permissions.filter(
      (p) =>
        p.permissionId.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.category.toLowerCase().includes(needle),
    );
  }, [permissions, filter]);

  const groups = useMemo(
    () => groupByCategory(visiblePermissions),
    [visiblePermissions],
  );

  const flatPermissions = useMemo(
    () => groups.flatMap((g) => g.permissions),
    [groups],
  );

  function handleToggle(roleId: string, permissionId: string) {
    onChange(
      roles.map((role) =>
        role.roleId === roleId ? togglePermission(role, permissionId) : role,
      ),
    );
  }

  return (
    <div
      className="flex flex-col gap-3 bg-background text-foreground"
      data-testid="permission-matrix"
    >
      <div className="flex items-center justify-between gap-3">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter permissions by id, description or category…"
          className="max-w-sm"
          data-testid="permission-matrix-filter"
        />
        <p className="text-xs text-muted-foreground">
          {flatPermissions.length} of {permissions.length} permissions ·{' '}
          {roles.length} roles
        </p>
      </div>
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                rowSpan={2}
                className="sticky left-0 bg-background align-bottom min-w-[12rem]"
              >
                Role
              </TableHead>
              {groups.map((g) => (
                <TableHead
                  key={`cat-${g.category}`}
                  colSpan={g.permissions.length}
                  className="text-center border-l border-border"
                  data-testid={`permission-matrix-category-${g.category}`}
                >
                  {g.category}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {groups.flatMap((g) =>
                g.permissions.map((p, i) => (
                  <TableHead
                    key={p.permissionId}
                    title={p.description}
                    className={
                      i === 0
                        ? 'border-l border-border whitespace-nowrap'
                        : 'whitespace-nowrap'
                    }
                    data-testid={`permission-matrix-col-${p.permissionId}`}
                  >
                    <span className="font-mono text-xs">{p.permissionId}</span>
                  </TableHead>
                )),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(1, flatPermissions.length + 1)}
                  className="text-center text-muted-foreground"
                >
                  No roles defined.
                </TableCell>
              </TableRow>
            ) : flatPermissions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="text-center text-muted-foreground"
                >
                  No permissions match the filter.
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => {
                const granted = new Set(role.permissionIds);
                return (
                  <TableRow
                    key={role.roleId}
                    data-testid={`permission-matrix-row-${role.roleId}`}
                  >
                    <TableCell className="sticky left-0 bg-background font-medium">
                      <div className="flex flex-col">
                        <span>{role.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {role.roleId}
                        </span>
                      </div>
                    </TableCell>
                    {groups.flatMap((g) =>
                      g.permissions.map((p, i) => {
                        const checked = granted.has(p.permissionId);
                        return (
                          <TableCell
                            key={`${role.roleId}-${p.permissionId}`}
                            className={
                              i === 0
                                ? 'text-center border-l border-border'
                                : 'text-center'
                            }
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                handleToggle(role.roleId, p.permissionId)
                              }
                              aria-label={`${role.displayName} can ${p.permissionId}`}
                              data-testid={`permission-matrix-cell-${role.roleId}-${p.permissionId}`}
                            />
                          </TableCell>
                        );
                      }),
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
