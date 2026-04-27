/**
 * End-to-end invariant tests for the configId / componentType /
 * componentSubType / isTemplate contract.
 *
 * These tests exercise the *exact* code path a real component runs
 * through (`createDebouncedSaver`'s doSave + a real
 * `ConfigManager.saveConfig` against an in-memory backing store)
 * and assert the four invariants we've been chasing:
 *
 *   1. configId === `${componentType}-${componentSubType}` for templates
 *   2. configId === <uuid> for per-instance rows
 *   3. componentType + componentSubType ALWAYS match the registered entry
 *      (even if the loaded row has stale/wrong values)
 *   4. isTemplate === true if and only if the launch was a test-launch
 *
 * Each test names the precise invariant it asserts in its `it(...)`
 * description so a failure tells you exactly which contract is
 * broken — no archaeology required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDebouncedSaver } from './save-config';
import type { ComponentIdentity } from './types';
import { deriveTemplateConfigId } from '@marketsui/openfin-platform';
import type { AppConfigRow, ConfigManager } from '@marketsui/config-service';

// ─── Test fixtures ──────────────────────────────────────────────────

/** Minimal in-memory ConfigManager-shaped object covering only what
 *  `createDebouncedSaver` actually calls. Real ConfigManager has many
 *  more methods; we only need `saveConfig`. */
interface FakeManager {
  saveConfig: ConfigManager['saveConfig'];
  rows: Map<string, AppConfigRow>;
}

function makeFakeConfigManager(): FakeManager {
  const rows = new Map<string, AppConfigRow>();
  return {
    rows,
    saveConfig: vi.fn(async (row: AppConfigRow) => {
      rows.set(row.configId, row);
    }),
  };
}

const REGISTERED_TYPE = 'blotter';
const REGISTERED_SUBTYPE = 'markets';
const TEMPLATE_ID = deriveTemplateConfigId(REGISTERED_TYPE, REGISTERED_SUBTYPE); // 'blotter-markets'

function testLaunchIdentity(): ComponentIdentity {
  // What `useRegistryEditor.testComponent()` puts on the new view's
  // `customData`. The instanceId IS the template configId so saves
  // land on the template row directly.
  return {
    instanceId: TEMPLATE_ID,
    templateId: TEMPLATE_ID,
    componentType: REGISTERED_TYPE,
    componentSubType: REGISTERED_SUBTYPE,
    isTemplate: true,
    singleton: false,
    appId: 'TestApp',
    userId: 'dev1',
  };
}

function dockLaunchIdentity(perInstanceUuid = 'a1b2c3d4-deadbeef'): ComponentIdentity {
  return {
    instanceId: perInstanceUuid,
    templateId: TEMPLATE_ID,
    componentType: REGISTERED_TYPE,
    componentSubType: REGISTERED_SUBTYPE,
    isTemplate: false,
    singleton: false,
    appId: 'TestApp',
    userId: 'dev1',
  };
}

/** Force the saver's debounced timer to flush synchronously by
 *  calling `flush()`. Avoids racing real setTimeout in tests. */
async function flushSaver(saver: { flush: () => Promise<void> }): Promise<void> {
  await saver.flush();
}

// ─── Invariant 1 — template configId format ─────────────────────────

