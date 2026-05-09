import {
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders,
} from '@angular/core';

import { ConfigServiceClient } from './ConfigServiceClient';
import { CONFIG_SERVICE_OPTIONS, type ConfigServiceOptions } from './tokens';

/**
 * `provideConfigService(opts)` — Angular twin of React's
 * `<ConfigServiceProvider identity appId seedUrl? restUrl?>`. Returns
 * the providers needed to construct a live `ConfigServiceClient` in
 * the root injector and await `ConfigManager.init()` before app
 * bootstrap completes.
 *
 * Layering — must compose under `provideDataServices(...)` so the
 * `ConfigServiceClient` can inject `DataServicesService` for the
 * `ApplicationContext` AppData publishing path.
 *
 * Usage in `app.config.ts`:
 *
 *     import { ApplicationConfig } from '@angular/core';
 *     import { bootstrapDataServices } from '@starui/data-services';
 *     import { provideDataServices } from '@starui/data-services-angular';
 *     import { provideConfigService } from '@starui/config-service-angular';
 *
 *     const services = bootstrapDataServices({ ... });
 *
 *     export const appConfig: ApplicationConfig = {
 *       providers: [
 *         provideDataServices({ services }),
 *         provideConfigService({
 *           identity: { userId: 'dev1', displayName: 'Dev User' },
 *           appId: 'demo-angular',
 *         }),
 *       ],
 *     };
 *
 * The `provideAppInitializer` step awaits `ConfigManager.init()` so
 * by the time any component injects `ConfigServiceClient`,
 * `applicationContext` is populated and the AppData mirror has the
 * `ApplicationContext` rows the rest of the app reads.
 */
export function provideConfigService(
  opts: ConfigServiceOptions,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CONFIG_SERVICE_OPTIONS, useValue: opts },
    provideAppInitializer(() => inject(ConfigServiceClient).init()),
  ]);
}
