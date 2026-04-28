/**
 * Identity-aware persistence invariants for `createConfigServiceStorage`.
 *
 * These exist because the user-reported bug was a registered-component
 * row landing on disk with the legacy hardcoded discriminator:
 *
 *   {
 *     "configId": "blotter-positions",
 *     "componentType": "markets-grid-profile-set",  ← wrong (should be "blotter")
 *     "componentSubType": "",                        ← wrong (should be "positions")
 *     "isTemplate": false                            ← wrong (should be true on test-launch)
 *   }
 *
 * The four invariants the storage adapter must uphold when a
 * `registeredIdentity` is supplied (i.e. the view was launched from a
 * Registry Editor entry):
 *
 *   1. configId === ${componentType}-${componentSubType} for templates,
 *      ${componentType}-${componentSubType} for the per-grid-instance
 *      profile-set row (since a single registered component = a single
 *      row in this storage).
 *   2. componentType === registeredIdentity.componentType  (ALWAYS)
 *   3. componentSubType === registeredIdentity.componentSubType  (ALWAYS)
 *   4. isTemplate === registeredIdentity.isTemplate  (ALWAYS)
 *
 * When no identity is supplied (legacy callers / unit tests), the
 * adapter falls back to the historical hardcoded values so existing
 * data keeps loading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigServiceStorage } from './profile-storage';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './config-manager';
import type { ProfileSnapshot } from '@marketsui/core';

// ─── In-memory ConfigManager fake ───────────────────────────────────

interface FakeManager {
  rows: Map<string, AppConfigRow>;
  saveConfig: ConfigManager['saveConfig'];
  getConfig: ConfigManager['getConfig'];
}

function makeFakeConfigManager(): FakeManager {
  const rows = new Map<string, AppConfigRow>();
  return {
    rows,
    saveConfig: async (row: AppConfigRow) => { rows.set(row.configId, row); },
    getConfig: async (id: string) => rows.get(id),
  } as unknown as FakeManager;
}

const REGISTERED = {
  componentType: 'blotter',
  componentSubType: 'positions',
};

function snapshot(name: string, gridId: string): ProfileSnapshot {
  return {
    id: name === 'Default' ? '__default__' : `id-${name}`,
    gridId,
    name,
    state: {},
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

// ─── Invariants 2/3/4 — identity stamps replace hardcoded values ──

describe('createConfigServiceStorage — identity-aware persistence (TEST-LAUNCH)', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('saves a row with componentType + componentSubType + isTemplate from registered identity', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));

    const row = cm.rows.get('blotter-positions')!;
    expect(row).toBeDefined();
    expect(row.componentType).toBe('blotter');             // (Invariant 3)
    expect(row.componentSubType).toBe('positions');        // (Invariant 3)
    expect(row.isTemplate).toBe(true);                      // (Invariant 4)
    expect(row.configId).toBe('blotter-positions');         // (Invariant 1)
  });

  it('isTemplate === false on the row when launched as a per-instance (dock-launch)', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'inst-uuid-7f3a',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'inst-uuid-7f3a'));

    const row = cm.rows.get('inst-uuid-7f3a')!;
    expect(row.componentType).toBe('blotter');             // type still matches registered
    expect(row.componentSubType).toBe('positions');        // subtype still matches registered
    expect(row.isTemplate).toBe(false);                     // dock-launch ⇒ not template
  });

  it('singleton flag mirrored from identity onto the row', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: true },
    });
    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));
    expect(cm.rows.get('blotter-positions')!.singleton).toBe(true);
  });

  it('subsequent saveGridLevelData calls preserve identity (read-modify-write does NOT regress to hardcoded)', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));
    await adapter.saveGridLevelData?.('blotter-positions', { liveProviderId: 'dp-xyz' });

    const row = cm.rows.get('blotter-positions')!;
    expect(row.componentType).toBe('blotter');
    expect(row.componentSubType).toBe('positions');
    expect(row.isTemplate).toBe(true);
    // payload's gridLevelData is also persisted alongside the profiles
    expect((row.payload as { gridLevelData?: { liveProviderId?: string } }).gridLevelData?.liveProviderId).toBe('dp-xyz');
  });
});

// ─── Back-compat: no identity → legacy hardcoded fields ────────────

describe('createConfigServiceStorage — back-compat (NO identity supplied)', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('falls back to "markets-grid-profile-set" / "" / false when no registeredIdentity', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({ instanceId: 'legacy-instance', appId: 'TestApp', userId: 'dev1' });

    await adapter.saveProfile(snapshot('Default', 'legacy-instance'));

    const row = cm.rows.get('legacy-instance')!;
    expect(row.componentType).toBe('markets-grid-profile-set');
    expect(row.componentSubType).toBe('');
    expect(row.isTemplate).toBe(false);
  });
});

// ─── Smoke: replay the user-reported broken state ───────────────────

describe('Smoke: a test-launched blotter saves its profile-set with the correct identity', () => {
  it('produces a row exactly matching the user-asked-for shape', async () => {
    const cm = makeFakeConfigManager();

    // Mimic exactly what HostedComponent will do for a test-launch
    // of a registered "blotter / positions" entry:
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',                        // ← `${type}-${subtype}`
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: {
        componentType: 'blotter',
        componentSubType: 'positions',
        isTemplate: true,                                       // ← test-launch
        singleton: false,
      },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));

    const row = cm.rows.get('blotter-positions')!;
    // Match the user's spec, field-by-field:
    expect(row.configId).toBe('blotter-positions');             // (1)
    expect(row.componentType).toBe('blotter');                  // (3)
    expect(row.componentSubType).toBe('positions');             // (3)
    expect(row.isTemplate).toBe(true);                          // (4)
  });
});
