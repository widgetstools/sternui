import type { App } from "@openfin/workspace";

export interface CustomSettings {
  apps?: App[];

  /**
   * URL to a JSON file containing seed data for first-run initialization.
   * When the config service database is empty, this file is fetched and
   * its contents are used to populate APP_REGISTRY, USER_PROFILE, and ROLES.
   *
   * Example: "http://localhost:5174/seed-config.json"
   */
  seedConfigUrl?: string;

  /**
   * Base URL of the remote config service REST API.
   * When set, the config service operates in REST mode — writes go to
   * the remote backend first, then mirror to local Dexie/IndexedDB.
   * When not set (default), everything stays local (dev mode).
   *
   * Example: "https://config-api.example.com/api/v1"
   */
  configServiceRestUrl?: string;
}

export interface PlatformSettings {
  id: string;
  title: string;
  icon: string;
}

export type UserRole = "admin" | "developer" | "support" | "user";

export interface WorkspaceConfig {
  /** Theme palette override */
  theme?: {
    brandPrimary?: string;
    brandSecondary?: string;
    backgroundPrimary?: string;
  };
  /** Which components to enable (defaults to all true) */
  components?: {
    home?: boolean;
    store?: boolean;
    dock?: boolean;
    notifications?: boolean;
  };
  /** Override the dock provider icon (must be raster: PNG/ICO) */
  dockIcon?: string;
  /**
   * Icon shown on the theme toggle dock button when the app is in dark mode
   * (clicking it will switch to light). Typically a sun icon.
   * If set, adds a toggle button to the dock.
   */
  themeToggleDarkIcon?: string;

  /**
   * Icon shown on the theme toggle dock button when the app is in light mode
   * (clicking it will switch to dark). Typically a moon icon.
   * If set alongside themeToggleDarkIcon, the dock swaps icons on theme change.
   */
  themeToggleLightIcon?: string;
  /** Progress callback for UI status updates */
  onProgress?: (message: string) => void;
  /**
   * User roles for access control.
   * If includes "admin", "developer", or "support", the Dock Editor button is shown.
   */
  roles?: UserRole[];

  /**
   * App-level custom action handlers for dock buttons.
   *
   * The key is the action ID string you assign to a dock button or menu item
   * in the dock editor (the "Action ID" field). When a user clicks that button,
   * OpenFin calls the matching handler.
   *
   * Built-in action IDs (launch-app, toggle-theme, open-dock-editor, etc.) are
   * always registered automatically — you do not need to re-register them here.
   * Any IDs provided here are merged alongside the built-in ones.
   *
   * @example
   * ```typescript
   * initWorkspace({
   *   customActions: {
   *     "open-blotter": async (e) => {
   *       // e.callerType is "CustomButton" or "CustomDropdownItem"
   *       // e.customData contains any data you stored on the button
   *       await fin.Application.startFromManifest("http://localhost:5174/blotter.fin.json");
   *     },
   *   },
   * });
   * ```
   */
  customActions?: Record<string, (e: { callerType: string; customData?: unknown }) => Promise<void>>;
}