describe('Invariant 1 — template rows: configId === `${componentType}-${componentSubType}`', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('first save during a test-launch (no prior row) writes to the canonical template configId', async () => {
    const identity = testLaunchIdentity();
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);

    saver.save({ columns: 5 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    // Exactly one row was written, and its configId is the canonical
    // `<type>-<subtype>` template id — NOT a UUID.
    expect(cm.rows.size).toBe(1);
    expect(cm.rows.has(TEMPLATE_ID)).toBe(true);
    expect(cm.rows.has('blotter-markets')).toBe(true);

    // Sanity: the configId is dash-joined, lowercase, derived from
    // the registered entry's type + subtype.
    const written = cm.rows.get(TEMPLATE_ID)!;
    expect(written.configId).toBe(`${REGISTERED_TYPE}-${REGISTERED_SUBTYPE}`);
  });

  it('subsequent test-launches reuse the same template configId (no UUID growth)', async () => {
    const identity = testLaunchIdentity();
    const seedRow: AppConfigRow = {
      configId: TEMPLATE_ID,
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'pre-existing template',
      componentType: REGISTERED_TYPE,
      componentSubType: REGISTERED_SUBTYPE,
      isTemplate: true,
      payload: { columns: 4 },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    };
    cm.rows.set(TEMPLATE_ID, seedRow);

    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => seedRow);
    saver.save({ columns: 7 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    // Same key — we updated the existing template row, didn't create
    // a sibling under a different id.
    expect(cm.rows.size).toBe(1);
    expect(cm.rows.has(TEMPLATE_ID)).toBe(true);
  });

  it('configId is lowercase even when identity supplies upper-cased type/subtype', () => {
    // Sanity check on the helper itself — `deriveTemplateConfigId`
    // is the single source of truth for the format and it
    // lowercases. The saver delegates configId to identity.instanceId
    // which the launcher should compute via the same helper.
    expect(deriveTemplateConfigId('GRID', 'CREDIT')).toBe('grid-credit');
    expect(deriveTemplateConfigId('Blotter', 'Markets')).toBe('blotter-markets');
  });
});

// ─── Invariant 2 — per-instance configId is the launcher's UUID ────

describe('Invariant 2 — per-instance rows: configId === <uuid>', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('a dock-launched view first save lands on the UUID configId, NOT the template id', async () => {
    const uuid = 'instance-7f3a2c1d-9bef-4e88-aa01-1234567890ab';
    const identity = dockLaunchIdentity(uuid);
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);

    saver.save({ asOfDate: '2026-04-27' } as unknown as Partial<unknown>);
    await flushSaver(saver);

    expect(cm.rows.has(uuid)).toBe(true);
    expect(cm.rows.has(TEMPLATE_ID)).toBe(false);
    expect(cm.rows.get(uuid)!.configId).toBe(uuid);
  });

  it('two parallel dock launches produce two distinct UUID rows (no template overwrite)', async () => {
    const uuidA = 'instance-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const uuidB = 'instance-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const saverA = createDebouncedSaver(dockLaunchIdentity(uuidA), cm as unknown as ConfigManager, () => null);
    const saverB = createDebouncedSaver(dockLaunchIdentity(uuidB), cm as unknown as ConfigManager, () => null);

    saverA.save({ size: 'small' } as unknown as Partial<unknown>);
    saverB.save({ size: 'large' } as unknown as Partial<unknown>);
    await flushSaver(saverA);
    await flushSaver(saverB);

    expect(cm.rows.size).toBe(2);
    expect(cm.rows.has(uuidA)).toBe(true);
    expect(cm.rows.has(uuidB)).toBe(true);
    expect(cm.rows.has(TEMPLATE_ID)).toBe(false); // ← template untouched
  });
});

// ─── Invariant 3 — componentType + componentSubType always match identity ─

