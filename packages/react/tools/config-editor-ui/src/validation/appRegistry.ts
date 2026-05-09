import type { AppRegistryRow } from '@starui/config-service';

import type { ValidationError } from './types';

/**
 * Validate a draft `AppRegistryRow` against the rest of the table.
 *
 * Decision 12.4 rules covered here:
 * - empty `appId` / `displayName` / `manifestUrl` / `environment` → block save.
 * - duplicate `appId` against another row → block save.
 * - `manifestUrl` is malformed → block save.
 */
export function validateAppRegistry(
  draft: AppRegistryRow,
  existingApps: readonly AppRegistryRow[],
  mode: 'create' | 'edit',
): ValidationError[] {
  const errors: ValidationError[] = [];

  const trimmedAppId = draft.appId.trim();
  const trimmedDisplayName = draft.displayName.trim();
  const trimmedManifestUrl = draft.manifestUrl.trim();
  const trimmedEnvironment = draft.environment.trim();

  if (trimmedAppId.length === 0) {
    errors.push({
      code: 'appRegistry.id.required',
      message: 'App ID is required.',
      field: 'appId',
    });
  }
  if (trimmedDisplayName.length === 0) {
    errors.push({
      code: 'appRegistry.displayName.required',
      message: 'Display name is required.',
      field: 'displayName',
    });
  }
  if (trimmedManifestUrl.length === 0) {
    errors.push({
      code: 'appRegistry.manifestUrl.required',
      message: 'Manifest URL is required.',
      field: 'manifestUrl',
    });
  } else if (!isValidHttpUrl(trimmedManifestUrl)) {
    errors.push({
      code: 'appRegistry.manifestUrl.invalid',
      message: 'Manifest URL must be a valid http/https URL.',
      field: 'manifestUrl',
    });
  }
  if (trimmedEnvironment.length === 0) {
    errors.push({
      code: 'appRegistry.environment.required',
      message: 'Environment is required.',
      field: 'environment',
    });
  }
  if (
    mode === 'create' &&
    trimmedAppId.length > 0 &&
    existingApps.some((a) => a.appId === trimmedAppId)
  ) {
    errors.push({
      code: 'appRegistry.id.duplicate',
      message: `An app with id "${trimmedAppId}" already exists.`,
      field: 'appId',
    });
  }

  return errors;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
