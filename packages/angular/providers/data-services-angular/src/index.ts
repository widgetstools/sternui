/**
 * @starui/data-services-angular — Angular adapter for the
 * data-services runtime. Mirrors `@starui/data-services-react` over
 * the same vanilla TS core (`@starui/data-services`).
 *
 * Wire at app root:
 *
 *   import { ApplicationConfig } from '@angular/core';
 *   import { bootstrapDataServices } from '@starui/data-services';
 *   import { provideDataServices } from '@starui/data-services-angular';
 *
 *   const dataServices = bootstrapDataServices({ appName, worker, configManager, userId });
 *
 *   export const appConfig: ApplicationConfig = {
 *     providers: [
 *       provideDataServices({ services: dataServices }),
 *     ],
 *   };
 *
 * Inject in components:
 *
 *   constructor(private ds: DataServicesService) {}
 *
 *   appData = injectAppData('positions');         // Signal-backed reactive view
 *   stream  = injectProviderStream(id, cfg);      // Observables + DestroyRef cleanup
 *   cfg$    = injectDataProviderConfig$(id);      // RxJS one-shot
 */

export { DATA_SERVICES } from './tokens';
export { provideDataServices, type DataServicesProviderOptions } from './provider';
export { DataServicesService } from './DataServicesService';
export {
  injectAppData,
  injectAppDataStore,
  type AppDataHandle,
  type AppDataStoreView,
} from './inject-app-data';
export {
  injectProviderStream,
  injectProviderStats$,
  type ProviderStreamView,
} from './inject-provider-stream';
export {
  injectDataProviderConfig$,
  injectDataProvidersList$,
  type DataProviderConfigView,
  type DataProvidersListView,
} from './inject-data-provider-config';
export { injectResolvedCfg } from './inject-resolved-cfg';
