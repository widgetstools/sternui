import type { GridCustomizerModule } from '../../types/module';

/**
 * Hidden state-only module — tracks which optional toolbars (Style, Data, etc.)
 * are currently shown in the host app (e.g. MarketsGrid).
 *
 * Stored as a module so its state is automatically saved/restored as part of
 * the active profile snapshot via `core.serializeAll()` / `deserializeAll()`.
 *
 * No `SettingsPanel` — the module is intentionally invisible in Grid Customizer's
 * settings nav (filtered out by `ModuleNav` / `SettingsSheet`).
 */
export interface ToolbarVisibilityState {
  /** Map of toolbar id → visible. Missing keys mean "not yet toggled" (default per host). */
  visible: Record<string, boolean>;
}

const INITIAL: ToolbarVisibilityState = { visible: {} };

export const toolbarVisibilityModule: GridCustomizerModule<ToolbarVisibilityState> = {
  id: 'toolbar-visibility',
  name: 'Toolbar Visibility',
  icon: 'Settings',
  priority: 1000, // Run last — it's purely UI-side state, no transforms

  getInitialState: () => ({ visible: { ...INITIAL.visible } }),

  serialize: (state) => state,
  deserialize: (data) => {
    const d = (data ?? {}) as Partial<ToolbarVisibilityState>;
    return { visible: { ...(d.visible ?? {}) } };
  },

  // No SettingsPanel — hidden from the settings nav.
};
