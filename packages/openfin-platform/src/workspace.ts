/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import { Home, Storefront, type App } from "@openfin/workspace";
import { init, type WorkspacePlatformOverrideCallback } from "@openfin/workspace-platform";
import { createConfigManager, type ConfigManager } from "@marketsui/config-service";
import {
  setConfigManager,
  setPlatformDefaultScope,
  getPlatformDefaultScope,
  migrateLegacyPlatformScope,
  migrateRegistryToGlobalScope,
  realignAllConfigsToPlatformScope,
} from './db';
import {
  registerDock,
  reloadDockFromConfig,
  ACTION_LAUNCH_APP,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_LAUNCH_COMPONENT,
  shutdownDock,
} from './dock';
import { registerHome } from './home';
import { launchApp, launchRegisteredComponent } from './launch';
import { registerNotifications } from './notifications';
import { registerStore } from './store';
import type { CustomSettings, PlatformSettings, WorkspaceConfig } from './types';
import { createWorkspacePersistenceOverride } from './workspace-persistence';
import { gcOrphanedConfigs } from './workspace-gc';
import { buildCustomActions } from './internal/customActions';

/**
 * Read the current theme from this window's documentElement.
 * Falls back to localStorage, then "dark" as the last resort.
 * Used by the theme toggle handlers to determine the current state
 * without depending on OpenFin's `platform.Theme.getSelectedScheme()`
 * (which can desync due to a known promise-never-resolves quirk).
 */
function readCurrentTheme(): "dark" | "light" {
  try {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  } catch { /* non-browser */ }
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light") return "light";
  } catch { /* storage unavailable */ }
  return "dark";
}

/**
 * Re-entry guard for the theme-toggle handlers. When the user clicks
 * the dock's toggle button twice in rapid succession, both invocations
 * used to read the same stale `data-theme` value (because the async
 * work in the first invocation hadn't yet committed the state change)
 * and they'd both flip to the same target — causing the toggle to
 * appear stuck. We now commit state synchronously up front AND gate
 * re-entry so concurrent presses are coalesced.
 */
let themeToggleInFlight = false;

/**
 * Read current theme, flip it, apply the new `[data-theme]` attribute
 * *synchronously* (so a follow-up click reads the new value), then
 * run the supplied async continuation (OpenFin scheme flip, dock-icon
 * recolor, IAB broadcast, etc.).
 */
async function runThemeToggle(
  continuation: (isDark: boolean) => Promise<void>,
): Promise<void> {
  if (themeToggleInFlight) return;
  themeToggleInFlight = true;
  try {
    const isDark = readCurrentTheme() !== "dark";
    // Commit the new theme synchronously — every subsequent
    // readCurrentTheme() sees this value immediately.
    applyLocalDataTheme(isDark);
    await continuation(isDark);
  } finally {
    themeToggleInFlight = false;
  }
}

/**
 * Flip the `[data-theme]` attribute on this window's documentElement.
 * Keeps the design-system CSS tokens (--bn-*, shadcn aliases, PrimeNG
 * preset via darkModeSelector '[data-theme="dark"]') in sync with the
 * dock's OpenFin theme toggle.
 */
function applyLocalDataTheme(isDark: boolean): void {
  try {
    const theme = isDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.body.dataset["agThemeMode"] = theme;
    try { localStorage.setItem("theme", theme); } catch { /* non-browser or locked */ }
  } catch {
    /* not running in a DOM-capable context */
  }
}

/**
 * Resolve the canonical `(appId, userId)` to use as the platform's
 * default scope for every implicit-scope save/load.
 *
 * Strategy: read the seeded `appRegistry` + `userProfile` tables and
 * pick the first row of each. This keeps the choice data-driven —
 * editing `seed-config.json` to add a different default user / app
 * automatically takes effect on next boot without a code change.
 *
 * Hard fallbacks (`'TestApp'` / `'dev1'`) match the values currently
 * shipped in `apps/markets-ui-react-reference/public/seed-config.json`
 * and are used only when the tables are empty (e.g. the seed failed to
 * load, or the user has manually emptied them).
 */
