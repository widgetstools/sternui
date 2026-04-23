/// <reference path="../types/openfin.d.ts" />

/**
 * Menu Launcher — launches components from dock menu items.
 */

import { getCurrentSync } from '@openfin/workspace-platform';
import type { DockMenuItem } from '../types/dockConfig.js';
import { buildUrl } from '../utils/urlHelper.js';
import { platformContext } from '../core/PlatformContext.js';

export interface ConfigLookupResult {
  configId: string;
  isExisting: boolean;
}

export type ConfigLookupCallback = (
  menuItemId: string,
  caption: string
) => Promise<ConfigLookupResult>;

let configLookupCallback: ConfigLookupCallback | null = null;

export function registerConfigLookupCallback(callback: ConfigLookupCallback): void {
  configLookupCallback = callback;
  platformContext.logger.info('Config lookup callback registered', undefined, 'menuLauncher');
}

export function clearConfigLookupCallback(): void {
  configLookupCallback = null;
}

export async function launchMenuItem(item: DockMenuItem): Promise<void> {
  if (!item.url) return;

  try {
    const platform = getCurrentSync();
    let configId = item.id;

    if (configLookupCallback) {
      try {
        const result = await configLookupCallback(item.id, item.caption);
        configId = result.configId;
      } catch {
        configId = item.id;
      }
    }

    const url = `${buildUrl(item.url)}?id=${encodeURIComponent(configId)}`;

    if (item.openMode === 'window') {
      await platform.createWindow({
        name: `${item.id}-window-${Date.now()}`,
        url,
        defaultWidth: item.windowOptions?.width || 1200,
        defaultHeight: item.windowOptions?.height || 800,
        defaultCentered: item.windowOptions?.center ?? true,
        autoShow: true,
        frame: item.windowOptions?.frame ?? true,
        resizable: item.windowOptions?.resizable ?? true,
      } as any);
    } else {
      await platform.createView({
        name: `${item.id}-view-${Date.now()}`,
        url,
        customData: { menuItemId: item.id, caption: item.caption, configId },
      } as any);
    }
  } catch (error) {
    platformContext.logger.error('Failed to launch menu item', error, 'menuLauncher');
    throw error;
  }
}

export async function launchMenuItems(items: DockMenuItem[]): Promise<void> {
  for (const item of items) {
    try {
      await launchMenuItem(item);
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      platformContext.logger.error(`Failed to launch ${item.caption}`, error, 'menuLauncher');
    }
  }
}

export async function isComponentOpen(itemId: string): Promise<boolean> {
  try {
    const windows = await fin.System.getAllWindows();
    for (const window of windows) {
      if ((window as any).name?.includes(itemId)) return true;
      if ((window as any).childWindows) {
        for (const child of (window as any).childWindows) {
          if (child.name?.includes(itemId)) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function focusComponent(itemId: string): Promise<boolean> {
  try {
    const windows = await fin.System.getAllWindows();
    for (const windowInfo of windows) {
      const name = (windowInfo as any).name;
      const uuid = (windowInfo as any).uuid;
      if (name?.includes(itemId)) {
        const w = fin.Window.wrapSync({ uuid, name });
        await w.setAsForeground();
        await w.focus();
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function launchOrFocusComponent(item: DockMenuItem): Promise<void> {
  const isOpen = await isComponentOpen(item.id);
  if (isOpen) {
    const focused = await focusComponent(item.id);
    if (focused) return;
  }
  await launchMenuItem(item);
}
