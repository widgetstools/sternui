import { InjectionToken } from '@angular/core';
import type { AppIdentity } from '@starui/config-service';

/**
 * Inputs the host passes to `provideConfigService(...)`. Carried on a
 * DI token so `ConfigServiceClient` can read them in its constructor
 * (Angular's analogue of React's prop-drilling). Mirrors the
 * `<ConfigServiceProvider>` props in `@starui/config-service-react`.
 */
export interface ConfigServiceOptions {
  /**
   * Authenticated identity supplied by the host app. Drives audit
   * stamping and (in REST mode) outbound `Authorization: Bearer …`
   * headers via `identity.getAccessToken`.
   */
  identity: AppIdentity;
  /** The app this Provider's ConfigManager is scoped to. Becomes
   *  `ApplicationContext.AppId`. */
  appId: string;
  /** Optional seed JSON URL for first-run local bootstrap (auth
   *  tables — appRegistry / userProfile / roles / permissions). */
  seedUrl?: string;
  /** Optional REST base URL. When set, writes go to REST first and
   *  Dexie second; reads stay local for speed. */
  restUrl?: string;
}

/**
 * DI token holding the `ConfigServiceOptions` registered by
 * `provideConfigService(...)`. Components do not read this directly —
 * `ConfigServiceClient` reads it during construction so consumers
 * inject the client and never see the options token.
 */
export const CONFIG_SERVICE_OPTIONS = new InjectionToken<ConfigServiceOptions>(
  '@starui/config-service-angular#options',
);
