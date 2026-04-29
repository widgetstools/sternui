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

// ─── Seed-from-template (non-singleton dock launch) ─────────────────

describe('Seed-from-template — new dock-launched instance inherits template config', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('first load of a NEW non-singleton instance row clones the template payload', async () => {
    // Step 1: simulate a previous test-launch that authored the
    // template (a row at configId="blotter-positions" with isTemplate=true).
    const templateFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const templateAdapter = templateFactory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });
    await templateAdapter.saveProfile(snapshot('Default', 'blotter-positions'));
    await templateAdapter.saveGridLevelData?.('blotter-positions', { liveProviderId: 'dp-xyz', mode: 'live' });
    expect(cm.rows.size).toBe(1);

    // Step 2: dock-launch a new non-singleton instance — its
    // instanceId is a fresh UUID, NOT the template configId.
    const instFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const instAdapter = instFactory({
      instanceId: 'inst-uuid-7f3a',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    // First load — should seed from the template eagerly.
    const profiles = await instAdapter.listProfiles('inst-uuid-7f3a');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Default');

    // Instance row was written with the seeded payload.
    expect(cm.rows.size).toBe(2);
    const instRow = cm.rows.get('inst-uuid-7f3a')!;
    expect(instRow.componentType).toBe('blotter');
    expect(instRow.componentSubType).toBe('positions');
    expect(instRow.isTemplate).toBe(false);                 // INSTANCE, not template

    // gridLevelData also came across.
    const gld = await instAdapter.loadGridLevelData?.('inst-uuid-7f3a');
    expect(gld).toEqual({ liveProviderId: 'dp-xyz', mode: 'live' });
  });

  it('does NOT seed when launched as a SINGLETON (instanceId === templateId)', async () => {
    // Singleton: the launcher uses templateId AS the instanceId.
    // Loading should hit the template row directly — no seed step needed.
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',                          // === templateConfigId
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: true },
    });
    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));

    expect(cm.rows.size).toBe(1);
    const profiles = await adapter.listProfiles('blotter-positions');
    expect(profiles).toHaveLength(1);
    expect(cm.rows.size).toBe(1);                              // no extra row created
  });

  it('does NOT seed when no template exists for this (componentType, componentSubType)', async () => {
    // Cold launch — no template row in storage yet. The new
    // instance load returns null (no profiles to show), and no row
    // is written until the user saves something.
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'inst-no-template',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    const profiles = await adapter.listProfiles('inst-no-template');
    expect(profiles).toEqual([]);
    expect(cm.rows.size).toBe(0);                             // no eager write
  });

  it('does NOT re-seed when the row already exists (a fresh adapter on an existing row reads it as-is)', async () => {
    // Seed the template
    const tFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    await tFactory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    }).saveProfile(snapshot('TemplateProfile', 'blotter-positions'));

    // First adapter: triggers eager seed (row didn't exist) and then
    // the user customises by renaming the seeded profile.
    const firstFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const first = firstFactory({
      instanceId: 'inst-already-saved',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    await first.listProfiles('inst-already-saved'); // seeds row from template
    // User renames the seeded profile to 'My Layout' (saveProfile with the
    // same id updates in place, so the row still has exactly one profile).
    await first.saveProfile({ ...snapshot('TemplateProfile', 'inst-already-saved'), name: 'My Layout' });
    expect((await first.listProfiles('inst-already-saved')).map((p) => p.name)).toEqual(['My Layout']);

    // SECOND adapter on the SAME row — this is the key check: a fresh
    // factory + fresh adapter (closure-flag is false again) must NOT
    // re-seed, because the row already exists.
    const secondFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const second = secondFactory({
      instanceId: 'inst-already-saved',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    const profiles = await second.listProfiles('inst-already-saved');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('My Layout');                // not 'TemplateProfile'
  });

  it('two concurrent adapters racing to seed do NOT throw VersionConflict — both return the same payload', async () => {
    // Reproduces the production-observed race: a single hosted MarketsGrid
    // builds two adapters from the same factory (one for gridLevelData in
    // MarketsGridContainer, one for profiles in the inner <MarketsGrid>'s
    // ProfileManager). Each has its own seedAttempted flag, so both
    // attempt the seed in parallel against the empty instance row.
    // Without the conflict-recovery branch the loser of the race throws
    // ProfileSetVersionConflictError and ProfileManager.boot fails.

    // Author template with profiles + gridLevelData
    const tFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const tAdapter = tFactory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });
    await tAdapter.saveProfile(snapshot('Default', 'blotter-positions'));
    await tAdapter.saveGridLevelData?.('blotter-positions', { liveProviderId: 'dp-xyz', mode: 'live' });

    // Two SEPARATE adapters on the SAME instance row — mirrors the
    // dual-adapter pattern in MarketsGridContainer + <MarketsGrid>.
    const factoryA = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapterA = factoryA({
      instanceId: 'inst-race',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    const factoryB = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapterB = factoryB({
      instanceId: 'inst-race',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    // Race them in parallel — Promise.all surfaces any rejection.
    const [profilesA, gldB] = await Promise.all([
      adapterA.listProfiles('inst-race'),
      adapterB.loadGridLevelData?.('inst-race'),
    ]);

    // Both succeeded; both saw the seeded data.
    expect(profilesA).toHaveLength(1);
    expect(profilesA[0].name).toBe('Default');
    expect(gldB).toEqual({ liveProviderId: 'dp-xyz', mode: 'live' });
    // Exactly one row was written for the instance (no duplicates).
    expect(cm.rows.has('inst-race')).toBe(true);
  });

  it('seeded instance is INDEPENDENT — later template edits do NOT propagate', async () => {
    // Author template
    const tFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const tAdapter = tFactory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });
    await tAdapter.saveProfile(snapshot('Default', 'blotter-positions'));

    // Spawn instance — seeds from template
    const iFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const iAdapter = iFactory({
      instanceId: 'inst-1',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    await iAdapter.listProfiles('inst-1'); // triggers seed

    // Now author a SECOND template profile
    await tAdapter.saveProfile({ ...snapshot('Aggressive', 'blotter-positions') });
    expect((await tAdapter.listProfiles('blotter-positions')).length).toBe(2);

    // Instance still has only the originally-seeded profile.
    const instProfiles = await iAdapter.listProfiles('inst-1');
    expect(instProfiles).toHaveLength(1);
    expect(instProfiles[0].name).toBe('Default');
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
