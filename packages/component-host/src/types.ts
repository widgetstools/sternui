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
