import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { GridPlatform } from '@starui/engine';
import {
  COLUMN_CUSTOMIZATION_MODULE_ID,
  type ColumnCustomizationState,
} from '../customizer/modules/column-customization/index.js';
import { applySsrmTrafficLightToColumnDefs } from './ssrmTrafficLightAgg.js';

/** SSRM-only ColDef prep — maps RAG IFS custom agg to `trafficLight`. */
export function useSsrmColumnDefs<T extends ColDef>(
  platform: GridPlatform,
  columnDefs: readonly T[],
  useSSRM: boolean,
): T[] {
  return useMemo(() => {
    if (!useSSRM) return columnDefs as T[];
    const cust = platform.store.getModuleState<ColumnCustomizationState>(
      COLUMN_CUSTOMIZATION_MODULE_ID,
    );
    return applySsrmTrafficLightToColumnDefs(columnDefs, cust?.assignments);
  }, [platform, columnDefs, useSSRM]);
}
