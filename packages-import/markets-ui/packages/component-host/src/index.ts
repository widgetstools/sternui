/**
 * @markets/component-host
 *
 * Lightweight component wrapper providing OpenFin platform services
 * to registered components. Framework-agnostic core — use the React
 * hook or Angular service adapters for framework-specific bindings.
 *
 * Core exports:
 *   - readCustomData()        — read OpenFin identity from customData
 *   - resolveInstanceId()     — load or clone config (design doc §6.4)
 *   - buildFallbackIdentity() — dev-mode identity generation
 *   - subscribeToTheme()      — IAB theme change subscription
 *   - getCurrentTheme()       — read current platform theme
 *   - onCloseRequested()      — workspace close event handler
 *   - createDebouncedSaver()  — debounced config persistence
 */

export type {
  ComponentHostOptions,
  ComponentIdentity,
  ComponentHostState,
  AppConfigRow,
} from "./types";

export {
  readCustomData,
  resolveInstanceId,
  buildFallbackIdentity,
} from "./resolve-identity";

export {
  subscribeToTheme,
  getCurrentTheme,
} from "./theme-listener";

export { onCloseRequested } from "./lifecycle";

export { createDebouncedSaver } from "./save-config";
export type { DebouncedSaver } from "./save-config";