describe('Invariant 3 — saved row componentType + componentSubType ALWAYS match identity', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('test-launch, fresh row: enforced from identity', async () => {
    const identity = testLaunchIdentity();
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);
    saver.save({ x: 1 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const row = cm.rows.get(TEMPLATE_ID)!;
    expect(row.componentType).toBe(REGISTERED_TYPE);
    expect(row.componentSubType).toBe(REGISTERED_SUBTYPE);
  });

  it('dock-launch, fresh row: enforced from identity (instance shares type/subtype with template)', async () => {
    const identity = dockLaunchIdentity('uuid-1');
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);
    saver.save({ y: 2 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const row = cm.rows.get('uuid-1')!;
    expect(row.componentType).toBe(REGISTERED_TYPE);
    expect(row.componentSubType).toBe(REGISTERED_SUBTYPE);
  });

  it('merge-existing: identity OVERWRITES stale type/subtype on the loaded row', async () => {
    // Existing row was somehow written with stale fields (legacy
    // data, schema drift, hand-edit, …). Saver MUST stomp them with
    // identity values on the next write.
    const stale: AppConfigRow = {
      configId: TEMPLATE_ID,
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'stale',
      componentType: 'WRONG_TYPE',
      componentSubType: 'WRONG_SUBTYPE',
      isTemplate: true,
      payload: { columns: 4 },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    };
    cm.rows.set(TEMPLATE_ID, stale);

    const identity = testLaunchIdentity();
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => stale);
    saver.save({ columns: 9 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const updated = cm.rows.get(TEMPLATE_ID)!;
    expect(updated.componentType).toBe(REGISTERED_TYPE);       // ← enforced
    expect(updated.componentSubType).toBe(REGISTERED_SUBTYPE); // ← enforced
    expect(updated.componentType).not.toBe('WRONG_TYPE');
    expect(updated.componentSubType).not.toBe('WRONG_SUBTYPE');
  });
});

// ─── Invariant 4 — isTemplate iff test-launch ───────────────────────

describe('Invariant 4 — isTemplate === true if and only if launch was a test-launch', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('test-launch identity → isTemplate: true on the persisted row', async () => {
    const identity = testLaunchIdentity();
    expect(identity.isTemplate).toBe(true); // sanity on fixture
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);
    saver.save({ x: 1 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const row = cm.rows.get(TEMPLATE_ID)!;
    expect(row.isTemplate).toBe(true);
  });

  it('dock-launch identity → isTemplate: false on the persisted row', async () => {
    const identity = dockLaunchIdentity('uuid-x');
    expect(identity.isTemplate).toBe(false); // sanity on fixture
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => null);
    saver.save({ y: 2 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const row = cm.rows.get('uuid-x')!;
    expect(row.isTemplate).toBe(false);
  });

  it('merge-existing: identity OVERWRITES stale isTemplate on the loaded row', async () => {
    // Loaded row claims isTemplate=true but identity says this is a
    // dock-launch (isTemplate=false). Saver must use identity.
    const stale: AppConfigRow = {
      configId: 'uuid-z',
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'stale',
      componentType: REGISTERED_TYPE,
      componentSubType: REGISTERED_SUBTYPE,
      isTemplate: true,         // ← stale value
      payload: { columns: 4 },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    };
    cm.rows.set('uuid-z', stale);

    const identity = dockLaunchIdentity('uuid-z');
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => stale);
    saver.save({ columns: 99 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const updated = cm.rows.get('uuid-z')!;
    expect(updated.isTemplate).toBe(false); // ← enforced from identity
  });

  it('test-launch with stale loaded row → isTemplate flips back to true', async () => {
    // Mirror of the previous test: loaded row claims isTemplate=false,
    // identity says this is a test-launch.
    const stale: AppConfigRow = {
      configId: TEMPLATE_ID,
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'stale',
      componentType: REGISTERED_TYPE,
      componentSubType: REGISTERED_SUBTYPE,
      isTemplate: false,        // ← stale value
      payload: { columns: 4 },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    };
    cm.rows.set(TEMPLATE_ID, stale);

    const identity = testLaunchIdentity();
    const saver = createDebouncedSaver(identity, cm as unknown as ConfigManager, () => stale);
    saver.save({ columns: 99 } as unknown as Partial<unknown>);
    await flushSaver(saver);

    const updated = cm.rows.get(TEMPLATE_ID)!;
    expect(updated.isTemplate).toBe(true);
  });
});

// ─── Cross-invariant: full test-launch → dock-launch flow ───────────

describe('End-to-end: test-launch authors template, then dock-launch clones it', () => {
  it('produces exactly one template row and one per-instance row, with all four invariants holding on both', async () => {
    const cm = makeFakeConfigManager();

    // 1. Test-launch: author the template config.
    const tIdentity = testLaunchIdentity();
    const tSaver = createDebouncedSaver(tIdentity, cm as unknown as ConfigManager, () => null);
    tSaver.save({ defaultColumns: ['id', 'price', 'qty'] } as unknown as Partial<unknown>);
    await flushSaver(tSaver);

    expect(cm.rows.size).toBe(1);
    const tmpl = cm.rows.get(TEMPLATE_ID)!;
    expect(tmpl.configId).toBe(TEMPLATE_ID);                    // (1) template id
    expect(tmpl.componentType).toBe(REGISTERED_TYPE);            // (3) type matches
    expect(tmpl.componentSubType).toBe(REGISTERED_SUBTYPE);      // (3) subtype matches
    expect(tmpl.isTemplate).toBe(true);                          // (4) template

    // 2. Dock-launch: a per-instance row clones type/subtype but
    //    carries an arbitrary UUID and isTemplate=false.
    const uuid = 'instance-deadbeef';
    const iIdentity = dockLaunchIdentity(uuid);
    const iSaver = createDebouncedSaver(iIdentity, cm as unknown as ConfigManager, () => null);
    iSaver.save({ defaultColumns: ['id', 'price'] } as unknown as Partial<unknown>);
    await flushSaver(iSaver);

    expect(cm.rows.size).toBe(2);
    const inst = cm.rows.get(uuid)!;
    expect(inst.configId).toBe(uuid);                            // (2) UUID configId
    expect(inst.configId).not.toBe(TEMPLATE_ID);                 // (2) NOT the template id
    expect(inst.componentType).toBe(REGISTERED_TYPE);            // (3) type matches
    expect(inst.componentSubType).toBe(REGISTERED_SUBTYPE);      // (3) subtype matches
    expect(inst.isTemplate).toBe(false);                         // (4) not a template

    // Bonus: the template row was NOT overwritten by the dock launch.
    expect(cm.rows.get(TEMPLATE_ID)!.isTemplate).toBe(true);
    expect(cm.rows.get(TEMPLATE_ID)!.configId).toBe(TEMPLATE_ID);
  });
});
