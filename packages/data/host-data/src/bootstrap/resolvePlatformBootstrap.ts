import {
  validatePlatformBootstrapConfig,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';

/** Thrown when bootstrap JSON is missing required fields or fails validation. */
export class PlatformBootstrapConfigError extends Error {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];

  constructor(
    message: string,
    errors: readonly string[] = [],
    warnings: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PlatformBootstrapConfigError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new PlatformBootstrapConfigError(`${field} is required`);
  }
  return parsed;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

/**
 * Parse a plain object (e.g. parsed JSON) into {@link PlatformBootstrapConfig}.
 * Throws {@link PlatformBootstrapConfigError} when required fields are missing.
 */
export function resolvePlatformBootstrapFromObject(
  raw: unknown,
): PlatformBootstrapConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlatformBootstrapConfigError(
      'Platform bootstrap config must be a JSON object',
    );
  }

  const record = raw as Record<string, unknown>;

  const config: PlatformBootstrapConfig = {
    appId: readRequiredString(record.appId, 'appId'),
    userId: readRequiredString(record.userId, 'userId'),
    useRest: readOptionalBoolean(record.useRest),
    configServiceRestUrl: readOptionalString(record.configServiceRestUrl),
    seedConfigUrl: readOptionalString(record.seedConfigUrl),
  };

  const result = validatePlatformBootstrapConfig(config);
  if (!result.valid) {
    throw new PlatformBootstrapConfigError(
      `Invalid platform bootstrap config: ${result.errors.join('; ')}`,
      result.errors,
      result.warnings,
    );
  }

  return config;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Fetch and parse web `app-config.json` (or env-specific path).
 */
export async function resolvePlatformBootstrapFromJson(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<PlatformBootstrapConfig> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new PlatformBootstrapConfigError(
      `Failed to fetch platform bootstrap config from ${url}`,
    );
  }

  if (!response.ok) {
    throw new PlatformBootstrapConfigError(
      `Failed to fetch platform bootstrap config from ${url}: HTTP ${response.status}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new PlatformBootstrapConfigError(
      `Platform bootstrap config at ${url} is not valid JSON`,
    );
  }

  try {
    return resolvePlatformBootstrapFromObject(raw);
  } catch (err) {
    if (err instanceof PlatformBootstrapConfigError) {
      throw err;
    }
    throw new PlatformBootstrapConfigError(
      `Failed to parse platform bootstrap config from ${url}`,
    );
  }
}
