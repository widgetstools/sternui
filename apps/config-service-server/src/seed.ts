import fs from 'fs';
import path from 'path';
import { AuthService } from './services/AuthService.js';
import { AuthValidationUtils } from './utils/authValidation.js';
import logger from './utils/logger.js';

/**
 * Seed the 4 auth tables from a JSON file if `appRegistry` is empty.
 *
 * The JSON file must match the client-side `SeedData` shape:
 *   { appRegistry, userProfiles, roles, permissions }
 *
 * Path resolution:
 *   1. `seedPathOverride` argument (for tests)
 *   2. `SEED_CONFIG_PATH` env var
 *   3. `./data/seed-config.json` (default relative to cwd)
 *
 * @returns `true` if seeding was performed, `false` if skipped (already seeded
 *          or file not found).
 */
export async function seedAuthIfEmpty(
  authService: AuthService,
  seedPathOverride?: string,
): Promise<boolean> {
  const seedPath =
    seedPathOverride ?? process.env.SEED_CONFIG_PATH ?? './data/seed-config.json';
  const absolutePath = path.isAbsolute(seedPath) ? seedPath : path.resolve(seedPath);

  if (!fs.existsSync(absolutePath)) {
    logger.warn(
      `Auth seed file not found at ${absolutePath}. Auth tables will start empty. ` +
        `Set SEED_CONFIG_PATH or place a file at ./data/seed-config.json.`,
    );
    return false;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    logger.error(`Failed to read auth seed file ${absolutePath}`, { error: err });
    return false;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error(`Auth seed file ${absolutePath} is not valid JSON`, { error: err });
    return false;
  }

  const { error, value } = AuthValidationUtils.validateSeedData(parsed);
  if (error) {
    logger.error(`Auth seed file ${absolutePath} failed validation: ${error}`);
    return false;
  }

  const didSeed = await authService.seedIfEmpty(value);
  if (didSeed) {
    logger.info(`Auth tables seeded from ${absolutePath}`, {
      permissions: value.permissions?.length ?? 0,
      roles: value.roles?.length ?? 0,
      appRegistry: value.appRegistry?.length ?? 0,
      userProfiles: value.userProfiles?.length ?? 0,
    });
  }
  return didSeed;
}
