/**
 * @starui/config-service-angular — Angular Provider + injectable for
 * `@starui/config-service`. Mirrors `@starui/config-service-react` over
 * the same vanilla TS core (`@starui/config-service`).
 *
 * Wire at app root:
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
 * Inject in components:
 *
 *     constructor(private cs: ConfigServiceClient) {}
 *
 *     ngOnInit() {
 *       const cm = this.cs.configManager;
 *       const appId = this.cs.appId;
 *       const ctx = this.cs.applicationContext;
 *     }
 */

export { CONFIG_SERVICE_OPTIONS, type ConfigServiceOptions } from './tokens';
export { provideConfigService } from './provider';
export { ConfigServiceClient } from './ConfigServiceClient';
