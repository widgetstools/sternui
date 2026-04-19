/**
 * Saved Filters — opaque state holder.
 *
 * Core does not interpret the filter records; the host (e.g. the
 * `<FiltersToolbar>` in markets-grid) defines the concrete `SavedFilter`
 * shape and casts through `useModuleState`. This module exists only so
 * the list rides along inside the active profile snapshot via
 * `serializeAll()` / `deserializeAll()`.
 */
import type { Module } from '../../platform/types';

export const SAVED_FILTERS_MODULE_ID = 'saved-filters';

export interface SavedFiltersState {
  /** Opaque saved-filter records — host defines the concrete shape. */
  filters: unknown[];
}

export const INITIAL_SAVED_FILTERS: SavedFiltersState = { filters: [] };

export const savedFiltersModule: Module<SavedFiltersState> = {
  id: SAVED_FILTERS_MODULE_ID,
  name: 'Saved Filters',
  schemaVersion: 1,
  // Pure state — no transforms, no ordering constraint. Kept high so future
  // migrations can read earlier modules if ever needed.
  priority: 1001,

  getInitialState: () => ({ filters: [] }),

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { filters: [] };
    const d = raw as Partial<SavedFiltersState>;
    return { filters: Array.isArray(d.filters) ? d.filters : [] };
  },
};
