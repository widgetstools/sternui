/**
 * OpenFin Dock Provider — follows workspace-starter patterns.
 *
 * Key Principles:
 * 1. Use Dock.register() from @openfin/workspace
 * 2. Custom actions must be registered BEFORE dock registration in platform init()
 * 3. Use updateDockProviderConfig() for fast updates
 * 4. Cache-busting: always rebuild buttons array from scratch on each update
 */

import {
  Dock,
  DockButtonNames,
  type DockButton,
  type DockProviderRegistration,
  type DockProviderConfig,
  type WorkspaceButtonsConfig,
} from '@openfin/workspace';
import {
  CustomActionCallerType,
  getCurrentSync,
  type CustomActionPayload,
  type CustomActionsMap,
} from '@openfin/workspace-platform';
import {
  buildUrl,
  type DockMenuItem,
  OpenFinCustomEvents,
  launchMenuItem,
} from '@marketsui/openfin-platform-stern';
import { getDefaultMenuIcon } from '@marketsui/openfin-platform-stern';

// ============================================================================
// Module State
// ============================================================================

let registration: DockProviderRegistration | undefined;
let currentConfig: DockProviderConfig | undefined;
let currentMenuItems: DockMenuItem[] = [];
let currentTheme: 'light' | 'dark' = 'light';

let _isQuitting = false;
export function isQuitting(): boolean { return _isQuitting; }
export function setQuitting(): void { _isQuitting = true; }

// ============================================================================
// Public API
// ============================================================================

export function isDockAvailable(): boolean {
  try {
    return (
      typeof Dock !== 'undefined' &&
      typeof Dock.register === 'function' &&
      typeof Dock.show === 'function'
    );
  } catch {
    return false;
  }
}

export async function register(config: {
  id: string;
  title: string;
  icon: string;
  workspaceComponents?: WorkspaceButtonsConfig;
  disableUserRearrangement?: boolean;
  menuItems?: DockMenuItem[];
}): Promise<DockProviderRegistration | undefined> {
  try {
    console.log('[DOCK] Registering dock provider', config.id);

    // Deregister any previous dock to ensure clean state
    try {
      await Dock.deregister();
      console.log('[DOCK] Deregistered previous dock');
    } catch {
      // No previous registration — expected on first launch
    }

    // Sync theme from platform (default to 'dark' to match our init config)
    try {
      const platform = getCurrentSync();
      const scheme = await platform.Theme.getSelectedScheme();
      currentTheme = (scheme as string) === 'light' ? 'light' : 'dark';
    } catch {
      currentTheme = 'dark';
    }

    // Build dock buttons
    const buttons: DockButton[] = [];
    if (config.menuItems && config.menuItems.length > 0) {
      buttons.push(buildApplicationsButton(config.menuItems));
    }
    const systemButtons = buildSystemButtons();
    buttons.push(...systemButtons);

    // Debug: log what we're registering
    const toolsButton = systemButtons.find((b: any) => b.tooltip === 'Tools') as any;
    console.log('[DOCK] Tools dropdown options:', toolsButton?.options?.map((o: any) => o.tooltip));

    const dockProvider: any = {
      id: config.id,
      title: config.title,
      icon: config.icon,
      workspaceComponents: config.workspaceComponents || {
        hideWorkspacesButton: false,
        hideHomeButton: true,
        hideNotificationsButton: true,
        hideStorefrontButton: true,
      },
      disableUserRearrangement: config.disableUserRearrangement ?? false,
      buttons,
    };

    currentConfig = {
      title: dockProvider.title,
      icon: dockProvider.icon,
      workspaceComponents: dockProvider.workspaceComponents,
      disableUserRearrangement: dockProvider.disableUserRearrangement,
      buttons: dockProvider.buttons,
    };
    currentMenuItems = config.menuItems ?? [];

    registration = await Dock.register(dockProvider);
    console.log('[DOCK] Registered successfully', { buttonCount: buttons.length });
    return registration;
  } catch (error) {
    console.error('[DOCK] Failed to register dock', error);
    return undefined;
  }
}

export async function show(): Promise<void> {
  try {
    await Dock.show();
    console.log('[DOCK] Dock shown');
  } catch (error) {
    console.error('[DOCK] Failed to show dock', error);
    throw error;
  }
}

