import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  createConfigManager,
  createConfigServiceStorage,
  type ApplicationContext,
  type ConfigManager,
  type ProfileStorageFactory,
} from '@starui/config-service';
import { DataServicesService } from '@starui/data-services-angular';

import { CONFIG_SERVICE_OPTIONS } from './tokens';

/**
 * Root config-service client — Angular twin of React's
 * `useConfigService()` context value.
 *
 * Constructs a `ConfigManager` from the options registered by
 * `provideConfigService(...)`, exposes the live
 * `{ configManager, storage, appId, userId, applicationContext }`
 * surface that consumers read, and tears the manager down in
 * `ngOnDestroy`. Bootstrap is awaited via `provideAppInitializer(...)`
 * inside `provideConfigService`, so by the time any component injects
 * this client, `init()` has already resolved and
 * `applicationContext` is populated.
 *
 * Singleton per Angular injector via `providedIn: 'root'`. The
 * `provideConfigService(...)` factory must be present in the app's
 * providers; without it, `inject(CONFIG_SERVICE_OPTIONS)` throws and
 * this client can't construct.
 */
@Injectable({ providedIn: 'root' })
export class ConfigServiceClient implements OnDestroy {
  private readonly options = inject(CONFIG_SERVICE_OPTIONS);
  private readonly dataServices = inject(DataServicesService);

  /**
   * The live `ConfigManager` constructed during root injection.
   * `init()` is driven by `provideAppInitializer` inside
   * `provideConfigService(...)`, so by the time a component reads
   * this the manager is fully hydrated.
   */
  readonly configManager: ConfigManager = createConfigManager({
    appId: this.options.appId,
    identity: this.options.identity,
    seedConfigUrl: this.options.seedUrl,
    configServiceRestUrl: this.options.restUrl,
    dataServices: this.dataServices,
  });

  /**
   * Pre-bound `ProfileStorageFactory` ready to hand to
   * `<MarketsGrid storage={...} />`. Constructed once against the
   * same `ConfigManager` this client owns.
   */
  readonly storage: ProfileStorageFactory = createConfigServiceStorage({
    configManager: this.configManager,
  });

  /** Convenience copy of the appId the host wired through
   *  `provideConfigService`. Same as
   *  `applicationContext.AppId` after `init()`. */
  readonly appId: string = this.options.appId;

  /** Convenience copy of the identity's `userId`. Reactive consumers
   *  should read live identity off `applicationContext` (or the
   *  AppData mirror) instead. */
  readonly userId: string = this.options.identity.userId;

  private _applicationContext: ApplicationContext | null = null;

  /**
   * Point-in-time snapshot of the four `ApplicationContext` AppData
   * keys the manager publishes during `init()`. Populated by
   * `init()`; reading before the bootstrap initializer has run
   * throws so misuse fails fast instead of silently returning stale
   * data.
   */
  get applicationContext(): ApplicationContext {
    if (!this._applicationContext) {
      throw new Error(
        'ConfigServiceClient.applicationContext read before init() resolved — ' +
          'ensure provideConfigService() is in your application providers ' +
          'and the app initializer ran.',
      );
    }
    return this._applicationContext;
  }

  /**
   * Run by `provideAppInitializer(...)` inside `provideConfigService`.
   * Awaits `ConfigManager.init()`, then snapshots
   * `getApplicationContext()` so the sync getter returns it.
   */
  async init(): Promise<void> {
    await this.configManager.init();
    this._applicationContext = this.configManager.getApplicationContext();
  }

  ngOnDestroy(): void {
    this.configManager.dispose();
  }
}
