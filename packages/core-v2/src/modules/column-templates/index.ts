import type { Module } from '../../core/types';
import {
  INITIAL_COLUMN_TEMPLATES,
  type ColumnTemplatesState,
  type ColumnTemplate,
  type ColumnDataType,
} from './state';

/**
 * Passive state holder for reusable column-template definitions. No
 * transformColumnDefs, no SettingsPanel — `column-customization` owns the
 * walker and reads this module's state via `ctx.getModuleState`. UI surface
 * lands in sub-project #4 (FormattingToolbar v2 port).
 *
 * Priority 5 places this module before `column-customization` (10) in the
 * transform pipeline, so its state is settled by the time the customization
 * walker reads it. Order is also enforced structurally by
 * `column-customization.dependencies = ['column-templates']` (Task 6).
 */
export const columnTemplatesModule: Module<ColumnTemplatesState> = {
  id: 'column-templates',
  name: 'Templates',
  schemaVersion: 1,
  priority: 5,

  // INITIAL_COLUMN_TEMPLATES is deep-frozen (see ./state.ts) — spreading the
  // outer alone leaves `templates` / `typeDefaults` as frozen references that
  // throw on mutation in strict mode. Module<S>.getInitialState must return a
  // fully-mutable fresh object, so build one here.
  getInitialState: () => ({ templates: {}, typeDefaults: {} }),

  serialize: (state) => state,

  deserialize: (data) => {
    // Same frozen-inner concern as `getInitialState` — return a fully fresh,
    // mutable shape rather than spreading the deep-frozen INITIAL.
    if (!data || typeof data !== 'object') return { templates: {}, typeDefaults: {} };
    const raw = data as Partial<ColumnTemplatesState>;
    return {
      templates:
        raw.templates && typeof raw.templates === 'object' && !Array.isArray(raw.templates)
          ? (raw.templates as Record<string, ColumnTemplate>)
          : {},
      typeDefaults:
        raw.typeDefaults && typeof raw.typeDefaults === 'object' && !Array.isArray(raw.typeDefaults)
          ? (raw.typeDefaults as Partial<Record<ColumnDataType, string>>)
          : {},
    };
  },
};

export type { ColumnTemplate, ColumnDataType, ColumnTemplatesState };
export { INITIAL_COLUMN_TEMPLATES };
