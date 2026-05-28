/**
 * Deployment identity resolved once at app bootstrap — before
 * `ensurePlatformReady` / `ensureDataServicesHub`.
 *
 * Source: OpenFin manifest `customSettings` or web `/app-config.json`.
 */
export interface PlatformBootstrapConfig {
  /** Drives SharedWorker name `mkt-data-services:${appId}` — fixed per deployment. */
  appId: string;
  /** Session user — AppData ownership, profile scope, private provider rows. */
  userId: string;
  /** REST mode gate. When true, `configServiceRestUrl` should be set. */
  useRest?: boolean;
  /** Remote config service base URL (REST mode). */
  configServiceRestUrl?: string;
  /** Optional seed JSON for empty Dexie (dev/demo). */
  seedConfigUrl?: string;
}

export interface PlatformBootstrapValidationResult {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

/** Shared dev/test bootstrap — replaces scattered `TestApp` / `dev1` literals. */
export const DEV_PLATFORM_BOOTSTRAP: PlatformBootstrapConfig = {
  appId: 'TestApp',
  userId: 'dev1',
  useRest: false,
};

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate bootstrap config before hub / ConfigManager init.
 * Does not mutate the input.
 */
export function validatePlatformBootstrapConfig(
  config: PlatformBootstrapConfig,
): PlatformBootstrapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isNonEmpty(config.appId)) {
    errors.push('appId is required and must be non-empty');
  }

  if (!isNonEmpty(config.userId)) {
    errors.push('userId is required and must be non-empty');
  }

  if (config.useRest === true && !isNonEmpty(config.configServiceRestUrl)) {
    warnings.push('useRest is true but configServiceRestUrl is missing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
