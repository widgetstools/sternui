/**
 * URL Helper — environment-agnostic URL management with base URL support.
 */

import { platformContext } from '../core/PlatformContext.js';

let explicitBaseUrl: string | null = null;

export const setBaseUrl = (url: string): void => {
  explicitBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  platformContext.logger.info(`Base URL set to: ${explicitBaseUrl}`, undefined, 'urlHelper');
};

export const clearBaseUrl = (): void => { explicitBaseUrl = null; };

export const getCurrentBaseUrl = (): string => explicitBaseUrl || window.location.origin;

export const buildUrl = (path: string): string => {
  if (!path) return getCurrentBaseUrl() + '/';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') ||
      path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('file:')) {
    return path;
  }
  const base = getCurrentBaseUrl().replace(/\/$/, '');
  const separator = path.startsWith('/') ? '' : '/';
  return `${base}${separator}${path}`;
};

export const getBaseUrlConfig = () => ({
  explicitUrl: explicitBaseUrl,
  currentUrl: getCurrentBaseUrl(),
  isExplicit: !!explicitBaseUrl,
});

export const initializeBaseUrlFromManifest = async (): Promise<void> => {
  if (typeof window !== 'undefined' && (window as any).fin) {
    try {
      const fin = (window as any).fin;
      const app = await fin.Application.getCurrent();
      const manifest = await app.getManifest() as any;
      if (manifest.customSettings?.baseUrl) {
        setBaseUrl(manifest.customSettings.baseUrl);
      }
    } catch (error) {
      platformContext.logger.warn('Could not initialize base URL from manifest', error, 'urlHelper');
    }
  }
};
