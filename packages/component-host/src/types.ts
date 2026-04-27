/**
 * Shared types for the component-host package.
 *
 * These are framework-agnostic — used by both the React hook
 * and the Angular service, as well as the pure-TS core.
 */

import type { AppConfigRow } from "@marketsui/config-service";

// Re-export for convenience so adapters don't need a direct config-service import
export type { AppConfigRow };

/** Options passed to the component host on initialization. */
export interface ComponentHostOptions {
  /** Override the default debounce interval (ms) for saveConfig. Default: 300. */
  debounceMs?: number;
  /** Fallback theme when not running inside OpenFin. Default: 'dark'. */
  defaultTheme?: "dark" | "light";
}

/**
 * Identity data extracted from OpenFin customData.
 *
 * When a registered component is launched via the Registry Editor or
 * workspace restore, OpenFin delivers this as `fin.me.customData`.
 */
export interface ComponentIdentity {
  instanceId: string;
  templateId: string;
  componentType: string;
  componentSubType: string;
  /**
   * Mirrors `RegistryEntry.singleton`. Component-host writes this
   * onto the persisted AppConfigRow so the row carries enough info
   * to decide clone-vs-reuse on the next launch without round-
   * tripping the registry. Also drives the workspace GC's
   * "never delete" guard for the template row.
   *
   * Optional so launches that don't supply it (legacy customData,
   * dev-mode fallback) default to non-singleton.
   */
  singleton?: boolean;
  /**
   * Test-launch marker. When `true`, the registry editor spawned
   * this view to author the **template / initial-settings** config
   * row directly. The component-host saver sets `isTemplate: true`
   * on the resulting AppConfigRow and uses
   * `${componentType}-${componentSubType}` (lowercase) as its
   * configId — which is what the launcher already wrote into
   * `instanceId` for the test-launch path.
   *
   * Non-test launches (dock menu) leave this `undefined`/`false`,
   * and the saver writes a per-instance row with a UUID configId
   * and `isTemplate: false`.
   */
  isTemplate?: boolean;
}

/**
 * The resolved state after identity + config are loaded.
 * Generic `T` is the shape of the config object (e.g., BlotterConfig).
 */
export interface ComponentHostState<T = unknown> {
  instanceId: string;
  config: T | null;
  theme: "dark" | "light";
  isLoading: boolean;
  isSaved: boolean;
  error: string | null;
}
