import type { UserProfileRow } from '@starui/config-service';

import type { ValidationError } from './types';

/**
 * Validate a draft `UserProfileRow` against the rest of the table.
 *
 * Decision 12.4 rules covered here:
 * - empty `userId` / `displayName` / `appId` → block save.
 * - duplicate `userId` against another row → block save.
 *
 * Stranded `roleIds` (a role that no longer exists) are surfaced as a
 * warning so the operator can fix it, but do not block the save —
 * roles can be added or renamed independently of profiles.
 */
export function validateUserProfile(
  draft: UserProfileRow,
  existingProfiles: readonly UserProfileRow[],
  knownRoleIds: readonly string[],
  mode: 'create' | 'edit',
): ValidationError[] {
  const errors: ValidationError[] = [];

  const trimmedId = draft.userId.trim();
  const trimmedDisplayName = draft.displayName.trim();
  const trimmedAppId = draft.appId.trim();

  if (trimmedId.length === 0) {
    errors.push({
      code: 'userProfile.id.required',
      message: 'User ID is required.',
      field: 'userId',
    });
  }
  if (trimmedDisplayName.length === 0) {
    errors.push({
      code: 'userProfile.displayName.required',
      message: 'Display name is required.',
      field: 'displayName',
    });
  }
  if (trimmedAppId.length === 0) {
    errors.push({
      code: 'userProfile.appId.required',
      message: 'App is required.',
      field: 'appId',
    });
  }
  if (
    mode === 'create' &&
    trimmedId.length > 0 &&
    existingProfiles.some((p) => p.userId === trimmedId)
  ) {
    errors.push({
      code: 'userProfile.id.duplicate',
      message: `A user profile with id "${trimmedId}" already exists.`,
      field: 'userId',
    });
  }

  const known = new Set(knownRoleIds);
  const stranded = draft.roleIds.filter((id) => !known.has(id));
  if (stranded.length > 0) {
    errors.push({
      code: 'userProfile.roleIds.stranded',
      message: `Role(s) not found in the roles table: ${stranded.join(', ')}.`,
      field: 'roleIds',
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Validate a `UserProfileRow` deletion. Decision 12.4 — deleting a
 * profile that is referenced by another row's `createdBy` strands the
 * audit pointer, but the design accepts this as a warning so we don't
 * tangle deletion with audit history.
 */
export function validateUserProfileDelete(
  row: UserProfileRow,
  /** Concatenated `createdBy` values across every audit-bearing table. */
  createdByPointers: readonly string[],
): ValidationError[] {
  if (!createdByPointers.includes(row.userId)) return [];
  return [
    {
      code: 'userProfile.delete.strandsCreatedBy',
      message: `Deleting "${row.userId}" will strand audit references on existing rows.`,
      severity: 'warning',
    },
  ];
}
