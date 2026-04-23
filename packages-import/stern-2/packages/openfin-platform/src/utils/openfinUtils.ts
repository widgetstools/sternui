/// <reference path="../types/openfin.d.ts" />

/**
 * Simple OpenFin utility functions — direct API usage without complex abstractions.
 */

export { buildUrl, setBaseUrl, clearBaseUrl, getCurrentBaseUrl, getBaseUrlConfig, initializeBaseUrlFromManifest } from './urlHelper.js';

export const createWindow = (url: string, options: any = {}): Promise<any> =>
  fin.Window.create({ url, autoShow: true, bounds: { width: 1200, height: 800 }, ...options });

export const launchApp = (manifest: string): Promise<any> =>
  fin.Application.startFromManifest(manifest);

export const broadcastMessage = (topic: string, data: any): Promise<void> =>
  fin.InterApplicationBus.publish(topic, data);

export const subscribeToMessage = (topic: string, handler: (message: any, identity: any) => void): Promise<void> =>
  fin.InterApplicationBus.subscribe({ uuid: '*' }, topic, handler);

export const getCurrentWindow = (): any => fin.Window.getCurrent();

export const isOpenFin = () => typeof window !== 'undefined' && 'fin' in window;

export const setTheme = async (theme: 'light' | 'dark') => {
  const { getCurrentSync } = await import('@openfin/workspace-platform');
  const platform = getCurrentSync();
  await platform.Theme.setSelectedScheme(theme as any);
};
