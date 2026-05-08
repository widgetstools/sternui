import { Injectable, inject } from '@angular/core';
import type {
  DataServices,
  AppDataMirror,
  SharedWorkerDataServicesClient,
} from '@starui/data-services';
import { DataProviderConfigStore } from '@starui/data-services';
import type { ConfigManager } from '@starui/config-service';
import { DATA_SERVICES } from './tokens';

/**
 * Root data-services service — Angular twin of React's
 * `useDataServices()` context value.
 *
 * Exposes the four primitives every consumer needs:
 *   - `client` — SharedWorker MessagePort wrapper for live data
 *   - `appData` — main-thread AppDataMirror (sync reads, async writes)
 *   - `configStore` — DataProviderConfigStore wrapper for editor flows
 *   - `configManager` — raw ConfigManager (escape hatch for non-data-services persistence)
 *
 * Singleton per Angular injector via `providedIn: 'root'`. The
 * `provideDataServices()` factory must be present in the app's
 * providers; without it, `inject(DATA_SERVICES)` throws and this
 * service can't construct.
 */
@Injectable({ providedIn: 'root' })
export class DataServicesService {
  private readonly services: DataServices = inject(DATA_SERVICES);

  /** SharedWorker-backed client for live provider subscriptions. */
  readonly client: SharedWorkerDataServicesClient = this.services.client;

  /** Main-thread AppData mirror — sync reads, async writes. */
  readonly appData: AppDataMirror = this.services.appData;

  /** Persistence helper for editor flows (loadable provider configs). */
  readonly configStore: DataProviderConfigStore = new DataProviderConfigStore(
    this.services.configManager,
  );

  /** Raw ConfigManager — escape hatch when consumers need direct access. */
  readonly configManager: ConfigManager = this.services.configManager;

  /**
   * Resolves once the AppDataMirror's first snapshot has arrived.
   * Same Promise as `services.ready` from `bootstrapDataServices()`.
   *
   * Use cases: Angular's `provideAppInitializer()` to defer app boot
   * until AppData is hydrated (the Angular analogue of React's eager
   * mode).
   */
  readonly ready: Promise<void> = this.services.ready;
}
