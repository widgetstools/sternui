import { describe, expect, it } from 'vitest';
import { savedFiltersModule, INITIAL_SAVED_FILTERS, type SavedFiltersState } from './index';

describe('saved-filters module — metadata', () => {
  it('declares schemaVersion and stable id', () => {
    expect(savedFiltersModule.id).toBe('saved-filters');
    expect(savedFiltersModule.schemaVersion).toBe(1);
  });

  it('returns a fresh INITIAL state every call', () => {
    const a = savedFiltersModule.getInitialState();
    const b = savedFiltersModule.getInitialState();
    expect(a).not.toBe(b);
    expect(a).toEqual(INITIAL_SAVED_FILTERS);
  });

  it('exposes no SettingsPanel — hidden from settings nav', () => {
    expect(savedFiltersModule.SettingsPanel).toBeUndefined();
  });

  it('declares no transform hooks — pure state container', () => {
    expect(savedFiltersModule.transformColumnDefs).toBeUndefined();
    expect(savedFiltersModule.transformGridOptions).toBeUndefined();
  });
});

describe('saved-filters module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: SavedFiltersState = {
      filters: [
        { id: 'f1', name: 'Big trades', model: { qty: { gt: 1000 } } },
        { id: 'f2', name: 'My orders', model: { trader: { eq: 'me' } } },
      ],
    };
    expect(savedFiltersModule.deserialize(savedFiltersModule.serialize(state))).toEqual(state);
  });

  it('coerces non-array `filters` to []', () => {
    // Corrupt snapshot — was a string, should not crash.
    expect(savedFiltersModule.deserialize({ filters: 'not-an-array' })).toEqual({ filters: [] });
  });

  it('tolerates null / undefined / non-object payloads', () => {
    expect(savedFiltersModule.deserialize(null)).toEqual(INITIAL_SAVED_FILTERS);
    expect(savedFiltersModule.deserialize(undefined)).toEqual(INITIAL_SAVED_FILTERS);
    expect(savedFiltersModule.deserialize('garbage')).toEqual(INITIAL_SAVED_FILTERS);
    expect(savedFiltersModule.deserialize(42)).toEqual(INITIAL_SAVED_FILTERS);
  });

  it('treats missing `filters` key as empty', () => {
    expect(savedFiltersModule.deserialize({})).toEqual({ filters: [] });
  });
});
