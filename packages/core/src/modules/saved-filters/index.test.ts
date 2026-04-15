import { describe, it, expect } from 'vitest';
import { savedFiltersModule, type SavedFiltersState } from './index';

describe('savedFiltersModule', () => {
  describe('contract', () => {
    it('declares the expected id, priority, and is hidden from the settings nav', () => {
      expect(savedFiltersModule.id).toBe('saved-filters');
      expect(savedFiltersModule.name).toBe('Saved Filters');
      // Priority must run after toolbar-visibility (1000) so the order in
      // `allModules` stays predictable when both are serialized into a profile.
      expect(savedFiltersModule.priority).toBe(1001);
      // Hidden modules MUST not expose a SettingsPanel — ModuleNav filters by it.
      expect(savedFiltersModule.SettingsPanel).toBeUndefined();
    });
  });

  describe('getInitialState', () => {
    it('returns a fresh empty array on every call (no shared reference)', () => {
      const a = savedFiltersModule.getInitialState();
      const b = savedFiltersModule.getInitialState();
      expect(a.filters).toEqual([]);
      expect(b.filters).toEqual([]);
      // Mutating one instance must NOT bleed into another (defensive copy).
      a.filters.push({ id: 'x' });
      expect(b.filters).toEqual([]);
    });
  });

  describe('serialize', () => {
    it('returns the state as-is (filters are opaque to core)', () => {
      const state: SavedFiltersState = {
        filters: [
          { id: 'sf_1', label: 'price > 100', filterModel: { price: { type: 'greaterThan', filter: 100 } }, active: true },
          { id: 'sf_2', label: 'NYSE', filterModel: { exchange: { values: ['NYSE'] } }, active: false },
        ],
      };
      expect(savedFiltersModule.serialize(state)).toEqual(state);
    });
  });

  describe('deserialize', () => {
    it('returns empty filters when input is undefined', () => {
      expect(savedFiltersModule.deserialize(undefined)).toEqual({ filters: [] });
    });

    it('returns empty filters when input is null', () => {
      expect(savedFiltersModule.deserialize(null)).toEqual({ filters: [] });
    });

    it('returns empty filters when input is an empty object', () => {
      expect(savedFiltersModule.deserialize({})).toEqual({ filters: [] });
    });

    it('round-trips a populated filters array', () => {
      const filters = [
        { id: 'sf_a', label: 'A', filterModel: {}, active: true },
        { id: 'sf_b', label: 'B', filterModel: { col: { type: 'equals', filter: 'x' } }, active: false },
      ];
      expect(savedFiltersModule.deserialize({ filters })).toEqual({ filters });
    });

    it('falls back to an empty array when filters is not an array', () => {
      // Defensive: guards against corrupted profile JSON or a future schema
      // change that ships a non-array `filters` payload by mistake.
      expect(savedFiltersModule.deserialize({ filters: 'oops' })).toEqual({ filters: [] });
      expect(savedFiltersModule.deserialize({ filters: 42 })).toEqual({ filters: [] });
      expect(savedFiltersModule.deserialize({ filters: null })).toEqual({ filters: [] });
      expect(savedFiltersModule.deserialize({ filters: { not: 'an array' } })).toEqual({ filters: [] });
    });

    it('ignores unknown extra keys without crashing', () => {
      const result = savedFiltersModule.deserialize({ filters: [], futureField: 'ignored' } as unknown);
      expect(result).toEqual({ filters: [] });
    });

    it('aliases the input filters array (no defensive copy on happy path)', () => {
      // Documented contract: when input is a valid array, deserialize returns
      // the SAME reference. Callers (Zustand) treat module state immutably via
      // spread updates, so this is safe and avoids an unnecessary copy on
      // every profile load.
      const inputArr = [{ id: 'sf_x' }];
      const out = savedFiltersModule.deserialize({ filters: inputArr });
      expect(out.filters).toBe(inputArr);
    });

    it('produces an independent fallback array when input is invalid', () => {
      // Two consecutive bad-input deserializes must NOT share an array — a
      // mutation on the first result must not bleed into the second.
      const a = savedFiltersModule.deserialize({ filters: 'oops' });
      (a.filters as Array<unknown>).push({ id: 'sf_leak' });
      const b = savedFiltersModule.deserialize({ filters: 'oops' });
      expect(b.filters).toEqual([]);
    });
  });

  describe('serialize / deserialize round-trip', () => {
    it('survives JSON.stringify → JSON.parse (the actual profile persistence path)', () => {
      const initial: SavedFiltersState = {
        filters: [
          { id: 'sf_1', label: 'L1', filterModel: { a: 1 }, active: true },
          { id: 'sf_2', label: 'L2', filterModel: { b: { c: 2 } }, active: false },
        ],
      };
      const wireFormat = JSON.parse(JSON.stringify(savedFiltersModule.serialize(initial)));
      const restored = savedFiltersModule.deserialize(wireFormat);
      expect(restored).toEqual(initial);
    });
  });
});
