import type { GridCustomizerModule } from '../../types/module';

/**
 * Hidden state-only module — holds the user's named/saved filter pills shown
 * by the host's Filters toolbar (e.g. `<FiltersToolbar>` in markets-grid).
 *
 * Stored as a module so the list of saved filters auto-roundtrips through
 * the active profile snapshot via `core.serializeAll()` / `deserializeAll()`.
 *
 * No `SettingsPanel` — `ModuleNav` filters out modules without a panel, so
 * this module does not appear in the Settings nav.
 *
 * Shape is intentionally generic (`unknown[]`) because the concrete
 * `SavedFilter` shape lives in markets-grid (host-specific). Consumers cast
 * to their own type when reading/writing via `useModuleState`.
 */
export interface SavedFiltersState {
  /** Array of saved filter records — opaque to core. */
  filters: unknown[];
}

const INITIAL: SavedFiltersState = { filters: [] };

export const savedFiltersModule: GridCustomizerModule<SavedFiltersState> = {
  id: 'saved-filters',
  name: 'Saved Filters',
  icon: 'Filter',
  priority: 1001, // After toolbar-visibility — pure UI state, no transforms

  getInitialState: () => ({ filters: [] }),

  serialize: (state) => state,
  deserialize: (data) => {
    const d = (data ?? {}) as Partial<SavedFiltersState>;
    return { filters: Array.isArray(d.filters) ? d.filters : [...INITIAL.filters] };
  },

  // No SettingsPanel — hidden from the settings nav.
};
