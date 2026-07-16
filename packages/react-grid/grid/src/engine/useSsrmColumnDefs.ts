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
