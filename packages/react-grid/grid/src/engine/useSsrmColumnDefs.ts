import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { GridPlatform } from '@starui/engine';
import {
  COLUMN_CUSTOMIZATION_MODULE_ID,
  type ColumnCustomizationState,
} from '../customizer/modules/column-customization/index.js';
import {
  CALCULATED_COLUMNS_MODULE_ID,
  type CalculatedColumnsState,
} from '../customizer/modules/calculated-columns/index.js';
import {
  applyPerspectivePlansToColDefs,
  buildSsrmCalcMaterializeContext,
  planSsrmCalcColumns,
  ssrmEngineCalcColumnDefs,
  type SsrmCalcMaterializeContext,
} from './ssrmCalcColumns.js';
import { applySsrmTrafficLightToColumnDefs } from './ssrmTrafficLightAgg.js';
import type { SSRMColDef } from './ssrmgrid-entry.js';

const EMPTY_MATERIALIZE: SsrmCalcMaterializeContext = {
  materializePlans: [],
  evalRow: () => null,
};

/** SSRM-only ColDef prep — RAG IFS custom agg + calc column Perspective/materialize plans. */
export function useSsrmColumnDefs(
  platform: GridPlatform,
  columnDefs: readonly SSRMColDef[],
  useSSRM: boolean,
): SSRMColDef[] {
  return useMemo(() => {
    if (!useSSRM) return columnDefs as SSRMColDef[];
    const cust = platform.store.getModuleState<ColumnCustomizationState>(
      COLUMN_CUSTOMIZATION_MODULE_ID,
    );
    let defs = applySsrmTrafficLightToColumnDefs(
      columnDefs as ColDef[],
      cust?.assignments,
    ) as SSRMColDef[];

    const calc = platform.store.getModuleState<CalculatedColumnsState>(
      CALCULATED_COLUMNS_MODULE_ID,
    );
    const plans = planSsrmCalcColumns(calc?.virtualColumns ?? []);
    defs = applyPerspectivePlansToColDefs(defs, plans);

    return defs;
  }, [platform, columnDefs, useSSRM]);
}

/** Calc columns for the Perspective surface: the ColDefs plus the expression
 *  map the row engine publishes to the worker. */
export interface PerspectiveCalcColumns {
  defs: SSRMColDef[];
  /** colId -> Perspective expression source. */
  expressions: Record<string, string>;
}

const EMPTY_EXPRESSIONS: Record<string, string> = {};

/**
 * Plan MarketsGrid's calculated columns as Perspective expression columns.
 *
 * Same planner the CustomSSRMGrid path uses — `planSsrmCalcColumns` already
 * compiles a StarUI expression to Perspective source — but that path ran only
 * when `useSSRM` was true, so on the Perspective surface a calculated column
 * was simply absent: no plan, no expression, no column.
 *
 * Only `kind: 'perspective'` plans can be served here. A `materialize` plan
 * needs a client-side pass over whole rows (`.old`/`.new` refs and the like),
 * and this window holds only the blocks in view — so those are left to their
 * client `valueGetter` rather than silently dropped.
 */
export function usePerspectiveCalcColumns(
  platform: GridPlatform,
  columnDefs: readonly SSRMColDef[],
  enabled: boolean,
): PerspectiveCalcColumns {
  return useMemo(() => {
    if (!enabled) {
      return { defs: columnDefs as SSRMColDef[], expressions: EMPTY_EXPRESSIONS };
    }
    const calc = platform.store.getModuleState<CalculatedColumnsState>(
      CALCULATED_COLUMNS_MODULE_ID,
    );
    const plans = planSsrmCalcColumns(calc?.virtualColumns ?? []);
    const expressions: Record<string, string> = {};
    for (const plan of plans) {
      if (plan.kind === 'perspective') expressions[plan.colId] = plan.perspectiveExpression;
    }
    return {
      // Drops the client `valueGetter` for server-resolved columns, so AG
      // renders the value the worker computed rather than recomputing it.
      defs: applyPerspectivePlansToColDefs(columnDefs as SSRMColDef[], plans),
      expressions,
    };
  }, [platform, columnDefs, enabled]);
}

/** Calc columns for the ssrm-engine surface: the ColDefs plus the ASTs. */
export interface SsrmEngineCalcColumns {
  defs: SSRMColDef[];
  /** `{colId, ast}` pairs — the only thing that crosses the worker port. */
  calcColumns: { colId: string; ast: unknown }[];
}

const EMPTY_CALC_COLUMNS: { colId: string; ast: unknown }[] = [];

/**
 * Plan MarketsGrid's calculated columns for `@starui/ssrm-engine`.
 *
 * The SAME planner both other server-side paths use, with a different backend:
 * `planSsrmCalcColumns(cols, { backend: 'ssrm-engine' })` parses the authored
 * string into the StarUI AST and hands it over. It deliberately does NOT
 * pre-validate against the engine's refusal list — cross-row reducers,
 * `NOW`/`TODAY`, unknown functions — because a second copy of that list is a
 * second thing to keep in step. The engine refuses BY NAME and retains the
 * reason in `calcDiagnostics()`, which is the channel that exists because
 * `console.warn` in a SharedWorker reaches no console anywhere.
 *
 * A `materialize` plan cannot be served here for the same reason it cannot be
 * served on the Perspective surface: it needs a client-side pass over whole
 * rows, and this window holds only the blocks in view. Those keep their client
 * `valueGetter` rather than being silently dropped.
 */
export function useSsrmEngineCalcColumns(
  platform: GridPlatform,
  columnDefs: readonly SSRMColDef[],
  enabled: boolean,
): SsrmEngineCalcColumns {
  return useMemo(() => {
    if (!enabled) {
      return { defs: columnDefs as SSRMColDef[], calcColumns: EMPTY_CALC_COLUMNS };
    }
    const calc = platform.store.getModuleState<CalculatedColumnsState>(
      CALCULATED_COLUMNS_MODULE_ID,
    );
    const plans = planSsrmCalcColumns(calc?.virtualColumns ?? [], { backend: 'ssrm-engine' });
    return {
      // Drops the client `valueGetter` for engine-resolved columns and binds
      // the field, which is where the engine stamps the value — on a leaf row
      // and, for an aggregation over it, on a group row too.
      defs: applyPerspectivePlansToColDefs(columnDefs as SSRMColDef[], plans),
      calcColumns: ssrmEngineCalcColumnDefs(plans),
    };
  }, [platform, columnDefs, enabled]);
}

/** Materialize-only calc plans + row evaluator for SSRM snapshot/tick enrich. */
export function useSsrmCalcMaterialize(
  platform: GridPlatform,
  columnDefs: readonly ColDef[],
  useSSRM: boolean,
): SsrmCalcMaterializeContext {
  return useMemo(() => {
    if (!useSSRM) return EMPTY_MATERIALIZE;
    const calc = platform.store.getModuleState<CalculatedColumnsState>(
      CALCULATED_COLUMNS_MODULE_ID,
    );
    return buildSsrmCalcMaterializeContext(
      calc?.virtualColumns ?? [],
      platform.resources.expression(),
    );
  }, [platform, columnDefs, useSSRM]);
}
