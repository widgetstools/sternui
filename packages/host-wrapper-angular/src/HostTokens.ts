import { InjectionToken } from '@angular/core';
import type { RuntimePort } from '@marketsui/runtime-port';
import type { ConfigClient } from '@marketsui/config-service';

/**
 * Injection tokens used by `HostService` to read its dependencies
 * from the Angular injector. Apps provide these via
 * `provideHostWrapper(...)` at the app root.
 */

export const HOST_RUNTIME = new InjectionToken<RuntimePort>('@marketsui/host-wrapper-angular/HOST_RUNTIME');

export const HOST_CONFIG_MANAGER = new InjectionToken<ConfigClient>('@marketsui/host-wrapper-angular/HOST_CONFIG_MANAGER');

/** Optional — apps that drive REST persistence pass the configUrl here. */
export const HOST_CONFIG_URL = new InjectionToken<string>('@marketsui/host-wrapper-angular/HOST_CONFIG_URL');
