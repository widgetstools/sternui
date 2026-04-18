/**
 * Column Customization — per-column override layer.
 *
 * Merges user-defined `ColumnAssignment`s (styling, formatting, filter
 * config, row-grouping, cellEditor/cellRenderer) into the host's column
 * definitions. Runs AFTER column-templates (priority 10) so the resolver
 * sees the settled template chain.
 *
 * Side effects (CSS rule injection) live on the platform's per-grid
 * ResourceScope — no file-level state, cleaned up in one pass when the
 * grid is destroyed.
 */
import type { Module } from '../../platform/types';
import {
  INITIAL_COLUMN_CUSTOMIZATION,
  migrateFromLegacy,
  type ColumnAssignment,
  type ColumnCustomizationState,
  type LegacyColumnCustomizationState,
} from './state';
import type { ColumnTemplatesState } from '../column-templates';
import { COLUMN_TEMPLATES_MODULE_ID } from '../column-templates';
import { applyAssignments, reinjectCSS } from './transforms';
import { ColumnSettingsPanel } from './ColumnSettingsPanel';

export const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';

export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: COLUMN_CUSTOMIZATION_MODULE_ID,
  name: 'Column Settings',
  code: '04',
  schemaVersion: 5,
  dependencies: [COLUMN_TEMPLATES_MODULE_ID],
  priority: 10,

  getInitialState: () => ({ ...INITIAL_COLUMN_CUSTOMIZATION }),

  migrate(raw, fromVersion) {
    // v4 adds optional `filter` per-assignment. v5 adds optional `rowGrouping`.
    // Both are additive — v1..v4 snapshots roundtrip unchanged.
    if (fromVersion >= 1 && fromVersion <= 4) {
      if (!raw || typeof raw !== 'object') {
        console.warn(
          '[column-customization]',
          `malformed v${fromVersion} snapshot; falling back to initial state.`,
        );
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      return raw as ColumnCustomizationState;
    }
    console.warn(
      '[column-customization]',
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },

  transformColumnDefs(defs, state, ctx) {
    if (Object.keys(state.assignments).length === 0) return defs;
    const templatesState = ctx.getModuleState<ColumnTemplatesState>(COLUMN_TEMPLATES_MODULE_ID);

    // CSS rule injection — one CssHandle per module, kept alive for the
    // grid's lifetime via the ResourceScope. `reinjectCSS` clears +
    // re-writes every pass; cheap because we only touch the text node.
    const cells = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-cells`);
    const headers = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-headers`);
    reinjectCSS(cells, headers, state.assignments, templatesState, defs);

    // Walker emits cellClass / headerClass (NOT cellStyle / headerStyle) so
    // the CSS rules above take effect without per-row recomputation.
    return applyAssignments(defs, state.assignments, templatesState, ctx.resources.expression());
  },

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_CUSTOMIZATION };
    const raw = data as Record<string, unknown>;
    // v1 snapshot: { overrides: {...} } — translate to assignments.
    if ('overrides' in raw && !('assignments' in raw)) {
      return migrateFromLegacy(raw as unknown as LegacyColumnCustomizationState);
    }
    // Strip a legacy `templates` field — it lived on this module in
    // pre-extract builds and now lives on column-templates.
    const { templates: _drop, ...rest } = raw as { templates?: unknown };
    void _drop;
    return {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      ...(rest as Partial<ColumnCustomizationState>),
    };
  },

  SettingsPanel: ColumnSettingsPanel,
};

export type {
  ColumnAssignment,
  ColumnCustomizationState,
  ColumnFilterConfig,
  RowGroupingConfig,
  FilterKind,
  AggFuncName,
  SetFilterOptions,
  MultiFilterEntry,
} from './state';
export { INITIAL_COLUMN_CUSTOMIZATION };
export {
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
} from './transforms';
