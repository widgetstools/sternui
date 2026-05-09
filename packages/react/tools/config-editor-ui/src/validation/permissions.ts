import type { PermissionRow, RoleRow } from '@starui/config-service';

import type { ValidationError } from './types';

/**
 * Validate a draft `PermissionRow` against the rest of the table.
 *
 * Decision 12.4 rules covered here:
 * - empty `permissionId` / `description` / `category` → block save.
 * - duplicate `permissionId` against another row → block save.
 *
 * `existingPermissions` is the full table; `mode` controls whether the
 * duplicate check considers the current row.
 */
export function validatePermission(
  draft: PermissionRow,
  existingPermissions: readonly PermissionRow[],
  mode: 'create' | 'edit',
): ValidationError[] {
  const errors: ValidationError[] = [];

  const trimmedId = draft.permissionId.trim();
  const trimmedDescription = draft.description.trim();
  const trimmedCategory = draft.category.trim();

  if (trimmedId.length === 0) {
    errors.push({
      code: 'permission.id.required',
      message: 'Permission ID is required.',
      field: 'permissionId',
    });
  }
  if (trimmedDescription.length === 0) {
    errors.push({
      code: 'permission.description.required',
      message: 'Description is required.',
      field: 'description',
    });
  }
  if (trimmedCategory.length === 0) {
    errors.push({
      code: 'permission.category.required',
      message: 'Category is required.',
      field: 'category',
    });
  }
  if (
    mode === 'create' &&
    trimmedId.length > 0 &&
    existingPermissions.some((p) => p.permissionId === trimmedId)
  ) {
    errors.push({
      code: 'permission.id.duplicate',
      message: `A permission with id "${trimmedId}" already exists.`,
      field: 'permissionId',
    });
  }

  return errors;
}

/**
 * Validate a `PermissionRow` deletion. Decision 12.4 — block when any
 * role still references the permission. The cross-table check is
 * dispatched here so the editors don't need to know the rule.
 */
export function validatePermissionDelete(
  row: PermissionRow,
  roles: readonly RoleRow[],
): ValidationError[] {
  const referencing = roles.filter((r) =>
    r.permissionIds.includes(row.permissionId),
  );
  if (referencing.length === 0) return [];
  const names = referencing.map((r) => r.displayName || r.roleId).join(', ');
  return [
    {
      code: 'permission.delete.referenced',
      message: `Permission "${row.permissionId}" is still used by role(s): ${names}.`,
    },
  ];
}
