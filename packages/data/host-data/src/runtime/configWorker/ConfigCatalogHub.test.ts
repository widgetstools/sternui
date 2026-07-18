/**
 * ConfigCatalogHub + ConfigClient in-process tests (ADR Phase 2).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigCatalogHub } from './ConfigCatalogHub.js';
import { ConfigClient } from './ConfigClient.js';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import type { DataProviderConfig } from '@wellsfargo-starui/types';

function makeConfigManager(rows: Map<string, AppConfigRow>): ConfigManager {
  return {
    getConfig: vi.fn(async (id: string) => rows.get(id) ?? null),
    // DataProviderConfigStore.list uses listConfigs / query — stub via
    // the shapes ConfigCatalogCache's store expects through CM.
  } as unknown as ConfigManager;
}

function providerRow(id: string, name: string): AppConfigRow {
  const config: DataProviderConfig = {
    providerId: id,
    name,
    providerType: 'mock',
    config: { providerType: 'mock', keyColumn: 'id' },
  };
  return {
    configId: id,
    componentType: 'data-provider',
    displayText: name,
    ownerUserId: 'system',
    isPrivate: false,
    payload: config as unknown as Record<string, unknown>,
  } as AppConfigRow;
}

describe('ConfigCatalogHub', () => {
  it('serves get-provider after hydrate from injected catalog', async () => {
    const catalog = {
      isReady: () => true,
      hydrate: vi.fn(async () => undefined),
      get: vi.fn(() => null),
      ensure: vi.fn(async (id: string) => ({
        providerId: id,
        name: 'P',
        providerType: 'mock' as const,
        config: { providerType: 'mock' as const, keyColumn: 'id' },
      })),
      getProviderConfig: vi.fn(() => ({ providerType: 'mock' as const, keyColumn: 'id' })),
      list: vi.fn(() => []),
      invalidate: vi.fn(async () => undefined),
      upsert: vi.fn(),
    };
    const hub = new ConfigCatalogHub({
      configManager: makeConfigManager(new Map()),
      catalog,
    });
    await hub.hydrate();

    const messages: unknown[] = [];
    const port = { postMessage: (m: unknown) => { messages.push(m); } };
    await hub.handleRequest(port, {
      kind: 'config-get-provider',
      reqId: '1',
      providerId: 'p1',
    });
    expect(messages[0]).toMatchObject({
      kind: 'config-get-provider-ok',
      reqId: '1',
      ok: true,
      providerConfig: { providerType: 'mock', keyColumn: 'id' },
    });
  });

  it('broadcasts catalog-changed on invalidate', async () => {
    const catalog = {
      isReady: () => true,
      hydrate: vi.fn(async () => undefined),
      get: vi.fn(() => null),
      ensure: vi.fn(async () => null),
      getProviderConfig: vi.fn(() => null),
      list: vi.fn(() => []),
      invalidate: vi.fn(async () => undefined),
      upsert: vi.fn(),
    };
    const hub = new ConfigCatalogHub({
      configManager: makeConfigManager(new Map()),
      catalog,
    });
    const messages: unknown[] = [];
    const port = { postMessage: (m: unknown) => { messages.push(m); } };
    hub.trackPort(port);
    await hub.handleRequest(port, { kind: 'config-invalidate', reqId: 'i1', providerId: 'p1' });
    expect(catalog.invalidate).toHaveBeenCalledWith('p1');
    expect(messages.some((m) => (m as { kind: string }).kind === 'catalog-changed')).toBe(true);
    expect(messages.some((m) => (m as { kind: string }).kind === 'config-invalidate-ok')).toBe(true);
  });
});

describe('ConfigClient over MessageChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips ready + list + invalidate', async () => {
    const providers: DataProviderConfig[] = [{
      providerId: 'p1',
      name: 'Mock',
      providerType: 'mock',
      userId: 'system',
      config: { providerType: 'mock', keyColumn: 'id' },
    }];
    const catalog = {
      isReady: () => true,
      hydrate: vi.fn(async () => undefined),
      get: vi.fn((id: string) => providers.find((p) => p.providerId === id) ?? null),
      ensure: vi.fn(async (id: string) => providers.find((p) => p.providerId === id) ?? null),
      getProviderConfig: vi.fn((id: string) => providers.find((p) => p.providerId === id)?.config ?? null),
      list: vi.fn(() => [...providers]),
      invalidate: vi.fn(async () => undefined),
      upsert: vi.fn(),
    };
    const hub = new ConfigCatalogHub({
      configManager: makeConfigManager(new Map([['p1', providerRow('p1', 'Mock')]])),
      catalog,
    });
    await hub.hydrate();

    const { port1, port2 } = new MessageChannel();
    const hubPort = {
      postMessage: (m: unknown) => port2.postMessage(m),
    };
    port2.onmessage = (ev) => {
      void hub.handleRequest(hubPort, ev.data);
    };
    port2.start();

    const client = new ConfigClient(port1);
    await client.ready;

    const listed = await client.listProviders();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.providerId).toBe('p1');

    const cfg = await client.getProviderConfig('p1');
    expect(cfg).toMatchObject({ providerType: 'mock', keyColumn: 'id' });

    const changed: string[] = [];
    client.onCatalogChange((ev) => {
      if (ev.providerId) changed.push(ev.providerId);
    });
    await client.invalidate('p1');
    expect(catalog.invalidate).toHaveBeenCalledWith('p1');
    expect(changed).toContain('p1');

    client.close();
    port2.close();
  });
});
