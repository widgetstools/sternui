import type { Provider } from '@angular/core';
import type { DataServices } from '@starui/data-services';
import { DATA_SERVICES } from './tokens';

export interface DataServicesProviderOptions {
  /**
   * Bundle returned by `bootstrapDataServices(...)`. Constructed at
   * app entry so the SharedWorker + AppDataMirror exist before the
   * Angular root injector resolves.
   */
  services: DataServices;
}

/**
 * `provideDataServices(opts)` — register the data-services bundle in
 * the root injector. Mirrors React's `<DataServicesProvider services>`
 * — the React adapter uses Context because React requires it; Angular
 * uses DI tokens.
 *
 * Usage in `app.config.ts`:
 *
 *   import { ApplicationConfig } from '@angular/core';
 *   import { bootstrapDataServices } from '@starui/data-services';
 *   import { provideDataServices } from '@starui/data-services-angular';
 *
 *   const services = bootstrapDataServices({
 *     appName: 'TestApp',
 *     worker: new SharedWorker(new URL('./data.sharedWorker.ts', import.meta.url), { type: 'module' }),
 *     configManager: createConfigManager({}),
 *     userId: LOGGED_IN_USER_ID,
 *   });
 *
 *   export const appConfig: ApplicationConfig = {
 *     providers: [provideDataServices({ services })],
 *   };
 *
 * `mode: 'eager'` parity (suspend-until-ready via `provideAppInitializer`)
 * is a planned follow-up — v1 is lazy-only, matching React's
 * `mode: 'lazy'`.
 */
export function provideDataServices(opts: DataServicesProviderOptions): Provider[] {
  return [{ provide: DATA_SERVICES, useValue: opts.services }];
}
