import { describe, expect, it } from 'vitest';
import {
  toolbarVisibilityModule,
  INITIAL_TOOLBAR_VISIBILITY,
  type ToolbarVisibilityState,
} from './index';

describe('toolbar-visibility module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(toolbarVisibilityModule.id).toBe('toolbar-visibility');
    expect(toolbarVisibilityModule.schemaVersion).toBe(1);
  });

  it('returns a fresh INITIAL state with no visible entries', () => {
    const a = toolbarVisibilityModule.getInitialState();
    const b = toolbarVisibilityModule.getInitialState();
    expect(a).not.toBe(b);
    expect(a.visible).not.toBe(b.visible);
    expect(a).toEqual(INITIAL_TOOLBAR_VISIBILITY);
  });

  it('exposes no SettingsPanel — hidden from settings nav', () => {
    expect(toolbarVisibilityModule.SettingsPanel).toBeUndefined();
  });

  it('declares no transform hooks — pure UI state', () => {
    expect(toolbarVisibilityModule.transformColumnDefs).toBeUndefined();
    expect(toolbarVisibilityModule.transformGridOptions).toBeUndefined();
  });
});

describe('toolbar-visibility module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: ToolbarVisibilityState = { visible: { filters: true, style: false } };
    expect(toolbarVisibilityModule.deserialize(toolbarVisibilityModule.serialize(state))).toEqual(state);
  });

  it('coerces non-object `visible` to {}', () => {
    expect(toolbarVisibilityModule.deserialize({ visible: 'oops' })).toEqual({ visible: {} });
    // Arrays aren't valid record shapes — also coerce to {}.
    expect(toolbarVisibilityModule.deserialize({ visible: [] })).toEqual({ visible: {} });
  });

  it('drops non-boolean values from `visible` (defensive)', () => {
    const out = toolbarVisibilityModule.deserialize({
      visible: { filters: true, style: 'yes' as unknown, data: null as unknown, layout: 0 as unknown },
    });
    expect(out).toEqual({ visible: { filters: true } });
  });

  it('treats missing `visible` key as empty', () => {
    expect(toolbarVisibilityModule.deserialize({})).toEqual({ visible: {} });
  });

  it('tolerates null / undefined / non-object payloads', () => {
    expect(toolbarVisibilityModule.deserialize(null)).toEqual(INITIAL_TOOLBAR_VISIBILITY);
    expect(toolbarVisibilityModule.deserialize(undefined)).toEqual(INITIAL_TOOLBAR_VISIBILITY);
    expect(toolbarVisibilityModule.deserialize('garbage')).toEqual(INITIAL_TOOLBAR_VISIBILITY);
    expect(toolbarVisibilityModule.deserialize(42)).toEqual(INITIAL_TOOLBAR_VISIBILITY);
  });
});