async function resolveDefaultPlatformScope(
  cm: ConfigManager,
): Promise<{ appId: string; userId: string }> {
  let appId = 'TestApp';
  let userId = 'dev1';
  try {
    const apps = await cm.getAllApps();
    if (apps.length > 0 && apps[0].appId) appId = apps[0].appId;
  } catch (err) {
    console.warn('[initWorkspace] Could not read appRegistry; falling back to TestApp.', err);
  }
  try {
    const profiles = await cm.getAllUserProfiles();
    // Prefer a profile that's already scoped to the resolved appId — so
    // multi-app seeds pick the right user automatically.
    const match = profiles.find((p) => p.appId === appId) ?? profiles[0];
    if (match?.userId) userId = match.userId;
  } catch (err) {
    console.warn('[initWorkspace] Could not read userProfile; falling back to dev1.', err);
  }
  return { appId, userId };
}

/**
 * Prevents initWorkspace() from running more than once.
 * The platform can only be initialised a single time per provider window,
 * so a second call silently returns without doing anything.
 */
let isInitialized = false;

/** The shared ConfigManager instance, created during platform init. */
let configManager: ConfigManager | undefined;


/**
 * Initialize the OpenFin workspace platform and all workspace components
 * (Home, Store, Dock, Notifications).
 *
 * This is the main entry point — call it once from your provider window.
 * It reads platform settings from the manifest, sets up the theme and
 * custom actions, then registers each workspace component.
 */
