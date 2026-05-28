import { describe, expect, it, vi } from 'vitest';
import type { ConfigManager, AppConfigRow } from '@starui/host-config';
import type { DataProviderConfig } from '@starui/types';
import { DataProviderConfigStore } from './store.js';

function mockRow(id: string, name = id): AppConfigRow {
  return {
    configId: id,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText: name,
    payload: {
      providerType: 'mock',
      keyColumn: 'id',
      __providerMeta: { public: true },
    },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function mockConfigManager(rows: AppConfigRow[] = []): ConfigManager {
  const map = new Map(rows.map((r) => [r.configId, r]));
  return {
    async getAllConfigsUnfiltered() { return [...map.values()]; },
    async getConfig(id: string) { return map.get(id); },
    async saveConfig(row: AppConfigRow) { map.set(row.configId, row); },
    async deleteConfig(id: string) { map.delete(id); },
  } as unknown as ConfigManager;
}

const mockProvider = (id: string, name: string): DataProviderConfig => ({
  providerId: id,
  name,
  providerType: 'mock',
  config: { providerType: 'mock', keyColumn: 'id' } as never,
  userId: 'system',
  public: true,
});

describe('DataProviderConfigStore — hub catalog invalidation', () => {
  it('save() notifies invalidateCatalog with the saved provider id', async () => {
    const invalidate = vi.fn();
    const store = new DataProviderConfigStore(mockConfigManager(), invalidate);

    await store.save(mockProvider('p1', 'First'), 'dev1');

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('p1');
  });

  it('remove() notifies invalidateCatalog with the removed id', async () => {
    const invalidate = vi.fn();
    const cm = mockConfigManager([mockRow('p1')]);
    const store = new DataProviderConfigStore(cm, invalidate);

    await store.remove('p1');

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('p1');
  });

  it('does not throw when invalidateCatalog rejects', async () => {
    const invalidate = vi.fn().mockRejectedValue(new Error('hub offline'));
    const store = new DataProviderConfigStore(mockConfigManager(), invalidate);

    await expect(store.save(mockProvider('p1', 'First'), 'dev1')).resolves.toBeDefined();
  });
});
