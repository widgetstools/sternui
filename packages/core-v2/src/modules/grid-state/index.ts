/**
 * Grid State Module
 * ------------------------------------------------------------------
 * Persists the native AG-Grid state (column order/visibility/width,
 * sort, filters, column groups, pagination, sidebar, focus, selection)
 * plus a viewport anchor + quick-filter. Captured ONLY on explicit Save
 * (see `captureGridStateInto` in ./helpers) and replayed on profile load.
 *
 * AG-Grid's `GridStateModule` must be registered globally — it's included
 * in `AllEnterpriseModule`, which MarketsGrid already registers.
 */
import type { Module } from '../../core/types';
import {
  GRID_STATE_SCHEMA_VERSION,
  INITIAL_GRID_STATE,
  type GridStateState,
  type SavedGridState,
} from './state';
import { applyGridState } from './helpers';

export const gridStateModule: Module<GridStateState> = {
  id: 'grid-state',
  name: 'Grid State',
  schemaVersion: GRID_STATE_SCHEMA_VERSION,
  // Run after column-structure modules (column-templates, column-customization,
  // calculated-columns, column-groups) so the grid has its final column set
  // before we replay a saved state that references column ids.
  priority: 200,

  getInitialState: () => ({ ...INITIAL_GRID_STATE }),

  onRegister(ctx) {
    // Replay state whenever a profile finishes loading.
    //  - saved present → push it through `api.setState()`.
    //  - saved absent  → the freshly-loaded (or newly-created) profile has
    //    no stored grid state, so reset the live grid to defaults.
    //    Otherwise switching from a heavily-customised profile to a blank
    //    one would leave the previous profile's column order / sort /
    //    filters visible because AG-Grid owns that state natively, not
    //    through module transforms.
    ctx.eventBus.on('profile:loaded', () => {
      const state = ctx.getModuleState<GridStateState>('grid-state');
      const gridCtx = ctx.getGridContext();
      if (!gridCtx) return;
      if (state.saved) {
        applyGridState(gridCtx.gridApi, state.saved);
        return;
      }
      try {
        // Empty-object setState resets every native-state slice AG-Grid
        // tracks; clearing quickFilterText separately covers the one thing
        // `GridState` doesn't encompass.
        gridCtx.gridApi.setState({});
        gridCtx.gridApi.setGridOption('quickFilterText', '');
      } catch (err) {
        console.warn('[grid-state] failed to reset live grid:', err);
      }
    });
  },

  onGridReady(ctx) {
    // Cold-mount path: profile already loaded before the grid existed. Apply
    // the snapshot we've been carrying.
    const state = ctx.getModuleState<GridStateState>('grid-state');
    if (state.saved) applyGridState(ctx.gridApi, state.saved);
  },

  // Serialize as the raw SavedGridState so the on-disk shape matches the
  // reference `agGridStateManager.ts` format exactly — a snapshot captured
  // by the standalone helper can be dropped into a profile and vice versa.
  serialize: (state) => state.saved,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { saved: null };
    // Basic shape check — a bad payload shouldn't crash the load.
    const candidate = raw as SavedGridState;
    if (typeof candidate.gridState !== 'object' || candidate.gridState === null) {
      return { saved: null };
    }
    return { saved: candidate };
  },
};

export { INITIAL_GRID_STATE, GRID_STATE_SCHEMA_VERSION } from './state';
export type { GridStateState, SavedGridState } from './state';
export {
  captureGridState,
  applyGridState,
  captureGridStateInto,
} from './helpers';
