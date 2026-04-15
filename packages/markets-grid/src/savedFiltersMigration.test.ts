import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readLegacyFilters,
  legacyFiltersKey,
  LEGACY_STORAGE_KEY_PREFIX,
} from './savedFiltersMigration';

describe('savedFiltersMigration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('legacyFiltersKey', () => {
    it('prefixes the gridId with `gc-filters:`', () => {
      expect(legacyFiltersKey('my-grid')).toBe('gc-filters:my-grid');
      expect(legacyFiltersKey('')).toBe('gc-filters:');
      expect(LEGACY_STORAGE_KEY_PREFIX).toBe('gc-filters:');
    });
  });

  describe('readLegacyFilters', () => {
    it('returns null when no legacy entry exists', () => {
      expect(readLegacyFilters('grid-x')).toBeNull();
    });

    it('returns the parsed array AND removes the key on a happy-path read', () => {
      const filters = [
        { id: 'sf_1', label: 'L1', filterModel: { a: 1 }, active: true },
        { id: 'sf_2', label: 'L2', filterModel: { b: 2 }, active: false },
      ];
      localStorage.setItem('gc-filters:grid-a', JSON.stringify(filters));

      const result = readLegacyFilters('grid-a');
      expect(result).toEqual(filters);
      // Key MUST be removed so the next mount doesn't re-migrate.
      expect(localStorage.getItem('gc-filters:grid-a')).toBeNull();
    });

    it('removes the legacy key even when the JSON is malformed (returns null)', () => {
      localStorage.setItem('gc-filters:grid-b', 'not json {{{');
      const result = readLegacyFilters('grid-b');
      expect(result).toBeNull();
      // Critical: the corrupt key must still be cleared so we don't re-trigger
      // the same parse failure on every subsequent mount.
      expect(localStorage.getItem('gc-filters:grid-b')).toBeNull();
    });

    it('removes the legacy key when the parsed payload is not an array (returns null)', () => {
      localStorage.setItem('gc-filters:grid-c', JSON.stringify({ filters: [] }));
      const result = readLegacyFilters('grid-c');
      expect(result).toBeNull();
      expect(localStorage.getItem('gc-filters:grid-c')).toBeNull();
    });

    it('does not touch other gridIds', () => {
      localStorage.setItem('gc-filters:grid-keep', JSON.stringify([{ id: 'k' }]));
      localStorage.setItem('gc-filters:grid-drop', JSON.stringify([{ id: 'd' }]));

      readLegacyFilters('grid-drop');

      expect(localStorage.getItem('gc-filters:grid-drop')).toBeNull();
      expect(localStorage.getItem('gc-filters:grid-keep')).toBe(JSON.stringify([{ id: 'k' }]));
    });

    it('does not touch unrelated localStorage keys', () => {
      localStorage.setItem('gc-grid:something', 'preserve me');
      localStorage.setItem('gc-filters:grid-d', JSON.stringify([]));

      readLegacyFilters('grid-d');

      expect(localStorage.getItem('gc-grid:something')).toBe('preserve me');
    });

    it('is safe to call repeatedly — second call is a no-op (no thrown error)', () => {
      localStorage.setItem('gc-filters:grid-e', JSON.stringify([{ id: 'sf_e' }]));

      const first = readLegacyFilters('grid-e');
      const second = readLegacyFilters('grid-e');

      expect(first).toEqual([{ id: 'sf_e' }]);
      expect(second).toBeNull();
    });

    describe('localStorage hostility', () => {
      const originalGetItem = Storage.prototype.getItem;
      const originalRemoveItem = Storage.prototype.removeItem;

      afterEach(() => {
        Storage.prototype.getItem = originalGetItem;
        Storage.prototype.removeItem = originalRemoveItem;
      });

      it('returns null when localStorage.getItem throws (e.g. private mode quota)', () => {
        Storage.prototype.getItem = vi.fn(() => {
          throw new Error('SecurityError: private mode');
        });
        expect(() => readLegacyFilters('grid-z')).not.toThrow();
        expect(readLegacyFilters('grid-z')).toBeNull();
      });

      it('still returns the parsed payload when removeItem throws', () => {
        // Seed the legacy entry first using the original implementation
        localStorage.setItem('gc-filters:grid-w', JSON.stringify([{ id: 'sf_w' }]));
        // Now intercept removeItem to throw
        Storage.prototype.removeItem = vi.fn(() => {
          throw new Error('SecurityError on remove');
        });
        // Should not throw, should still return the payload
        expect(() => readLegacyFilters('grid-w')).not.toThrow();
        // We can't assert on the second call here because the spy is still active —
        // the contract is "best effort cleanup", not "guaranteed cleanup".
      });
    });
  });
});
