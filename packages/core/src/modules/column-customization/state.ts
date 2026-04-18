/**
 * Column-customization state shapes.
 *
 * The base `ColumnAssignment` lives in `colDef/types.ts` — imported here
 * and re-exported with the rich `filter` / `rowGrouping` shapes narrowed
 * from `unknown` to the concrete configs below.
 */
import type { ColumnAssignment as BaseAssignment } from '../../colDef';

// ─── Filter config ──────────────────────────────────────────────────────────

export type FilterKind =
  | 'agTextColumnFilter'
  | 'agNumberColumnFilter'
  | 'agDateColumnFilter'
  | 'agSetColumnFilter'
  | 'agMultiColumnFilter';

/** AG-Grid set-filter params we expose in the UI. */
export interface SetFilterOptions {
  suppressMiniFilter?: boolean;
  suppressSelectAll?: boolean;
  suppressSorting?: boolean;
  excelMode?: 'windows' | 'mac';
  defaultToNothingSelected?: boolean;
}

/** One entry in an `agMultiColumnFilter.filterParams.filters[]` list. */
export interface MultiFilterEntry {
  filter: FilterKind;
  display?: 'inline' | 'subMenu' | 'accordion';
  title?: string;
}

export interface ColumnFilterConfig {
  /**
   * Master toggle. `false` disables filtering on this column regardless of
   * `kind` / `floatingFilter`. Takes precedence over `filterable`.
   */
  enabled?: boolean;
  kind?: FilterKind;
  floatingFilter?: boolean;
  debounceMs?: number;
  closeOnApply?: boolean;
  buttons?: Array<'apply' | 'clear' | 'reset' | 'cancel'>;
  setFilterOptions?: SetFilterOptions;
  multiFilters?: MultiFilterEntry[];
}

// ─── Row-grouping / aggregation config ─────────────────────────────────────

export type AggFuncName =
  | 'sum'
  | 'min'
  | 'max'
  | 'count'
  | 'avg'
  | 'first'
  | 'last'
  | 'custom';

export interface RowGroupingConfig {
  // Tool-panel interactivity
  enableRowGroup?: boolean;
  enableValue?: boolean;
  enablePivot?: boolean;

  // Initial state
  rowGroup?: boolean;
  rowGroupIndex?: number;
  pivot?: boolean;
  pivotIndex?: number;

  // Aggregation
  aggFunc?: AggFuncName;
  /**
   * User-defined aggregation formula — compiled through the core expression
   * engine. Aggregate values array is exposed as `[value]`; formulas like
   * `SUM([value]) * 1.1` sum the aggregate values then multiply. Only read
   * when `aggFunc === 'custom'`.
   */
  customAggExpression?: string;
  /** Subset of aggFunc names allowed in the tool panel. */
  allowedAggFuncs?: string[];
}

// ─── Column assignment (narrowed) ──────────────────────────────────────────

export type ColumnAssignment = Omit<BaseAssignment, 'filter' | 'rowGrouping'> & {
  filter?: ColumnFilterConfig;
  rowGrouping?: RowGroupingConfig;
};

// ─── Module state ──────────────────────────────────────────────────────────

export interface ColumnCustomizationState {
  /** colId → assignment. Missing key = no overrides for that column. */
  assignments: Record<string, ColumnAssignment>;
}

export const INITIAL_COLUMN_CUSTOMIZATION: ColumnCustomizationState = {
  assignments: {},
};

// ─── Legacy v1 migration ───────────────────────────────────────────────────

export interface LegacyOverride {
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  // v1-only — silently dropped by v2+.
  headerStyle?: unknown;
  cellStyle?: unknown;
  cellEditorName?: unknown;
  cellEditorParams?: unknown;
  cellRendererName?: unknown;
}

export interface LegacyColumnCustomizationState {
  overrides: Record<string, LegacyOverride>;
}

export function migrateFromLegacy(legacy: LegacyColumnCustomizationState): ColumnCustomizationState {
  const assignments: Record<string, ColumnAssignment> = {};
  for (const [colId, o] of Object.entries(legacy.overrides ?? {})) {
    assignments[colId] = {
      colId,
      headerName: o.headerName,
      headerTooltip: o.headerTooltip,
      initialWidth: o.initialWidth,
      initialHide: o.initialHide,
      initialPinned: o.initialPinned,
      sortable: o.sortable,
      filterable: o.filterable,
      resizable: o.resizable,
    };
  }
  return { assignments };
}
