import { ExpressionEngine } from '@grid-customizer/core';
import type { AnyColDef, Module } from '../../core/types';
import {
  INITIAL_CALCULATED_COLUMNS,
  type CalculatedColumnsState,
} from './state';
import { buildVirtualColDef } from './virtualColumn';
import {
  CalculatedColumnsEditor,
  CalculatedColumnsList,
  CalculatedColumnsPanel,
} from './CalculatedColumnsPanel';

// ─── Per-grid ExpressionEngine ──────────────────────────────────────────────
//
// Mirrors the conditional-styling pattern: one engine per gridId, lazily
// created on first transform, cleared on `onGridDestroy`. Isolates per-grid
// function registries for future use without leaking across `<MarketsGrid>`
// instances.

const _engines = new Map<string, ExpressionEngine>();

function getEngine(gridId: string): ExpressionEngine {
  let engine = _engines.get(gridId);
  if (!engine) {
    engine = new ExpressionEngine();
    _engines.set(gridId, engine);
  }
  return engine;
}

// ─── Per-grid cellValueChanged disposer ─────────────────────────────────────
//
// When the user edits a source column (e.g. `price`), AG-Grid only re-runs
// the valueGetter for that one cell's row. Virtual columns that compute
// cross-row aggregates (`SUM([price])`, `AVG([yield])`, …) would still show
// their stale totals on every OTHER row. We fix that by subscribing to
// `cellValueChanged` once per grid and forcing a refresh of every virtual
// column's cells, which re-runs each valueGetter and picks up the new
// aggregate total.
const _editListeners = new Map<string, () => void>();

// ─── Module ─────────────────────────────────────────────────────────────────

