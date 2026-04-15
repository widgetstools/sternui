import type { Module } from '../../core/types';

/**
 * Toolbar Visibility — tracks which optional toolbars (Filters, Style, etc.)
 * the user has shown in the host app (e.g. MarketsGrid v2).
 *
 * Hidden module — no `SettingsPanel`, never appears in the settings nav.
 * Lives in the per-profile snapshot so toolbar layout round-trips cleanly
 * across profile load/save.
 *
 * Missing keys in `visible` mean "use the host's default" — we deliberately
 * do NOT seed `false` for unknown toolbars so a host that adds a new toolbar
 * id later doesn't have to migrate every old profile.
 *
 * v2.0 adds `schemaVersion: 1` (v1 had no version), so future shape changes
 * can be migrated cleanly.
 */
export interface ToolbarVisibilityState {
  /** Map of toolbar id → visible. Missing key = host default. */
  visible: Record<string, boolean>;
}

export const INITIAL_TOOLBAR_VISIBILITY: ToolbarVisibilityState = { visible: {} };

export const toolbarVisibilityModule: Module<ToolbarVisibilityState> = {
  id: 'toolbar-visibility',
  name: 'Toolbar Visibility',
  schemaVersion: 1,
  // No transforms — pure UI state. Priority is irrelevant ordering-wise but
  // kept high so any future module that depends on it slots in cleanly.
  priority: 1000,

  getInitialState: () => ({ visible: {} }),

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { visible: {} };
    const d = raw as Partial<ToolbarVisibilityState>;
    // Coerce non-object `visible` (corrupt snapshot) to {}.
    if (!d.visible || typeof d.visible !== 'object' || Array.isArray(d.visible)) {
      return { visible: {} };
    }
    // Drop non-boolean values so a stray `null` / string can't poison render.
    const visible: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(d.visible)) {
      if (typeof v === 'boolean') visible[k] = v;
    }
    return { visible };
  },
};