export async function initWorkspace(config?: WorkspaceConfig): Promise<void> {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // Default logger is a no-op if the caller didn't provide one
  const log = config?.onProgress ?? (() => {});

  // All components are enabled by default; the caller can disable them
  const components = {
    home: true,
    store: true,
    dock: true,
    notifications: true,
    ...config?.components,
  };

  log("Workspace platform initializing");

  const settings = await getManifestCustomSettings();

  // Initialize the config service before anything else.
  // It seeds the database on first run and starts the sync drain
  // loop if a REST URL is configured in the manifest.
  configManager = createConfigManager({
    seedConfigUrl: settings.customSettings?.seedConfigUrl,
    configServiceRestUrl: settings.customSettings?.configServiceRestUrl,
  });
  await configManager.init();

  // Share the ConfigManager with db.ts so dock config persistence
  // uses the same database as everything else.
  setConfigManager(configManager);

  // Tag every implicit-scope save with the canonical (appId, userId)
  // pair seeded into the config service:
  //   • appId  = "TestApp"  (the only row in appRegistry seed)
  //   • userId = "dev1"     (the only row in userProfiles seed)
  // Dock, registry, MarketsGrid profiles, and any future per-app config
  // all land in one scope bucket — visible together in the Config Browser.
  // Decoupled from `fin.me.identity.uuid` deliberately: the platform's
  // OpenFin uuid is a runtime detail; the config-service identity is the
  // stable key that survives platform rename/relaunch and matches whatever
  // appears in the appRegistry / userProfile tables. Replace `dev1` with
  // the signed-in user's id when real auth is wired.
  const defaultScope = await resolveDefaultPlatformScope(configManager);
  setPlatformDefaultScope(defaultScope);
  log(
    `Platform default scope: appId='${defaultScope.appId}' userId='${defaultScope.userId}' ` +
    `(resolved from appRegistry + userProfile seed).`,
  );
  // One-shot migration: pre-platform rows still tagged with the legacy
  // `appId='system'` get re-stamped to the platform scope so they show
  // up in the browser without forcing the user to re-save.
  try {
    const result = await migrateLegacyPlatformScope();
    if (result.migrated > 0) {
      log(`Migrated ${result.migrated} legacy-scope config row(s) to appId='${defaultScope.appId}'.`);
    }
  } catch (migrateErr) {
    console.warn('[initWorkspace] migrateLegacyPlatformScope failed:', migrateErr);
  }

  // Broad sweep: collapse every appConfig row onto the platform scope —
  // catches rows previously tagged with stale `(appId, userId)` (e.g.
  // `react-workspace-starter`/`system` from earlier builds) so the whole
  // table renders under a single chip in the Config Browser. Idempotent
  // — rows already on the platform scope are skipped.
  try {
    const result = await realignAllConfigsToPlatformScope();
    if (result.realigned > 0) {
      log(
        `Realigned ${result.realigned}/${result.total} config row(s) to ` +
        `appId='${defaultScope.appId}' userId='${defaultScope.userId}'.`,
      );
    }
  } catch (realignErr) {
    console.warn('[initWorkspace] realignAllConfigsToPlatformScope failed:', realignErr);
  }

  // Phase-5 migration: relocate the component registry from per-user
  // scope (where Phase 3 and earlier wrote it) to the new global scope
  // (appId, 'system') so every user of the app shares the same catalog.
  // Runs AFTER realignAllConfigsToPlatformScope so any stray rows have
  // already been re-tagged to the current platform scope first — keeps
  // the candidate-picking logic deterministic.
  try {
    const r = await migrateRegistryToGlobalScope();
    if (r.migrated > 0) {
      log(`Workspace setup migrated to new format (registry → global scope, ${r.migrated} row(s)).`);
    }
  } catch (regMigErr) {
    console.warn('[initWorkspace] migrateRegistryToGlobalScope failed:', regMigErr);
  }

  log("Config service initialized");

  // Wait for the platform API to be ready before registering components.
  // The "platform-api-ready" event fires after init() completes below.
  const platform = fin.Platform.getCurrentSync();
  await platform.once("platform-api-ready", async () => {
    try {
      await initializeWorkspaceComponents(
        settings.platformSettings,
        settings.customSettings,
        components,
        log,
        config?.dockIcon,
        config?.themeToggleDarkIcon,
        config?.themeToggleLightIcon,
        config?.roles,
      );
      log("Workspace platform initialized");
    } catch (err) {
      console.error("Failed to initialize workspace components:", err);
    }
  });

  // Build the workspace-persistence override so saved workspaces land in
  // ConfigService (Option A — single source of truth, shareable between
  // users). OpenFin's local IndexedDB is bypassed entirely. The
  // onWorkspaceChange hook drives orphan-config GC after every workspace
  // mutation so per-instance config rows that no workspace references
  // anymore get reaped.
  const cm = configManager;
  const workspaceOverride = createWorkspacePersistenceOverride({
    cm,
    appId: defaultScope.appId,
    userId: defaultScope.userId,
    onWorkspaceChange: async () => {
      try {
        const r = await gcOrphanedConfigs({ cm, appId: defaultScope.appId, userId: defaultScope.userId });
        // Deletion is currently disabled in workspace-gc; r.deleted is
        // always 0. r.wouldDelete tracks the rows that match no
        // preservation rule, kept for telemetry while we audit.
        if (r.wouldDelete > 0) {
          log(`Workspace GC: ${r.wouldDelete} orphan row(s) identified (deletion disabled — none removed).`);
        }
      } catch (gcErr) {
        console.warn('[initWorkspace] post-workspace-change GC failed:', gcErr);
      }
    },
  });

  // App-start GC sweep: catches orphans left over from a crashed session
  // or from a workspace deletion that happened in another tab. Fire-and-
  // forget so it never blocks platform init.
  void (async () => {
    try {
      const r = await gcOrphanedConfigs({ cm, appId: defaultScope.appId, userId: defaultScope.userId });
      if (r.wouldDelete > 0) {
        log(`Workspace GC (boot): ${r.wouldDelete} orphan row(s) identified (deletion disabled — none removed).`);
      }
    } catch (gcErr) {
      console.warn('[initWorkspace] boot GC failed:', gcErr);
    }
  })();

  // init() starts the platform and triggers "platform-api-ready" above
  await initializePlatform(settings.platformSettings, config?.theme, workspaceOverride);
}

// ─── Export config helper ─────────────────────────────────────────────

/**
 * Gather all config data from the config service and trigger a JSON download.
 * Shared between the customActions handler and the dockActionHandlers.
 */
