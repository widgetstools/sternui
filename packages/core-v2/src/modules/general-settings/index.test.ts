import { describe, expect, it } from 'vitest';
import { generalSettingsModule, INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './index';

describe('general-settings module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(generalSettingsModule.id).toBe('general-settings');
    expect(generalSettingsModule.schemaVersion).toBe(1);
    expect(generalSettingsModule.priority).toBe(0);
  });

  it('getInitialState returns a fresh object every call', () => {
    const a = generalSettingsModule.getInitialState();
    const b = generalSettingsModule.getInitialState();
    expect(a).not.toBe(b);
    expect(a).toEqual(INITIAL_GENERAL_SETTINGS);
  });
});

describe('general-settings module — transformGridOptions', () => {
  const ctx = {} as never;

  it('writes rowHeight / headerHeight onto opts', () => {
    const out = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, rowHeight: 48, headerHeight: 40 },
      ctx,
    );
    expect(out.rowHeight).toBe(48);
    expect(out.headerHeight).toBe(40);
  });

  it('builds rowSelection as the AG-Grid 35 object form when set', () => {
    const out = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, rowSelection: 'multiRow' },
      ctx,
    );
    expect(out.rowSelection).toEqual({ mode: 'multiRow' });
  });

  it('omits rowSelection entirely when state.rowSelection is undefined', () => {
    const out = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, rowSelection: undefined },
      ctx,
    );
    expect(out.rowSelection).toBeUndefined();
  });

  it('only sends pagination tunables when pagination is enabled', () => {
    const off = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, paginationEnabled: false, paginationPageSize: 25 },
      ctx,
    );
    expect(off.pagination).toBe(false);
    expect(off.paginationPageSize).toBeUndefined();
    expect(off.paginationAutoPageSize).toBeUndefined();
    expect(off.suppressPaginationPanel).toBeUndefined();

    const on = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, paginationEnabled: true, paginationPageSize: 25 },
      ctx,
    );
    expect(on.pagination).toBe(true);
    expect(on.paginationPageSize).toBe(25);
  });

  it('merges defaults into opts.defaultColDef without dropping consumer fields', () => {
    const out = generalSettingsModule.transformGridOptions!(
      { defaultColDef: { lockPosition: 'left', flex: 1 } as never },
      { ...INITIAL_GENERAL_SETTINGS, defaultMinWidth: 120, defaultEditable: true },
      ctx,
    );
    // Module-managed fields override consumer values.
    expect(out.defaultColDef!.minWidth).toBe(120);
    expect(out.defaultColDef!.editable).toBe(true);
    // Consumer fields the module doesn't touch survive.
    expect((out.defaultColDef as { lockPosition?: string }).lockPosition).toBe('left');
    expect((out.defaultColDef as { flex?: number }).flex).toBe(1);
  });
});

describe('general-settings module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: GeneralSettingsState = { ...INITIAL_GENERAL_SETTINGS, rowHeight: 99 };
    const back = generalSettingsModule.deserialize(generalSettingsModule.serialize(state));
    expect(back).toEqual(state);
  });

  it('backfills missing fields with the current initial defaults', () => {
    // Simulate a v1-era snapshot that doesn't have wrapHeaderText.
    const partial = { rowHeight: 50, headerHeight: 30 };
    const back = generalSettingsModule.deserialize(partial) as GeneralSettingsState;
    expect(back.rowHeight).toBe(50);
    expect(back.wrapHeaderText).toBe(INITIAL_GENERAL_SETTINGS.wrapHeaderText);
  });

  it('tolerates null / non-object payloads', () => {
    expect(generalSettingsModule.deserialize(null)).toEqual(INITIAL_GENERAL_SETTINGS);
    expect(generalSettingsModule.deserialize(undefined)).toEqual(INITIAL_GENERAL_SETTINGS);
  });
});
