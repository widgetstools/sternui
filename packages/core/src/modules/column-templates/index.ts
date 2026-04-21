/**
 * Column templates — passive state holder for reusable template definitions.
 * No `transformColumnDefs`, no `SettingsPanel`. Downstream modules
 * (column-customization) read this state via `ctx.getModuleState` and fold
 * the template chain through `resolveTemplates`.
 *
 * Priority 5 places this BEFORE column-customization (10) so its state is
 * settled by the time the customization walker reads it.
 */
import type { Module } from '../../platform/types';
import {
  INITIAL_COLUMN_TEMPLATES,
  type ColumnDataType,
  type ColumnTemplate,
  type ColumnTemplatesState,
} from './state';

export const COLUMN_TEMPLATES_MODULE_ID = 'column-templates';

export const columnTemplatesModule: Module<ColumnTemplatesState> = {
  id: COLUMN_TEMPLATES_MODULE_ID,
  name: 'Templates',
  schemaVersion: 1,
  priority: 5,

  // INITIAL_COLUMN_TEMPLATES is deep-frozen — spreading its outer leaves
  // `templates` / `typeDefaults` as frozen references that throw on
  // mutation in strict mode. Return a fully-mutable fresh shape here.
  getInitialState: () => ({ templates: {}, typeDefaults: {} }),

  serialize: (state) => state,

  deserialize: (data) => {
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

export { INITIAL_COLUMN_TEMPLATES };
export { resolveTemplates } from './resolveTemplates';
export {
  snapshotTemplate,
  addTemplateReducer,
  removeTemplateReducer,
  type SnapshotTemplateDeps,
} from './snapshotTemplate';
export type { ColumnTemplate, ColumnTemplatesState, ColumnDataType };
