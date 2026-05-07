import type { EnvironmentProviders, Provider } from '@angular/core';
import type { RuntimePort } from '@starui/runtime-port';
import type { ConfigClient } from '@starui/config-service';
import { HOST_CONFIG_MANAGER, HOST_CONFIG_URL, HOST_RUNTIME } from './HostTokens';

export interface HostWrapperOptions {
  /** The runtime port. Browser or OpenFin. Required. */
  runtime: RuntimePort;
  /** The config manager. Required. */
  configManager: ConfigClient;
  /** Optional URL of the config service backend (for REST consumers). */
  configUrl?: string;
}

/**
 * `provideHostWrapper(opts)` — register the HostService dependencies
 * at the app root.
 *
 * Mirrors React's `<HostWrapper runtime={...} configManager={...}>`
 * — the React wrapper is a component because React's context model
 * requires it; Angular uses DI instead so apps register providers.
 *
 * Usage in an Angular app's `appConfig`:
 *
 *   import { provideHostWrapper } from '@starui/host-wrapper-angular';
 *   import { BrowserRuntime } from '@starui/runtime-browser';
 *   import { createConfigClient } from '@starui/config-service';
 *
 *   export const appConfig: ApplicationConfig = {
 *     providers: [
 *       provideHostWrapper({
 *         runtime: new BrowserRuntime({ identity: { appId, userId } }),
 *         configManager: createConfigClient({}),
 *       }),
 *     ],
 *   };
 *
 * Components then inject the singleton service:
 *
 *   constructor(private host: HostService) {
 *     this.host.windowClosing$.subscribe(() => this.persist());
 *   }
 */
export function provideHostWrapper(opts: HostWrapperOptions): Array<Provider | EnvironmentProviders> {
  const providers: Array<Provider> = [
    { provide: HOST_RUNTIME, useValue: opts.runtime },
    { provide: HOST_CONFIG_MANAGER, useValue: opts.configManager },
  ];
  if (opts.configUrl !== undefined) {
    providers.push({ provide: HOST_CONFIG_URL, useValue: opts.configUrl });
  }
  return providers;
}
