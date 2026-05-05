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
  type ColumnCustomizationState,
} from './state';
import type { ColumnTemplatesState } from '../column-templates';
import { COLUMN_TEMPLATES_MODULE_ID } from '../column-templates';
import { applyAssignments, reinjectCSS } from './transforms';
import {
  ColumnSettingsEditor,
  ColumnSettingsList,
  ColumnSettingsPanel,
} from './ColumnSettingsPanel';

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
    // Intra-v2 schema evolution:
    //   - schemaVersion 4 added optional `filter` per-assignment
    //   - schemaVersion 5 added optional `rowGrouping`
    //   - schemaVersion 6 (parked column_settings branch) introduced
    //     synthetic FilterKinds 'streamSafeMultiColumnFilter' and
    //     'streamSafeMultiNumberColumnFilter' + a `floatingFilterStyle`
    //     field. main never shipped those, so a v6 profile arriving
    //     here gets the synthetic kinds rewritten back to plain
    //     'agMultiColumnFilter' (and the floatingFilterStyle field is
    //     dropped — main has no place to honour it). This rescues the
    //     user's other settings instead of nuking the profile when
    //     they switch between branches.
    if (fromVersion >= 1 && fromVersion <= 6) {
      if (!raw || typeof raw !== 'object') {
        console.warn(
          '[column-customization]',
          `malformed schemaVersion ${fromVersion} snapshot; falling back to initial state.`,
        );
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      const cloned = JSON.parse(JSON.stringify(raw)) as {
        assignments?: Record<string, { filter?: { kind?: string; floatingFilterStyle?: string } }>;
      };
      if (fromVersion === 6 && cloned.assignments && typeof cloned.assignments === 'object') {
        for (const colId of Object.keys(cloned.assignments)) {
          const a = cloned.assignments[colId];
          const filter = a?.filter as { kind?: string; floatingFilterStyle?: string } | undefined;
          if (!filter || typeof filter !== 'object') continue;
          const k = filter.kind;
          if (k === 'streamSafeMultiColumnFilter' || k === 'streamSafeMultiNumberColumnFilter') {
            filter.kind = 'agMultiColumnFilter';
          }
          // floatingFilterStyle is unknown to v5 — drop it. delete is fine
          // on the optional field; downstream readers ignore unknown keys
          // anyway but stripping keeps the snapshot clean.
          if ('floatingFilterStyle' in filter) delete (filter as { floatingFilterStyle?: unknown }).floatingFilterStyle;
        }
      }
      return cloned as ColumnCustomizationState;
    }
    console.warn(
      '[column-customization]',
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },

  transformColumnDefs(defs, state, ctx) {
    const templatesState = ctx.getModuleState<ColumnTemplatesState>(COLUMN_TEMPLATES_MODULE_ID);

    // CSS rule injection — one CssHandle per module, kept alive for the
    // grid's lifetime via the ResourceScope. `reinjectCSS` clears +
    // re-writes every pass; cheap because we only touch the text node.
    //
    // IMPORTANT: always run, even when assignments is empty. An empty
    // assignments map means the user cleared / undid every column
    // override — we need to CLEAR the previously-injected rules, not
    // leave them dangling. Previously this ran only when assignments
    // was non-empty, which meant Clear-All / Undo-to-empty left stale
    // `.gc-col-c-{colId}` rules in the page stylesheet.
    const cells = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-cells`);
    const headers = ctx.resources.css(`${COLUMN_CUSTOMIZATION_MODULE_ID}-headers`);
    reinjectCSS(cells, headers, state.assignments, templatesState, defs);

    // Walker emits cellClass / headerClass (NOT cellStyle / headerStyle) so
    // the CSS rules above take effect without per-row recomputation.
    // Fast-path: skip the walker when there's nothing to merge — `defs`
    // is returned as-is, same reference, so AG-Grid sees no change.
    if (Object.keys(state.assignments).length === 0) return defs;
    return applyAssignments(
      defs,
      state.assignments,
      templatesState,
      ctx.resources.expression(),
      ctx.resources.appData?.(),
    );
  },

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_CUSTOMIZATION };
    const raw = data as Record<string, unknown>;
    // Strip a stale `templates` field — it lived on this module in
    // pre-extract intra-v2 builds and now lives on column-templates.
    // Kept defensively so a snapshot from an older v2 build still
    // loads cleanly without dropping the rest of the state.
    const { templates: _drop, ...rest } = raw as { templates?: unknown };
    void _drop;
    return {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      ...(rest as Partial<ColumnCustomizationState>),
    };
  },

  // v4: native master-detail — the settings sheet picks these up
  // directly instead of rendering the flat `SettingsPanel` fallback.
  ListPane: ColumnSettingsList,
  EditorPane: ColumnSettingsEditor,
  SettingsPanel: ColumnSettingsPanel,
};

// Re-export the narrowed `ColumnAssignment` (with concrete `filter` +
// `rowGrouping` shapes) under a distinct name so consumers can opt into
// the richer type without colliding with the base `ColumnAssignment`
// exported from colDef.
export type { ColumnAssignment as ColumnCustomizationAssignment } from './state';
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
  cssEscapeColId,
} from './transforms';
export {
  overrideKey,
  stripUndefined,
  mergeOverrides,
  writeOverridesReducer,
  applyTypographyReducer,
  applyColorsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  clearAllBordersReducer,
  applyHeaderNameReducer,
  applyEditableReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  removeTemplateRefFromAssignmentsReducer,
  clearAllStylesReducer,
  clearAllStylesInProfileReducer,
  type TargetKind,
} from './formattingActions';
