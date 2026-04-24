/**
 * Registry Editor configuration types (v2).
 *
 * The Registry Editor allows users to register reusable components
 * (React or Angular) and manage their template configurations.
 *
 * v2 additions (over v1):
 *   - `type`           — component hosting model ('internal' | 'external')
 *   - `usesHostConfig` — whether the component consumes the dock app's
 *                        ConfigService (true) or carries its own (false)
 *   - `appId`          — targets the dock app by default; editable when
 *                        usesHostConfig === false
 *   - `configServiceUrl` — same behavior as appId
 *   - `singleton`      — true = focus-existing on launch; false = spawn-new
 *
 * Persisted v1 data is upgraded by `migrateRegistryV1ToV2()` in
 * `./registry-migrate.ts` on read — no consumer sees a v1 entry.
 */

/** A single registered component entry. */
export interface RegistryEntry {
  // ── v1 fields (preserved, unchanged) ────────────────────────────
  /** Unique identifier (UUID). */
  id: string;
  /** Route or URL where the component is hosted. */
  hostUrl: string;
  /** Icon identifier (e.g., "mkt:bond", "lucide:home"). */
  iconId: string;
  /** Component classification (e.g., "GRID", "CHART", "HEATMAP"). */
  componentType: string;
  /** Component sub-classification (e.g., "CREDIT", "RATES", "MBS"). */
  componentSubType: string;
  /** Config ID for the persisted config row. For singletons this is
   *  derived from componentType + componentSubType via
   *  `deriveSingletonConfigId()`. For non-singletons it defaults to
   *  `generateTemplateConfigId()` output but the user can override. */
  configId: string;
  /** Human-readable display name. */
  displayName: string;
  /** ISO 8601 timestamp of when this entry was created. */
  createdAt: string;

  // ── v2 additions ────────────────────────────────────────────────
  /** Hosting model:
   *   'internal' — component route lives inside the host app
   *   'external' — component is served from a foreign URL
   *  Independent of `usesHostConfig` — the four combinations all exist. */
  type: 'internal' | 'external';

  /** Whether the component consumes the dock app's ConfigService.
   *   true  = host app injects appId + configServiceUrl at launch;
   *           editor locks these fields to the host values
   *   false = entry carries its own appId + configServiceUrl
   *           (may be foreign, or may be empty if component is
   *           fully self-contained with no config needs) */
  usesHostConfig: boolean;

  /** AppId this entry targets. Equals the host app's appId when
   *  usesHostConfig === true. Required non-empty when false. */
  appId: string;

  /** ConfigService URL. Equals the host app's URL when
   *  usesHostConfig === true. May be empty when false AND the
   *  external component is fully self-contained. */
  configServiceUrl: string;

  /** Instance lifecycle:
   *   true  = first click creates the window; subsequent clicks
   *           focus the existing instance (never more than one)
   *   false = every click spawns a new instance */
  singleton: boolean;
}

/** The full registry editor configuration, persisted as an APP_CONFIG row. */
export interface RegistryEditorConfig {
  /** Config format version. v2 is current; v1 is upgraded on read. */
  version: number;
  /** All registered component entries. */
  entries: RegistryEntry[];
}

/** Current schema version that `RegistryEditorConfig` is written at. */
export const REGISTRY_CONFIG_VERSION = 2;

/**
 * Generate the config ID for a non-singleton template component.
 * Format: `templateComponent<ComponentType><ComponentSubType>`
 * e.g., `templateComponentGRIDCREDIT`
 */
export function generateTemplateConfigId(componentType: string, componentSubType: string): string {
  return `templateComponent${componentType}${componentSubType}`;
}

/**
 * Derive the config ID for a singleton component.
 * Format: `<componenttype>-<componentsubtype>` (lowercase, dash-separated).
 * e.g., `grid-credit`.
 *
 * Called at save time by the registry editor when `singleton === true`.
 * Uniqueness of the derived id within a given appId is enforced by
 * `validateSingletonUniqueness()` in `./registry-validate.ts`.
 */
export function deriveSingletonConfigId(componentType: string, componentSubType: string): string {
  return `${componentType}-${componentSubType}`.toLowerCase();
}
