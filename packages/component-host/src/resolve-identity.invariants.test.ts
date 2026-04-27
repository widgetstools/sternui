/**
 * Invariant tests for `readCustomData()` and the full
 * customData → identity → save pipeline.
 *
 * Saver-only tests (`save-config.invariants.test.ts`) prove the
 * persistence layer is correct. These cover the upstream seam:
 *
 *   1. `readCustomData` faithfully maps `fin.me.getOptions()` ->
 *      `customData` onto a `ComponentIdentity` — including the new
 *      `isTemplate`, `singleton`, `appId`, `userId` fields.
 *   2. The Registry Editor's test-launch payload (instanceId ===
 *      templateId === ${type}-${subtype}, isTemplate: true)
 *      survives the round-trip end-to-end and produces a correctly
 *      keyed AppConfigRow.
 *   3. The dock-launch payload (UUID instanceId, isTemplate: false)
 *      similarly survives end-to-end.
 *
 * If the user reports a four-invariant violation in the field but
 * the saver tests pass, this file will catch the upstream bug —
 * usually a customData field name mismatch between launcher and
 * reader.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCustomData } from './resolve-identity';
import { createDebouncedSaver } from './save-config';
import { deriveTemplateConfigId } from '@marketsui/openfin-platform';
import type { AppConfigRow, ConfigManager } from '@marketsui/config-service';

// ─── fin.me.getOptions stub ─────────────────────────────────────────

interface FinStub {
  me: { getOptions: () => Promise<{ customData?: Record<string, unknown> }> };
}

function installFin(customData: Record<string, unknown>): void {
  const stub: FinStub = {
    me: { getOptions: async () => ({ customData }) },
  };
  (globalThis as unknown as { fin: FinStub }).fin = stub;
}

function clearFin(): void {
  delete (globalThis as unknown as { fin?: FinStub }).fin;
}

// ─── readCustomData invariants ──────────────────────────────────────

describe('readCustomData — customData → ComponentIdentity invariants', () => {
  beforeEach(() => clearFin());

  it('extracts the test-launch payload exactly as the Registry Editor sends it', async () => {
    installFin({
      instanceId: 'blotter-markets',          // ← test-launch: configId == templateId
      templateId: 'blotter-markets',
      componentType: 'blotter',
      componentSubType: 'markets',
      isTemplate: true,
      singleton: false,
      appId: 'TestApp',
      userId: 'dev1',
    });

    const id = await readCustomData();
    expect(id).not.toBeNull();
    expect(id!.instanceId).toBe('blotter-markets');
    expect(id!.templateId).toBe('blotter-markets');
    expect(id!.componentType).toBe('blotter');
    expect(id!.componentSubType).toBe('markets');
    expect(id!.isTemplate).toBe(true);
    expect(id!.singleton).toBe(false);
    expect(id!.appId).toBe('TestApp');
    expect(id!.userId).toBe('dev1');
  });

  it('extracts the dock-launch payload (UUID instanceId, isTemplate=false)', async () => {
    installFin({
      instanceId: 'a1b2c3d4-deadbeef',
      templateId: 'blotter-markets',
      componentType: 'blotter',
      componentSubType: 'markets',
      isTemplate: false,
      singleton: false,
      appId: 'TestApp',
      userId: 'dev1',
    });

    const id = await readCustomData();
    expect(id!.instanceId).toBe('a1b2c3d4-deadbeef');
    expect(id!.templateId).toBe('blotter-markets');
    expect(id!.isTemplate).toBe(false);
  });

  it('treats missing isTemplate / singleton fields as false (back-compat)', async () => {
    installFin({
      instanceId: 'foo',
      templateId: '',
      componentType: 'blotter',
      componentSubType: 'markets',
      // isTemplate, singleton, appId, userId all omitted
    });

    const id = await readCustomData();
    expect(id!.isTemplate).toBe(false);
    expect(id!.singleton).toBe(false);
    expect(id!.appId).toBeUndefined();
    expect(id!.userId).toBeUndefined();
  });

  it('does NOT misread non-boolean isTemplate as truthy (only `=== true` qualifies)', async () => {
    installFin({
      instanceId: 'foo',
      templateId: '',
      componentType: 'blotter',
      componentSubType: 'markets',
      isTemplate: 'true', // ← string, not boolean
    });

    const id = await readCustomData();
    expect(id!.isTemplate).toBe(false); // strict-equality boolean check
  });

  it('returns null when no fin global exists (dev mode)', async () => {
    clearFin();
    const id = await readCustomData();
    expect(id).toBeNull();
  });
});

// ─── Full pipeline: launcher payload → saved row ────────────────────

const TEMPLATE_ID = deriveTemplateConfigId('blotter', 'markets');

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

describe('Full pipeline — Registry Editor launcher payload → saved AppConfigRow', () => {
  beforeEach(() => clearFin());

  it('test-launch: customData → identity → save → row keyed by `${type}-${subtype}` with isTemplate:true', async () => {
    // What useRegistryEditor.testComponent puts on customData when
    // the user clicks "Test Launch" on a registry entry.
    installFin({
      instanceId: TEMPLATE_ID,
      templateId: TEMPLATE_ID,
      componentType: 'blotter',
      componentSubType: 'markets',
      isTemplate: true,
      singleton: false,
      appId: 'TestApp',
      userId: 'dev1',
    });

    const identity = await readCustomData();
    expect(identity).not.toBeNull();

    const cm = makeFakeConfigManager();
    const saver = createDebouncedSaver(identity!, cm as unknown as ConfigManager, () => null);
    saver.save({ initialColumns: ['id', 'symbol', 'qty'] } as unknown as Partial<unknown>);
    await saver.flush();

    expect(cm.rows.size).toBe(1);
    const row = cm.rows.get(TEMPLATE_ID)!;
    expect(row.configId).toBe('blotter-markets');           // (1) template id
    expect(row.componentType).toBe('blotter');               // (3) type matches
    expect(row.componentSubType).toBe('markets');            // (3) subtype matches
    expect(row.isTemplate).toBe(true);                       // (4) test-launch ⇒ template
    expect(row.appId).toBe('TestApp');
    expect(row.userId).toBe('dev1');
  });

  it('dock-launch: customData → identity → save → row keyed by UUID with isTemplate:false', async () => {
    const uuid = 'instance-12345-abcdef';
    installFin({
      instanceId: uuid,
      templateId: TEMPLATE_ID,
      componentType: 'blotter',
      componentSubType: 'markets',
      isTemplate: false,
      singleton: false,
      appId: 'TestApp',
      userId: 'dev1',
    });

    const identity = await readCustomData();
    const cm = makeFakeConfigManager();
    const saver = createDebouncedSaver(identity!, cm as unknown as ConfigManager, () => null);
    saver.save({ filterText: 'AAPL' } as unknown as Partial<unknown>);
    await saver.flush();

    expect(cm.rows.size).toBe(1);
    const row = cm.rows.get(uuid)!;
    expect(row.configId).toBe(uuid);                         // (2) UUID configId
    expect(row.configId).not.toBe(TEMPLATE_ID);              // (2) NOT the template id
    expect(row.componentType).toBe('blotter');               // (3) type matches
    expect(row.componentSubType).toBe('markets');            // (3) subtype matches
    expect(row.isTemplate).toBe(false);                      // (4) dock-launch ⇒ not template
  });

  it('legacy customData (no isTemplate field) defaults to dock-launch behaviour', async () => {
    // Older entries / workspace restores might predate the
    // isTemplate marker. They should be treated as dock launches —
    // never silently produce a template row.
    installFin({
      instanceId: 'some-uuid',
      templateId: TEMPLATE_ID,
      componentType: 'blotter',
      componentSubType: 'markets',
      // no isTemplate, no singleton, no appId, no userId
    });

    const identity = await readCustomData();
    expect(identity!.isTemplate).toBe(false);
    const cm = makeFakeConfigManager();
    const saver = createDebouncedSaver(identity!, cm as unknown as ConfigManager, () => null);
    saver.save({ x: 1 } as unknown as Partial<unknown>);
    await saver.flush();

    const row = cm.rows.get('some-uuid')!;
    expect(row.isTemplate).toBe(false);
    expect(row.componentType).toBe('blotter');
    expect(row.componentSubType).toBe('markets');
  });
});
