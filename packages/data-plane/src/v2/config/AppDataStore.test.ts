/**
 * AppDataStore tests — confirm the reactive snapshot + listener
 * fan-out behave correctly without dragging in a real Dexie.
 *
 * The stub ConfigManager keeps a Map<configId, AppConfigRow> in
 * memory and reports back via `getConfigsByUser` filtered by userId,
 * matching the production semantics that public rows live under
 * userId='system'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AppDataStore } from './AppDataStore';
import type { AppConfigRow, ConfigManager } from '@marketsui/config-service';

function makeStubConfigManager(): ConfigManager & { _rows: Map<string, AppConfigRow> } {
  const rows = new Map<string, AppConfigRow>();
  const stub = {
    _rows: rows,
    async getConfigsByUser(userId: string) {
      return [...rows.values()].filter((r) => r.userId === userId);
    },
    async getConfig(id: string) { return rows.get(id); },
    async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
    async deleteConfig(id: string) { rows.delete(id); },
  };
  return stub as unknown as ConfigManager & { _rows: Map<string, AppConfigRow> };
}

describe('AppDataStore', () => {
  let cm: ConfigManager & { _rows: Map<string, AppConfigRow> };

  beforeEach(() => {
    cm = makeStubConfigManager();
  });

  it('loads existing rows on first ready()', async () => {
    cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

    const store = new AppDataStore(cm, 'alice');
    await store.ready();
    expect(store.get('positions', 'asOfDate')).toBe('2026-04-01');
  });

  it('set() persists + updates snapshot + fires listeners', async () => {
    const store = new AppDataStore(cm, 'alice');
    await store.ready();

    let calls = 0;
    store.subscribe(() => { calls += 1; });

    await store.set('positions', 'asOfDate', '2026-05-01');

    expect(calls).toBe(1);
    expect(store.get('positions', 'asOfDate')).toBe('2026-05-01');
    // Persisted in the stub.
    const persistedRow = [...cm._rows.values()].find((r) => r.displayText === 'positions');
    expect(persistedRow).toBeTruthy();
  });

  it('public rows ride alongside the user own rows; user rows override on name collision', async () => {
    cm._rows.set('ad-pub', {
      configId: 'ad-pub', appId: 'TestApp', userId: 'system',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'shared',
      payload: { values: { color: 'blue' } },
      createdBy: 'sys', updatedBy: 'sys',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);
    cm._rows.set('ad-own', {
      configId: 'ad-own', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'shared',
      payload: { values: { color: 'red' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '1', updatedTime: '1',
    } as AppConfigRow);

    const store = new AppDataStore(cm, 'alice');
    await store.ready();
    // Insertion order in replaceSnapshot is public first, own second.
    // byName is upserted last-write-wins → user's own value wins.
    expect(store.get('shared', 'color')).toBe('red');
  });

  it('remove() drops from snapshot and fires listeners', async () => {
    const store = new AppDataStore(cm, 'alice');
    await store.ready();
    const saved = await store.upsertConfig({
      configId: '',
      name: 'positions',
      isPublic: false,
      values: { asOfDate: '2026-04-01' },
      userId: 'alice',
    });

    let calls = 0;
    store.subscribe(() => { calls += 1; });

    await store.remove(saved.configId);

    expect(calls).toBe(1);
    expect(store.get('positions', 'asOfDate')).toBeUndefined();
  });
});
