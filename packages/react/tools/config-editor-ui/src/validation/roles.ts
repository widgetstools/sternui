import type { RoleRow } from '@starui/config-service';

import type { ValidationError } from './types';

/**
 * Validate a draft `RoleRow` against the rest of the table.
 *
 * Decision 12.4 rules covered here:
 * - empty `roleId` / `displayName` → block save.
 * - duplicate `roleId` against another row → block save.
 * - role with zero permissions → block save.
 *
 * `existingRoles` is the full table; pass `mode: 'create' | 'edit'` so
 * the duplicate check ignores the row being edited.
 */
export function validateRole(
  draft: RoleRow,
  existingRoles: readonly RoleRow[],
  mode: 'create' | 'edit',
): ValidationError[] {
  const errors: ValidationError[] = [];

  const trimmedId = draft.roleId.trim();
  const trimmedName = draft.displayName.trim();

  if (trimmedId.length === 0) {
    errors.push({
      code: 'role.id.required',
      message: 'Role ID is required.',
      field: 'roleId',
    });
  }
  if (trimmedName.length === 0) {
    errors.push({
      code: 'role.displayName.required',
      message: 'Display name is required.',
      field: 'displayName',
    });
  }
  if (draft.permissionIds.length === 0) {
    errors.push({
      code: 'role.permissions.empty',
      message: 'A role must have at least one permission.',
      field: 'permissionIds',
    });
  }
  if (
    mode === 'create' &&
    trimmedId.length > 0 &&
    existingRoles.some((r) => r.roleId === trimmedId)
  ) {
    errors.push({
      code: 'role.id.duplicate',
      message: `A role with id "${trimmedId}" already exists.`,
      field: 'roleId',
    });
  }

  return errors;
}

/**
 * Validate a `RoleRow` deletion. No specific cross-table rule today —
 * user-profile rows reference `roleIds`, but stranding those is
 * tolerated (the profile editor will show the missing role plainly).
 * The function exists so the editors have a single place to extend
 * delete-time rules without touching call sites.
 */
export function validateRoleDelete(
  _row: RoleRow,
  _existingRoles: readonly RoleRow[],
): ValidationError[] {
  return [];
}
