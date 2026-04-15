import type { ColDef, ColGroupDef } from 'ag-grid-community';
import type { AnyColDef, GridContext, Module } from '../../core/types';
import {
  INITIAL_COLUMN_CUSTOMIZATION,
  migrateFromLegacy,
  type ColumnAssignment,
  type ColumnCustomizationState,
  type LegacyColumnCustomizationState,
} from './state';
import { cellStyleToAgStyle } from './adapters/cellStyleToAgStyle';
import { valueFormatterFromTemplate } from './adapters/valueFormatterFromTemplate';
import { resolveTemplates } from '../column-templates/resolveTemplates';
import type { ColumnTemplatesState, ColumnDataType } from '../column-templates/state';

/**
 * Walk the column-def tree (handles ColGroupDef.children recursively) and
 * apply per-column inline overrides from `state.assignments`. Columns that
 * don't have an assignment pass through untouched — important for the common
 * case where most columns are unmodified, so we don't build new objects we
 * don't need.
 */
function applyAssignments(
  defs: AnyColDef[],
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
): AnyColDef[] {
  return defs.map((def) => {
    // Group: recurse into children. The group itself has no colId so it
    // can't be assigned — only leaves can.
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyAssignments(def.children, assignments, templatesState);
      // Only rebuild the group if a child actually changed reference, so
      // upstream React/AG-Grid memoization can short-circuit.
      const childrenUnchanged =
        next.length === def.children.length &&
        next.every((c, i) => c === def.children[i]);
      return childrenUnchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];
    if (!a) return def;

    // Resolve templates + typeDefault into a composite assignment.
    // `cellDataType` is AG-Grid's dataType vocabulary (numeric / date / string /
    // boolean) — the resolver only fires the typeDefault fallback when this is
    // set on the colDef AND the assignment has no explicit `templateIds`.
    const resolved = resolveTemplates(
      a,
      templatesState,
      colDef.cellDataType as ColumnDataType | undefined,
    );

    const merged: ColDef = { ...colDef };
    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;
    if (resolved.cellStyleOverrides !== undefined) {
      merged.cellStyle = cellStyleToAgStyle(resolved.cellStyleOverrides);
    }
    if (resolved.headerStyleOverrides !== undefined) {
      merged.headerStyle = cellStyleToAgStyle(resolved.headerStyleOverrides);
    }
    if (resolved.valueFormatterTemplate !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(resolved.valueFormatterTemplate);
    }
    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;
    return merged;
  });
}

/**
 * v2.0 Column Customization. Pure transformColumnDefs — no CSS injection, no
 * template composition (column-templates is out of v2.0 scope), no module
 * dependencies.
 *
 * Pure-fn design (no `_ctxMap` singleton like v1) — the module reads/writes
 * everything it needs through the state argument and the GridContext passed
 * to the transform. That removes the React-strict-mode hazard around stale
 * closure context that v1 worked around by retaining a `_lastRegisteredGridId`.
 */
export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: 'column-customization',
  name: 'Columns',
  schemaVersion: 3,                          // bumped from 2
  dependencies: ['column-templates'],
  // After general-settings (which sets defaultColDef) so per-column overrides
  // win when they conflict with the grid-wide defaults.
  priority: 10,

  getInitialState: () => ({ ...INITIAL_COLUMN_CUSTOMIZATION }),

  migrate(raw, fromVersion) {
    if (fromVersion === 1) {
      // No field renames between v1 and v2; new fields are all optional and
      // default to undefined. Tolerate non-object inputs (defensive — core
      // calls migrate with whatever was on disk).
      if (!raw || typeof raw !== 'object') {
        console.warn(
          `[core-v2] column-customization`,
          `malformed v1 snapshot (not an object); falling back to initial state.`,
        );
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      return raw as ColumnCustomizationState;
    }
    console.warn(
      `[core-v2] column-customization`,
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },

  transformColumnDefs(defs, state, ctx) {
    if (Object.keys(state.assignments).length === 0) return defs;
    const templatesState =
      ctx.getModuleState<ColumnTemplatesState>('column-templates');
    return applyAssignments(defs, state.assignments, templatesState);
  },

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') {
      return { ...INITIAL_COLUMN_CUSTOMIZATION };
    }
    const raw = data as Record<string, unknown>;
    // v1 shape: { overrides: {...} }, no 'assignments' key.
    if ('overrides' in raw && !('assignments' in raw)) {
      return migrateFromLegacy(raw as unknown as LegacyColumnCustomizationState);
    }
    // v1.x stored `templates` inside this module's state; that field has
    // moved to the `column-templates` module. Drop it on read so we don't
    // carry dead data forward.
    const { templates: _drop, ...rest } = raw as { templates?: unknown };
    void _drop;
    return {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      ...(rest as Partial<ColumnCustomizationState>),
    };
  },
};

export type { ColumnAssignment, ColumnCustomizationState };
export { INITIAL_COLUMN_CUSTOMIZATION };
