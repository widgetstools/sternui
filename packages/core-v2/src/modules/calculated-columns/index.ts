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

  onGridDestroy(ctx) {
    _engines.delete(ctx.gridId);
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

    // Cross-module read: column-customization may carry a
    // `valueFormatterTemplate` for a virtual column — that happens when
    // the user applies a format via the FormattingToolbar while a
    // virtual column is selected. The toolbar writes into
    // `ColumnCustomizationState.assignments[colId].valueFormatterTemplate`
    // (the single source of truth the toolbar knows about); calculated-
    // columns state carries its OWN `valueFormatterTemplate` for the
    // virtual column (written by the Calculated Column editor). The
    // toolbar takes precedence so a format the user just picked in the
    // toolbar wins over a stale editor-time choice — matching the
    // "last write wins" feel every other style the toolbar emits has.
    let overrides: Record<string, { valueFormatterTemplate?: unknown }> = {};
    try {
      const cust = gridCtx.getModuleState<{
        assignments?: Record<string, { valueFormatterTemplate?: unknown }>;
      }>('column-customization');
      overrides = cust?.assignments ?? {};
    } catch {
      /* column-customization not mounted — fall back to virtual-col defaults */
    }

    const virtualDefs = sorted.map((v) => {
      const override = overrides[v.colId];
      const merged =
        override?.valueFormatterTemplate !== undefined
          ? { ...v, valueFormatterTemplate: override.valueFormatterTemplate as typeof v.valueFormatterTemplate }
          : v;
      return buildVirtualColDef(merged, engine);
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
