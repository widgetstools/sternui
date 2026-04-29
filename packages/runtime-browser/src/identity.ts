import type { IdentitySnapshot } from '@marketsui/runtime-port';

/**
 * Identity-resolution helpers for the browser runtime. URL params are the
 * primary source; mount-prop overrides fill in the gaps; remaining fields
 * fall back to a stable per-tab `instanceId` minted from `crypto.randomUUID()`.
 */

const ROLE_DELIM = ',';
const PERMISSION_DELIM = ',';

export interface IdentityOverrides {
  readonly instanceId?: string;
  readonly appId?: string;
  readonly userId?: string;
  readonly componentType?: string;
  readonly componentSubType?: string;
  readonly isTemplate?: boolean;
  readonly singleton?: boolean;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly customData?: Readonly<Record<string, unknown>>;
}

/** Read a comma-delimited URL param into a string array. */
function readListParam(params: URLSearchParams, name: string): readonly string[] | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  if (raw === '') return [];
  return raw.split(ROLE_DELIM).map((s) => s.trim()).filter(Boolean);
}

/** Read a customData payload from the `data` URL param (base64-encoded JSON). */
function readCustomDataParam(params: URLSearchParams): Readonly<Record<string, unknown>> | undefined {
  const raw = params.get('data');
  if (raw === null) return undefined;
  try {
    const decoded = atob(raw);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    // Malformed payload: fall through and return undefined so callers
    // can decide whether to surface an error. Identity resolution itself
    // shouldn't fail just because customData was unparseable.
  }
  return undefined;
}

/**
 * Resolve identity from the current URL plus optional mount-prop overrides.
 *
 * Resolution priority per field (highest first):
 *   1. URL search params
 *   2. `overrides`
 *   3. Auto-default (UUID for `instanceId`; empty string / empty array for the rest)
 *
 * `customData` merges URL `?data=...` over `overrides.customData` so caller
 * defaults can be bumped by query string at runtime.
 */
export function resolveBrowserIdentity(
  search: string | URLSearchParams,
  overrides: IdentityOverrides = {},
  randomUUID: () => string = () => crypto.randomUUID(),
): IdentitySnapshot {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;

  const customDataFromUrl = readCustomDataParam(params);
  const customData: Readonly<Record<string, unknown>> = {
    ...(overrides.customData ?? {}),
    ...(customDataFromUrl ?? {}),
  };

  return {
    instanceId:
      params.get('instanceId') ?? overrides.instanceId ?? `browser-${randomUUID()}`,
    appId: params.get('appId') ?? overrides.appId ?? '',
    userId: params.get('userId') ?? overrides.userId ?? '',
    componentType: params.get('componentType') ?? overrides.componentType ?? '',
    componentSubType: params.get('componentSubType') ?? overrides.componentSubType ?? '',
    isTemplate: params.get('isTemplate') === 'true' || overrides.isTemplate === true,
    singleton: params.get('singleton') === 'true' || overrides.singleton === true,
    roles: readListParam(params, 'roles') ?? overrides.roles ?? [],
    permissions: readListParam(params, 'permissions') ?? overrides.permissions ?? [],
    customData,
  };
}

void PERMISSION_DELIM;
