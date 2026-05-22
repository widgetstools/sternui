/**
 * Single source of truth for URLs baked into OpenFin manifests.
 *
 * When forking this app:
 * 1. Change DEV_PORT (and grep the repo for `5180`).
 * 2. Align APP_ID / SEED_APP_ID with `public/seed-config.json`.
 * 3. Align PLATFORM_UUID / SECURITY_REALM with `public/platform/manifest.fin.json`.
 */

/** Vite dev server port — must match `vite.config.ts` and every manifest URL. */
export const DEV_PORT = 5180;

/** Dev origin served by Vite (OpenFin loads views from here). */
export const DEV_ORIGIN = `http://localhost:${DEV_PORT}`;

/** ConfigManager scope — must match `appRegistry[].appId` in seed-config.json. */
export const SEED_APP_ID = 'ScaffoldApp';

/**
 * Runtime application name passed to data-services bootstrap.
 * Distinct from SEED_APP_ID: this is the technical app name in Dexie / worker hub.
 */
export const APP_ID = 'openfin-scaffold-demo';

/** OpenFin platform UUID in manifest.fin.json */
export const PLATFORM_UUID = 'starui-openfin-scaffold';

/** Matches `runtime.arguments` security realm in the manifest. */
export const SECURITY_REALM = 'starui-openfin-scaffold';

export const MANIFEST_URL = `${DEV_ORIGIN}/platform/manifest.fin.json`;
export const PROVIDER_URL = `${DEV_ORIGIN}/platform/provider`;
export const SEED_CONFIG_URL = `${DEV_ORIGIN}/seed-config.json`;
export const DOCK_ICON_URL = `${DEV_ORIGIN}/dock-icon.svg`;