export async function deregister(): Promise<void> {
  try {
    if (registration) {
      await Dock.deregister();
      registration = undefined;
      currentConfig = undefined;
      console.log('[DOCK] Deregistered');
    }
  } catch (error) {
    console.error('[DOCK] Failed to deregister dock', error);
    throw error;
  }
}

export async function updateConfig(config: {
  menuItems?: DockMenuItem[];
  workspaceComponents?: WorkspaceButtonsConfig;
}): Promise<void> {
  try {
    if (!registration || !currentConfig) {
      throw new Error('Dock not registered');
    }

    const buttons: DockButton[] = [];
    if (config.menuItems && config.menuItems.length > 0) {
      buttons.push(buildApplicationsButton(config.menuItems));
    }
    buttons.push(...buildSystemButtons());

    const newConfig: DockProviderConfig = {
      ...currentConfig,
      buttons,
      workspaceComponents: config.workspaceComponents || currentConfig.workspaceComponents,
    };

    await registration.updateDockProviderConfig(newConfig);
    currentConfig = newConfig;
    if (config.menuItems) currentMenuItems = config.menuItems;
    console.log('[DOCK] Configuration updated');
  } catch (error) {
    console.error('[DOCK] Failed to update dock', error);
    throw error;
  }
}

async function updateAllDockIcons(): Promise<void> {
  try {
    if (!registration || !currentConfig) return;

    const buttons: DockButton[] = [];
    const existingButtons = currentConfig.buttons || [];

    const isSystemButton = (button: DockButton): boolean => {
      const action = (button as any).action;
      const tooltip = (button as any).tooltip;
      return (action && action.id === 'toggle-theme') || tooltip === 'Tools';
    };

    for (const button of existingButtons) {
      if ((button as any).tooltip === 'Applications') {
        buttons.push({ ...button, iconUrl: getThemedIcon('app') } as DockButton);
      } else if (!isSystemButton(button)) {
        buttons.push(button);
      }
    }

    buttons.push(...buildSystemButtons());

    const newConfig: DockProviderConfig = { ...currentConfig, buttons };
    await registration.updateDockProviderConfig(newConfig);
    currentConfig = newConfig;
  } catch (error) {
    console.error('[DOCK] Failed to update dock icons', error);
  }
}

// ============================================================================
// Custom Actions — MUST be registered before dock in platform init()
// ============================================================================

