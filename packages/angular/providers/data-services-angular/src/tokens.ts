import { InjectionToken } from '@angular/core';
import type { DataServices } from '@starui/data-services';

/**
 * DI token holding the `DataServices` bundle returned by
 * `bootstrapDataServices(...)`. Registered by `provideDataServices()`.
 *
 * Components don't read this directly — they `inject(DataServicesService)`
 * which exposes the bundle's pieces through a single ergonomic
 * service. The token exists so the service has something to inject.
 */
export const DATA_SERVICES = new InjectionToken<DataServices>(
  '@starui/data-services-angular#services',
);
