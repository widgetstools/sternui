import type { ConfigPort } from '@starui/host';
import type { ConfigManager } from './ConfigManager.js';

export interface ConfigPortOptions {
  readonly configManager: ConfigManager;
  readonly appId: string;
  readonly userId: string;
}

/**
 * Minimal ConfigPort adapter over ConfigManager for GridHostContext.
 */
export function createConfigPort(opts: ConfigPortOptions): ConfigPort {
  const { configManager, appId, userId } = opts;
  return {
    appId,
    userId,
    subscribe(instanceId: string, fn: () => void) {
      return configManager.profiles.subscribe({ instanceId, appId, userId }, fn);
    },
  };
}