export const calculatedColumnsModule: Module<CalculatedColumnsState> = {
  id: 'calculated-columns',
  name: 'Calculated Columns',
  code: '03',
  schemaVersion: 1,
  // After column-customization (10) and column-templates (1) — virtual
  // columns should see the finalized base defs so column-customization's
  // renames/resizes propagate. Before conditional-styling (20) so its
  // rules can reference the new virtual colIds.
  priority: 15,

  getInitialState: () => ({
    // Demo seed — one virtual column so the feature is visible on first
    // load. Users can delete it via the settings panel.
    virtualColumns: [{
      colId: 'grossPnl',
      headerName: 'Gross P&L',
      expression: '[price] * [quantity] / 1000',
      position: 20,
      initialWidth: 120,
    }],
  }),

  onGridReady(ctx) {
    // Force virtual columns to re-evaluate after any row-data mutation so
    // column-wide aggregates (SUM/AVG/MIN/…) update across EVERY row, not
    // just the edited one. AG-Grid's default behaviour only re-runs the
    // changed cell's row-column intersection; aggregates touching the full
    // dataset need a grid-wide refresh.
    //
    // Listens to multiple lifecycle events because different mutation APIs
    // fire different signals:
    //   - `cellValueChanged`: in-place edits via the cell editor UI.
    //   - `rowDataUpdated`:   full-dataset replacement (host `rowData` prop change).
    //   - `rowValueChanged`:  `applyTransaction` update of a whole row.
    //
    // `getModuleState` is read at event time (not snapshot) so adding /
    // removing calc columns via the Settings panel stays in sync without
    // a remount.
    const prev = _editListeners.get(ctx.gridId);
    if (prev) prev();

    const listener = () => {
      const state = ctx.getModuleState<CalculatedColumnsState>('calculated-columns');
      const virtualIds = state?.virtualColumns?.map((v) => v.colId) ?? [];
      if (virtualIds.length === 0) return;
      try {
        ctx.gridApi.refreshCells({ columns: virtualIds, force: true });
      } catch {
        /* api teardown window — ignore */
      }
    };

    const events = ['cellValueChanged', 'rowValueChanged', 'rowDataUpdated'] as const;
    for (const evt of events) {
      try {
        ctx.gridApi.addEventListener(evt, listener);
      } catch {
        /* ignore */
      }
    }

    _editListeners.set(ctx.gridId, () => {
      for (const evt of events) {
        try {
          ctx.gridApi.removeEventListener(evt, listener);
        } catch {
          /* ignore */
        }
      }
    });
  },

  onGridDestroy(ctx) {
    _engines.delete(ctx.gridId);
    const dispose = _editListeners.get(ctx.gridId);
    if (dispose) {
      dispose();
      _editListeners.delete(ctx.gridId);
    }
  },

  transformColumnDefs(defs, state, gridCtx) {
    if (state.virtualColumns.length === 0) return defs;
    const engine = getEngine(gridCtx.gridId);
    // Sort by `position` when provided so users can control relative ordering
    // without fighting AG-Grid's column-state machinery. Falls back to
    // declaration order.
    const sorted = state.virtualColumns
      .slice()
      .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

    // Cross-module read: column-customization may carry a full
    // `ColumnAssignment` for a virtual column — that happens when the
    // user applies ANY toolbar style (typography, alignment, colors,
    // borders, value formatter) while a calculated column is selected.
    // The toolbar writes into `ColumnCustomizationState.assignments[colId]`
    // (the single source of truth the toolbar knows about); calculated-
    // columns carries its OWN per-column state for the virtual column
    // (written by the Calculated Column editor). Toolbar-applied
    // picks take precedence — matches the "last write wins" feel every
    // other toolbar control has.
    let assignments: Record<string, {
      valueFormatterTemplate?: unknown;
      cellStyleOverrides?: {
        alignment?: { horizontal?: 'left' | 'center' | 'right' };
        [k: string]: unknown;
      };
      headerStyleOverrides?: unknown;
      headerName?: string;
      headerTooltip?: string;
      initialWidth?: number;
      initialHide?: boolean;
      initialPinned?: 'left' | 'right' | boolean;
    }> = {};
    try {
      const cust = gridCtx.getModuleState<{
        assignments?: Record<string, Record<string, unknown>>;
      }>('column-customization');
      assignments = (cust?.assignments ?? {}) as typeof assignments;
    } catch {
      /* column-customization not mounted — fall back to virtual-col defaults */
    }

    const virtualDefs = sorted.map((v) => {
      const assignment = assignments[v.colId];
      const merged =
        assignment?.valueFormatterTemplate !== undefined
          ? {
              ...v,
              valueFormatterTemplate: assignment.valueFormatterTemplate as typeof v.valueFormatterTemplate,
            }
          : v;
      const baseColDef = buildVirtualColDef(merged, engine);

      if (!assignment) return baseColDef;

      // Layer in the cellClass / headerClass hooks so CSS injected by
      // column-customization's reinjectCSS reaches virtual cells too.
      // We don't need to compute the CSS body here — that's already
      // happening inside column-customization because it now iterates
      // its assignments keyed by colId, not by walking the base defs.
      const layered: typeof baseColDef = { ...baseColDef };
      if (assignment.headerName !== undefined) layered.headerName = assignment.headerName as string;
      if (assignment.headerTooltip !== undefined) layered.headerTooltip = assignment.headerTooltip as string;
      if (assignment.initialWidth !== undefined) layered.initialWidth = assignment.initialWidth as number;
      if (assignment.initialHide !== undefined) layered.initialHide = assignment.initialHide as boolean;
      if (assignment.initialPinned !== undefined) layered.initialPinned = assignment.initialPinned as 'left' | 'right' | boolean;

      if (assignment.cellStyleOverrides !== undefined) {
        const cls = `gc-col-c-${v.colId}`;
        const existing = baseColDef.cellClass;
        if (Array.isArray(existing)) layered.cellClass = [...existing, cls];
        else if (typeof existing === 'string') layered.cellClass = [existing, cls];
        else layered.cellClass = cls;
      }
      // Attach the header class whenever column-customization would emit
      // a header rule for this virtual column — EITHER the user set
      // header overrides explicitly OR just set cell alignment (which
      // the header follows by default via reinjectCSS's
      // `effectiveHeaderAlign` fallback). Without this second branch a
      // virtual column aligned from the Formatting Toolbar left only
      // the cell aligned; the header didn't follow like regular
      // columns do. Makes calc columns first-class in the toolbar
      // alignment pipeline.
      const needsHeaderClass =
        assignment.headerStyleOverrides !== undefined ||
        assignment.cellStyleOverrides?.alignment?.horizontal !== undefined;
      if (needsHeaderClass) {
        const cls = `gc-hdr-c-${v.colId}`;
        const existing = baseColDef.headerClass;
        if (Array.isArray(existing)) layered.headerClass = [...existing, cls];
        else if (typeof existing === 'string') layered.headerClass = [existing, cls];
        else layered.headerClass = cls;
      }
      return layered;
    });
    return [...defs, ...virtualDefs];
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') {
      return { virtualColumns: [...INITIAL_CALCULATED_COLUMNS.virtualColumns] };
    }
    const d = raw as Partial<CalculatedColumnsState>;
    const rawCols = Array.isArray(d.virtualColumns) ? d.virtualColumns : [];
    // Back-compat: v1 / early-v2 profiles stored `valueFormatterTemplate`
    // as a bare expression string. The field has since widened to the
    // full `ValueFormatterTemplate` discriminated union — migrate the
    // old shape into `{kind:'expression'}` so downstream code only ever
    // sees the union.
    const virtualColumns = rawCols.map((v) => {
      const t = (v as unknown as { valueFormatterTemplate?: unknown }).valueFormatterTemplate;
      if (typeof t === 'string') {
        return {
          ...v,
          valueFormatterTemplate: t.length > 0 ? { kind: 'expression' as const, expression: t } : undefined,
        };
      }
      return v;
    });
    return { virtualColumns };
  },

  SettingsPanel: CalculatedColumnsPanel,
  ListPane: CalculatedColumnsList,
  EditorPane: CalculatedColumnsEditor,
};

export { INITIAL_CALCULATED_COLUMNS } from './state';
export type { CalculatedColumnsState, VirtualColumnDef } from './state';

/** @internal — test helper to reset per-grid engines between cases. */
export function _resetCalculatedColumnsResourcesForTests(): void {
  _engines.clear();
}
