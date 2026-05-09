/**
 * Injection tests for `@starui/config-service-angular`.
 *
 * We use `Injector.create` rather than the full Angular TestBed
 * because the monorepo doesn't install
 * `@angular/platform-browser-dynamic` — the bare DI container is
 * enough to verify `provideConfigService(...)` registers the right
 * tokens, `ConfigServiceClient` is constructable from them, `init()`
 * resolves, and `ngOnDestroy` tears the manager down.
 *
 * `fake-indexeddb/auto` (loaded via `test/setup.ts`) backs the real
 * `ConfigManager` Dexie database the client opens during `init()`,
 * so the suite exercises the actual init / dispose path that
 * production code follows.
 */

import { describe, expect, it, vi } from 'vitest';
import { Injector } from '@angular/core';

import type { AppDataMirrorHandle } from '@starui/config-service';
import { DataServicesService } from '@starui/data-services-angular';

// Imported AFTER `fake-indexeddb/auto` is installed via the Vitest
// setup file so any module-init Dexie work is satisfied by the shim.
import {
  CONFIG_SERVICE_OPTIONS,
  ConfigServiceClient,
  type ConfigServiceOptions,
} from './index';

interface FakeAppData extends AppDataMirrorHandle {
  store: Map<string, unknown>;
  setCalls: Array<{ name: string; key: string; value: unknown }>;
}

function createFakeAppData(): FakeAppData {
  const store = new Map<string, unknown>();
  const setCalls: Array<{ name: string; key: string; value: unknown }> = [];
  const handle: AppDataMirrorHandle = {
    async set(name, key, value) {
      setCalls.push({ name, key, value });
      store.set(`${name} ${key}`, value);
    },
    get(name, key) {
      return store.get(`${name} ${key}`);
    },
    ready() {
      return Promise.resolve();
    },
  };
  return Object.assign(handle, { store, setCalls });
}

function createTestClient(opts: ConfigServiceOptions): {
  injector: Injector;
  appData: FakeAppData;
  client: ConfigServiceClient;
} {
  const appData = createFakeAppData();
  const fakeDataServices = { appData } as unknown as DataServicesService;
  const injector = Injector.create({
    providers: [
      { provide: CONFIG_SERVICE_OPTIONS, useValue: opts },
      { provide: DataServicesService, useValue: fakeDataServices },
      { provide: ConfigServiceClient, useClass: ConfigServiceClient },
    ],
  });
  const client = injector.get(ConfigServiceClient);
  return { injector, appData, client };
}

describe('ConfigServiceClient', () => {
  it('exposes configManager / storage / identity / applicationContext after init()', async () => {
    const { client, appData } = createTestClient({
      identity: { userId: 'alice', displayName: 'Alice' },
      appId: 'TestApp',
    });

    await client.init();

    expect(client.appId).toBe('TestApp');
    expect(client.userId).toBe('alice');
    expect(typeof client.storage).toBe('function');
    expect(client.configManager.getAppId()).toBe('TestApp');
    expect(client.applicationContext.AppId).toBe('TestApp');
    expect(client.applicationContext.LoggedInUser).toEqual({
      userId: 'alice',
      displayName: 'Alice',
    });
    expect(client.applicationContext.ImpersonatedUser).toBe(null);
    expect(client.applicationContext.LoggedInUserProfile).toEqual({
      roles: [],
      permissions: [],
    });

    // Sanity: ConfigManager actually published into the fake mirror.
    expect(appData.store.get('ApplicationContext AppId')).toBe('TestApp');
    expect(appData.store.get('ApplicationContext LoggedInUser')).toEqual({
      userId: 'alice',
      displayName: 'Alice',
    });

    client.ngOnDestroy();
  });

  it('throws when applicationContext is read before init()', () => {
    const { client } = createTestClient({
      identity: { userId: 'bob' },
      appId: 'TestApp',
    });

    expect(() => client.applicationContext).toThrow(
      /ConfigServiceClient\.applicationContext read before init/,
    );

    client.ngOnDestroy();
  });

  it('disposes the ConfigManager on ngOnDestroy', async () => {
    const { client } = createTestClient({
      identity: { userId: 'carol' },
      appId: 'TestApp',
    });

    await client.init();

    const disposeSpy = vi.spyOn(client.configManager, 'dispose');
    client.ngOnDestroy();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