async function exportAllConfig(cm: ConfigManager): Promise<void> {
  const allApps = await cm.getAllApps();
  const allConfigs: any[] = [];
  for (const app of allApps) {
    const configs = await cm.getConfigsByApp(app.appId);
    allConfigs.push(...configs);
  }
  // Dock + registry persist as regular AppConfigRows keyed by a
  // fixed configId (for the default `system`/`system` scope). Pick
  // them up via the generic `getConfig()` API — the domain-specific
  // shim methods were removed when persistence moved into
  // `openfin-platform/db.ts`. See db.ts for the scoping scheme that
  // lets per-user / per-app rows coexist.
  const dockRow = await cm.getConfig('dock-config');
  if (dockRow) allConfigs.push(dockRow);
  const registryRow = await cm.getConfig('component-registry');
  if (registryRow) allConfigs.push(registryRow);
  const exportData = {
    appRegistry: allApps,
    appConfig: allConfigs,
    userProfiles: [] as any[],
    roles: await cm.getAllRoles(),
    permissions: await cm.getAllPermissions(),
    exportedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `config-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  console.log("Config exported.");
}

// ─── Platform initialization ─────────────────────────────────────────

/**
 * Initialize the OpenFin workspace platform with theme config and
 * custom action handlers for the dock buttons.
 */
async function initializePlatform(
  platformSettings: PlatformSettings,
  theme?: WorkspaceConfig["theme"],
  overrideCallback?: WorkspacePlatformOverrideCallback,
): Promise<void> {
  await init({
    ...(overrideCallback ? { overrideCallback } : {}),
    browser: {
      defaultWindowOptions: {
        icon: platformSettings.icon,
        workspacePlatform: {
          pages: [],
          favicon: platformSettings.icon,
        },
      },
    },
    theme: [
      {
        label: "Default",
        default: "dark",
        palettes: {
          dark: {
            brandPrimary: theme?.brandPrimary ?? "#0A76D3",
            brandSecondary: theme?.brandSecondary ?? "#383A40",
            backgroundPrimary: theme?.backgroundPrimary ?? "#1E1F23",
          },
          light: {
            brandPrimary: theme?.brandPrimary ?? "#0A76D3",
            brandSecondary: theme?.brandSecondary ?? "#383A40",
            backgroundPrimary: "#FAFBFE",
          },
        },
      },
    ],
    customActions: buildCustomActions({
      runThemeToggle,
      openChildWindow,
      getConfigManager: () => configManager,
      exportAllConfig,
    }),
  });
}

// ─── Dock3 action dispatcher ──────────────────────────────────────────
// Maps action IDs to handler functions for Dock3's launchEntry callback.
// These mirror the customActions handlers above but without the callerType
// guard (Dock3 calls launchEntry directly from favorites/content menu).

const dockActionHandlers: Record<string, (customData?: any) => Promise<void>> = {
  [ACTION_LAUNCH_APP]: async (customData) => {
    await launchApp(customData as App);
  },

  // Launch a Component-Registry entry by id. Shape:
  //   customData = { registryEntryId: string, asWindow?: boolean }
  // Missing ids are handled gracefully inside launchRegisteredComponent
  // (warn + no-op) so a stale dock menu item never hard-fails.
  [ACTION_LAUNCH_COMPONENT]: async (customData) => {
    const cd = (customData ?? {}) as { registryEntryId?: string; asWindow?: boolean };
    if (!cd.registryEntryId) {
      console.warn(`[${ACTION_LAUNCH_COMPONENT}] missing registryEntryId in customData`);
      return;
    }
    await launchRegisteredComponent(cd.registryEntryId, { asWindow: cd.asWindow });
  },

  // ACTION_TOGGLE_THEME is intentionally NOT in this map.
  // The dock theme toggle is handled inline in the Dock3Provider
  // override's `launchEntry()` (see dock.ts) — that's the canonical v23
  // pattern. Routing it through this handler caused
  // `setSelectedScheme()` to deadlock the dock channel.

  [ACTION_OPEN_DOCK_EDITOR]: async () => {
    const scope = getPlatformDefaultScope();
    await openChildWindow("dock-editor", "/dock-editor", 720, 800, {
      customData: { appId: scope.appId, userId: scope.userId },
    });
  },

  [ACTION_OPEN_REGISTRY_EDITOR]: async () => {
    const scope = getPlatformDefaultScope();
    await openChildWindow("registry-editor", "/registry-editor", 800, 700, {
      customData: { appId: scope.appId, userId: scope.userId },
    });
  },

  [ACTION_OPEN_WORKSPACE_SETUP]: async () => {
    const scope = getPlatformDefaultScope();
    await openChildWindow("workspace-setup", "/workspace-setup", 1280, 760, {
      customData: { appId: scope.appId, userId: scope.userId },
    });
  },

  [ACTION_OPEN_DATA_PROVIDERS]: async () => {
    const scope = getPlatformDefaultScope();
    await openChildWindow("data-providers", "/dataproviders", 1180, 760, {
      customData: { appId: scope.appId, userId: scope.userId },
    });
  },

  [ACTION_OPEN_CONFIG_BROWSER]: async () => {
    // Forward the platform default scope (TestApp / dev1 by default) via
    // customData so the browser's readHostEnv() returns the same scope
    // every other surface writes under — keeping dock, registry, blotter,
    // and any future config rows visible together.
    const scope = getPlatformDefaultScope();
    const appId = scope.appId || (() => {
      try { return fin.me.identity.uuid; } catch { return ''; }
    })();
    const userId = scope.userId;
    await openChildWindow(
      "config-browser",
      "/config-browser",
      1100,
      720,
      { customData: { appId, userId } },
    );
  },

  [ACTION_RELOAD_DOCK]: async () => {
    console.log("Reloading dock...");
    try {
      await reloadDockFromConfig();
      console.log("Dock reloaded.");
    } catch (error) {
      console.error("Failed to reload dock.", error);
    }
  },

  [ACTION_SHOW_DEVTOOLS]: async () => {
    try {
      const providerWindow = fin.Window.getCurrentSync();
      await providerWindow.showDeveloperTools();
    } catch (error) {
      console.error("Failed to open developer tools.", error);
    }
  },

  // Mirrors the customActions handler — opens DevTools scoped to the
  // data-plane SharedWorker by walking views until one accepts the
  // call. See iab-topics.ts:ACTION_INSPECT_SHARED_WORKER for context.
  [ACTION_INSPECT_SHARED_WORKER]: async () => {
    try {
      // Walk every view in the current app. `Application.getViews()`
      // is stable across the OpenFin versions we support (43+);
      // `fin.System.getAllViews()` only landed in newer runtimes.
      const app = fin.Application.getCurrentSync();
      const views: any[] = await app.getViews();
      if (!views.length) {
        console.warn(
          "[inspect-shared-worker] No views are open — open a window that uses " +
          "the data plane (e.g. a MarketsGrid blotter) and try again.",
        );
        return;
      }
      let lastErr: unknown = null;
      for (const view of views) {
        try {
          await view.inspectSharedWorker();
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      console.error(
        "[inspect-shared-worker] No view has a SharedWorker connected. " +
        "Open a blotter or another data-plane consumer first.",
        lastErr,
      );
    } catch (error) {
      console.error("Failed to inspect shared worker.", error);
    }
  },

  [ACTION_EXPORT_CONFIG]: async () => {
    try {
      if (!configManager) {
        console.error("ConfigManager not initialized.");
        return;
      }
      await exportAllConfig(configManager);
    } catch (error) {
      console.error("Failed to export config.", error);
    }
  },

  [ACTION_IMPORT_CONFIG]: async () => {
    await openChildWindow("import-config", "/import-config", 400, 320, { resizable: false, saveWindowState: false, contextMenu: false });
  },

  [ACTION_TOGGLE_PROVIDER]: async () => {
    try {
      const providerWindow = fin.Window.getCurrentSync();
      const isVisible = await providerWindow.isShowing();
      if (isVisible) {
        await providerWindow.hide();
        console.log("Provider window hidden.");
      } else {
        await providerWindow.show();
        console.log("Provider window shown.");
      }
    } catch (error) {
      console.error("Failed to toggle provider window.", error);
    }
  },
};

/**
 * Open or bring-to-front a child window (dock editor, registry editor, import config).
 *
 * `wrapSync` never throws — it just returns a handle. To decide whether the
 * window actually exists we call `getInfo()`, which resolves only for real
 * windows. This avoids a silent-failure mode where a handle claims to
 * succeed `setAsForeground()` on a non-existent window and nothing opens.
 */
async function openChildWindow(
  name: string,
  path: string,
  width: number,
  height: number,
  extraOptions?: Record<string, any>,
): Promise<void> {
  console.log(`[openChildWindow] Opening "${name}" at "${path}"`);

  // 1. Does the window actually exist? Use getInfo to probe.
  // The probe THROWS when the window doesn't exist — that's the success path
  // here (we'll fall through and create it). We swallow the error and log a
  // plain message so it doesn't render as a red stack trace in DevTools.
  try {
    const existing = fin.Window.wrapSync({ uuid: fin.me.identity.uuid, name });
    await existing.getInfo();              // throws if the window doesn't exist
    await existing.setAsForeground();
    console.log(`[openChildWindow] Brought existing "${name}" to front.`);
    return;
  } catch {
    console.debug(`[openChildWindow] "${name}" does not exist; will create.`);
  }

  // 2. Create a new window.
  let origin: string;
  try {
    const app = await fin.Application.getCurrent();
    const manifest: Record<string, unknown> = await app.getManifest();
    const platformConfig = manifest["platform"] as Record<string, string> | undefined;
    const providerUrl = platformConfig?.["providerUrl"] ?? "";
    origin = new URL(providerUrl).origin;
  } catch (originErr) {
    console.error(`[openChildWindow] Could not determine origin for "${name}"`, originErr);
    return;
  }

  try {
    await fin.Window.create({
      name,
      url: `${origin}${path}`,
      defaultWidth: width,
      defaultHeight: height,
      autoShow: true,
      frame: true,
      resizable: true,
      saveWindowState: true,
      contextMenu: true,
      ...extraOptions,
    });
    console.log(`[openChildWindow] Created window "${name}" at ${origin}${path}`);
  } catch (createErr) {
    console.error(`[openChildWindow] Failed to create "${name}"`, createErr);
  }
}

// ─── Workspace component registration ────────────────────────────────

/**
 * Register each enabled workspace component (Home, Store, Dock, Notifications)
 * and set up a cleanup handler for when the provider window is closed.
 */
async function initializeWorkspaceComponents(
  platformSettings: PlatformSettings,
  customSettings: CustomSettings | undefined,
  components: Required<NonNullable<WorkspaceConfig["components"]>>,
  log: (message: string) => void,
  dockIcon?: string,
  themeToggleDarkIcon?: string,
  themeToggleLightIcon?: string,
  roles?: string[],
): Promise<void> {
  log("Initializing workspace components");

  if (components.home) {
    log("Initializing workspace components: home");
    await registerHome(platformSettings, customSettings?.apps);
    await Home.show();
  }

  if (components.store) {
    log("Initializing workspace components: store");
    await registerStore(platformSettings, customSettings?.apps);
  }

  if (components.dock) {
    log("Initializing workspace components: dock");
    // Build an action dispatcher that Dock3 can call from launchEntry().
    // This routes action IDs from dock favorites/content menu items to
    // the same handlers defined in customActions above.
    const dockActionDispatcher = async (actionId: string, customData?: any): Promise<void> => {
      const handler = dockActionHandlers[actionId];
      if (handler) {
        await handler(customData);
      } else {
        console.warn(`Unknown dock action: ${actionId}`);
      }
    };

    await registerDock(platformSettings, customSettings?.apps, dockIcon, themeToggleDarkIcon, themeToggleLightIcon, roles, dockActionDispatcher);
  }

  if (components.notifications) {
    log("Initializing workspace components: notifications");
    await registerNotifications();
  }

  // Clean up all registered components when the provider window closes
  const providerWindow = fin.Window.getCurrentSync();
  await providerWindow.once("close-requested", async () => {
    if (components.home) await Home.deregister(platformSettings.id);
    if (components.store) await Storefront.deregister(platformSettings.id);
    if (components.dock) await shutdownDock();

    // Clean up the config service (stops the sync drain loop)
    if (configManager) {
      configManager.dispose();
    }

    await fin.Platform.getCurrentSync().quit();
  });
}

// ─── Manifest settings ───────────────────────────────────────────────

/**
 * Read platform settings and custom settings from the OpenFin manifest.
 *
 * Platform settings (id, title, icon) come from standard manifest fields.
 * Custom settings (app list, etc.) come from the "customSettings" block
 * that we define in the manifest for our own use.
 */
async function getManifestCustomSettings(): Promise<{
  platformSettings: PlatformSettings;
  customSettings?: CustomSettings;
}> {
  const app = await fin.Application.getCurrent();
  const manifest: OpenFin.Manifest & { customSettings?: CustomSettings } = await app.getManifest();

  return {
    platformSettings: {
      id: manifest['platform']?.uuid ?? "",
      title: manifest.shortcut?.name ?? "",
      icon: manifest['platform']?.icon ?? "",
    },
    customSettings: manifest.customSettings,
  };
}
