import type { Module } from '../../core/types';

/**
 * Saved Filters — opaque list of filter records owned by the host (e.g. the
 * `<FiltersToolbar>` in markets-grid). Core does not interpret the items;
 * shape is intentionally `unknown[]` so each consumer can define its own
 * `SavedFilter` type and cast through `useModuleState`.
 *
 * v2.0 adds `schemaVersion: 1` (v1 had no version), so future shape changes
 * can be migrated cleanly via `Module.migrate`.
 *
 * No `SettingsPanel` — this module never appears in the settings nav. It
 * exists purely so the saved-filters list rides along inside the active
 * profile snapshot via `core.serializeAll()` / `core.deserializeAll()`.
 */
export interface SavedFiltersState {
  /** Opaque saved-filter records — host defines the concrete shape. */
  filters: unknown[];
}

export const INITIAL_SAVED_FILTERS: SavedFiltersState = { filters: [] };

export const savedFiltersModule: Module<SavedFiltersState> = {
  id: 'saved-filters',
  name: 'Saved Filters',
  schemaVersion: 1,
  // Pure UI/state — no transforms, no ordering constraint with other modules.
  // Kept high so it can read prior modules' state if a future migration ever
  // needs to (none today).
  priority: 1001,

  getInitialState: () => ({ filters: [] }),

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { filters: [] };
    const d = raw as Partial<SavedFiltersState>;
    // Tolerate non-array `filters` (corrupt snapshot) by returning empty.
    return { filters: Array.isArray(d.filters) ? d.filters : [] };
  },
};