export function dockGetCustomActions(): CustomActionsMap {
  return {
    'launch-component': async (payload: CustomActionPayload): Promise<void> => {
      if (
        payload.callerType === CustomActionCallerType.CustomButton ||
        payload.callerType === CustomActionCallerType.CustomDropdownItem
      ) {
        const menuItem = payload.customData as DockMenuItem;
        try {
          await launchMenuItem(menuItem);
        } catch (error) {
          console.error('[DOCK] Failed to launch component', error);
        }
      }
    },

    'launch-data-providers': async (): Promise<void> => {
      try {
        await launchMenuItem({
          id: 'data-providers',
          caption: 'Data Providers',
          url: '/dataproviders',
          openMode: 'window',
          order: 0,
          windowOptions: { width: 1200, height: 800 },
        } as DockMenuItem);
      } catch (error) {
        console.error('[DOCK] Failed to launch data providers', error);
      }
    },

    'reload-dock': async (): Promise<void> => {
      try {
        console.log('[DOCK] Reload triggered', { hasRegistration: !!registration, hasConfig: !!currentConfig, menuItemCount: currentMenuItems.length });
        if (!registration || !currentConfig) {
          console.warn('[DOCK] Reload skipped — dock not registered');
          return;
        }

        // Re-sync theme
        try {
          const platform = getCurrentSync();
          const scheme = await platform.Theme.getSelectedScheme();
          currentTheme = (scheme as string) === 'light' ? 'light' : 'dark';
        } catch { /* ignore */ }

        // Rebuild buttons with refreshed theme icons and current menu items.
        // updateDockProviderConfig is the only safe reload mechanism —
        // Dock.deregister() tears down the openfin-workspace channel and
        // prevents any subsequent Dock.register() call in the same session.
        const buttons: DockButton[] = [];
        if (currentMenuItems.length > 0) {
          buttons.push(buildApplicationsButton(currentMenuItems));
        }
        buttons.push(...buildSystemButtons());

        const newConfig: DockProviderConfig = { ...currentConfig, buttons };
        await registration.updateDockProviderConfig(newConfig);
        currentConfig = newConfig;

        // Minimize then re-show to force a visual refresh of the dock UI.
        await Dock.minimize();
        await new Promise<void>((r) => setTimeout(r, 150));
        await Dock.show();

        console.log('[DOCK] Reload complete');
      } catch (error) {
        console.error('[DOCK] Failed to reload dock', error);
      }
    },

    'show-dock-devtools': async (): Promise<void> => {
      try {
        const runningApps = await fin.System.getAllApplications();

        for (const app of runningApps) {
          const appUuid = app.uuid.toLowerCase();
          if (
            appUuid.includes('openfin-workspace') ||
            appUuid.includes('workspace')
          ) {
            try {
              const application = fin.Application.wrapSync({ uuid: app.uuid });
              const childWindows = await application.getChildWindows();
              for (const window of childWindows) {
                const windowName = window.identity.name?.toLowerCase() || '';
                if (windowName.includes('dock')) {
                  await window.showDeveloperTools();
                  return;
                }
              }
              const mainWindow = await application.getWindow();
              await mainWindow.showDeveloperTools();
              return;
            } catch { /* continue */ }
          }
        }

        // Fallback: current window
        const currentWindow = fin.Window.getCurrentSync();
        await currentWindow.showDeveloperTools();
      } catch (error) {
        console.error('[DOCK] Error opening dock devtools', error);
      }
    },

    'set-theme': async (payload: CustomActionPayload): Promise<void> => {
      if (payload.callerType === CustomActionCallerType.CustomDropdownItem) {
        const theme = (payload as any).customData as 'light' | 'dark';
        try {
          import('@openfin/workspace-platform').then(({ getCurrentSync }) => {
            try {
              getCurrentSync().Theme.setSelectedScheme(theme as any);
            } catch { /* ignore */ }
          });

          await fin.InterApplicationBus.publish(
            OpenFinCustomEvents.THEME_CHANGE,
            { theme }
          );
        } catch (error) {
          console.error('[DOCK] Failed to set theme', error);
        }
      }
    },

    'toggle-theme': async (): Promise<void> => {
      try {
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        currentTheme = newTheme;

        // Inject JavaScript into all windows/views for instant theme update
        const { getCurrentSync } = await import('@openfin/workspace-platform');
        const platform = getCurrentSync();
        const snapshot = await platform.getSnapshot();

        if (snapshot.windows) {
          const updatePromises = snapshot.windows.map(async (window: any) => {
            try {
              const windowObj = fin.Window.wrapSync({
                uuid: window.uuid || fin.me.uuid,
                name: window.name,
              });

              await windowObj.executeJavaScript(`
                (function() {
                  const root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  root.classList.add('${newTheme}');
                  root.setAttribute('data-theme', '${newTheme}');
                  if (document.body) {
                    document.body.dataset.agThemeMode = '${newTheme}';
                  }
                })();
              `);

              if (window.childWindows) {
                for (const childWindow of window.childWindows) {
                  for (const view of childWindow.views || []) {
                    try {
                      const viewObj = fin.View.wrapSync({
                        uuid: view.uuid || fin.me.uuid,
                        name: view.name,
                      });
                      await viewObj.executeJavaScript(`
                        (function() {
                          const root = document.documentElement;
                          root.classList.remove('light', 'dark');
                          root.classList.add('${newTheme}');
                          root.setAttribute('data-theme', '${newTheme}');
                          if (document.body) {
                            document.body.dataset.agThemeMode = '${newTheme}';
                          }
                        })();
                      `);
                    } catch { /* ignore view */ }
                  }
                }
              }
            } catch { /* ignore window */ }
          });

          await Promise.all(updatePromises);
        }

        // Broadcast IAB event for React state sync (non-blocking)
        fin.InterApplicationBus.publish(
          OpenFinCustomEvents.THEME_CHANGE,
          { theme: newTheme }
        ).catch(() => {});

        // Update platform theme (non-blocking)
        platform.Theme.setSelectedScheme(newTheme as any).catch(() => {});

        // Update dock icons (non-blocking)
        updateAllDockIcons().catch(() => {});
      } catch (error) {
        console.error('[DOCK] Failed to toggle theme', error);
      }
    },

    'toggle-provider-window': async (): Promise<void> => {
      const EDITOR_NAME = 'stern-dock-editor';
      try {
        // Try to show/hide an existing dock editor window.
        const existing = fin.Window.wrapSync({ uuid: fin.me.uuid, name: EDITOR_NAME });
        const isShowing = await existing.isShowing();
        if (isShowing) {
          await existing.hide();
        } else {
          await existing.show();
          await existing.bringToFront();
        }
      } catch {
        // Window does not exist yet — create it as a plain fin.Window so that
        // closing it does not trigger the workspace platform's auto-quit logic.
        try {
          await fin.Window.create({
            name: EDITOR_NAME,
            url: buildUrl('/dock-editor'),
            defaultWidth: 900,
            defaultHeight: 680,
            defaultCentered: true,
            autoShow: true,
            frame: true,
            resizable: true,
            saveWindowState: false,
          } as any);
        } catch (error) {
          console.error('[DOCK] Failed to create dock editor window', error);
        }
      }
    },

    'quit': async (): Promise<void> => {
      setQuitting();

      setTimeout(async () => {
        try {
          const app = fin.Application.getCurrentSync();
          await app.quit(true);
        } catch { /* already dead */ }
      }, 3000);

      try {
        await Dock.deregister();
        registration = undefined;
      } catch { /* ignore */ }

      try {
        const platform = getCurrentSync();
        await platform.quit();
      } catch {
        const app = fin.Application.getCurrentSync();
        await app.quit(true);
      }
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getThemedIcon(baseName: string): string {
  return buildUrl(`/icons/${baseName}-${currentTheme}.svg`);
}

function buildApplicationsButton(items: DockMenuItem[]): DockButton {
  function convertToDropdownOptions(menuItems: DockMenuItem[], level: number = 0): any[] {
    return menuItems.map((item) => {
      const hasValidCustomIcon = item.icon &&
        !item.icon.includes('cdn.openfin.co') &&
        !item.icon.includes('defaultFavorite');

      const iconUrl = hasValidCustomIcon && item.icon
        ? buildUrl(item.icon)
        : getDefaultMenuIcon(item, currentTheme, level);

      const option: any = {
        tooltip: item.caption,
        iconUrl,
      };

      if (item.children && item.children.length > 0) {
        option.options = convertToDropdownOptions(item.children, level + 1);
      } else {
        option.action = {
          id: 'launch-component',
          customData: item,
        };
      }

      return option;
    });
  }

  return {
    type: DockButtonNames.DropdownButton,
    tooltip: 'Applications',
    iconUrl: getThemedIcon('app'),
    options: convertToDropdownOptions(items),
    contextMenu: { removeOption: false },
  } as DockButton;
}

function buildThemeButton(): DockButton {
  const iconBaseName = currentTheme === 'dark' ? 'sun' : 'moon';
  const tooltip = currentTheme === 'dark'
    ? 'Switch to Light Mode'
    : 'Switch to Dark Mode';

  return {
    type: DockButtonNames.ActionButton,
    tooltip,
    iconUrl: getThemedIcon(iconBaseName),
    action: { id: 'toggle-theme' },
    contextMenu: { removeOption: true },
  } as DockButton;
}

function buildSystemButtons(): DockButton[] {
  return [
    buildThemeButton(),
    {
      type: DockButtonNames.DropdownButton,
      tooltip: 'Tools',
      iconUrl: getThemedIcon('tools'),
      options: [
        {
          tooltip: 'Data Providers',
          iconUrl: getThemedIcon('data'),
          action: {id: 'launch-data-providers'},
        },
        {
          tooltip: 'Reload Dock',
          iconUrl: getThemedIcon('reload'),
          action: { id: 'reload-dock' },
        },
        {
          tooltip: 'Show Dock Developer Tools',
          iconUrl: getThemedIcon('dev-tools'),
          action: { id: 'show-dock-devtools' },
        },
        {
          tooltip: 'Dock Editor',
          iconUrl: getThemedIcon('settings'),
          action: { id: 'toggle-provider-window' },
        },
      ],
      contextMenu: { removeOption: true },
    } as DockButton,
  ];
}
