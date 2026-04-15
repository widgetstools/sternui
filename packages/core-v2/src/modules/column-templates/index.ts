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

  getInitialState: () => ({ ...INITIAL_COLUMN_TEMPLATES }),

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_TEMPLATES };
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
