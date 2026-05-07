/// <reference path="../types/openfin.d.ts" />

/**
 * OpenFin Cache Management Utilities
 */

import { platformContext } from '../core/PlatformContext.js';

export async function clearOpenFinCache(): Promise<void> {
  try {
    if (typeof fin === 'undefined') return;
    const app = await fin.Application.getCurrent();
    await (app as any).clearCache?.();
    platformContext.logger.info('OpenFin cache cleared', undefined, 'openfinCache');
  } catch (error) {
    platformContext.logger.error('Failed to clear OpenFin cache', error, 'openfinCache');
    throw error;
  }
}

export async function clearCacheAndReload(): Promise<void> {
  try {
    await clearOpenFinCache();
    await new Promise(resolve => setTimeout(resolve, 500));
    if (typeof fin !== 'undefined') {
      const currentWindow = await fin.Window.getCurrent();
      await currentWindow.reload();
    } else {
      window.location.reload();
    }
  } catch (error) {
    platformContext.logger.error('Failed to clear cache and reload', error, 'openfinCache');
    throw error;
  }
}
