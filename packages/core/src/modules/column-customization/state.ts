/**
 * Column-customization state shapes.
 *
 * The base `ColumnAssignment` lives in `colDef/types.ts` — imported here
 * and re-exported with the rich `filter` / `rowGrouping` shapes narrowed
 * from `unknown` to the concrete configs below.
 */
import type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment as BaseAssignment,
  PresetId,
  TickToken,
  ValueFormatterTemplate,
} from '../../colDef';

// Re-export shared colDef types from this module's state.ts so v2 panels
// that import from `./state` (and can't easily be rewritten to reach into
// colDef directly) keep working.
export type { BorderSpec, CellStyleOverrides, PresetId, TickToken, ValueFormatterTemplate };

// ─── Filter config ──────────────────────────────────────────────────────────

export type FilterKind =
  | 'agTextColumnFilter'
  | 'agNumberColumnFilter'
  | 'agDateColumnFilter'
  | 'agSetColumnFilter'
  | 'agMultiColumnFilter'
  // Synthetic kind: AG-Grid agMultiColumnFilter with our streamSafeText
  // custom floating filter wired in at the column level. Behaves
  // identically to agMultiColumnFilter for the popup; the floating
  // filter row gets a typeable input with clear button + comma-token
  // routing (single token → text contains, multi token → set values).
  // Not a real AG-Grid filter type — transforms map it to
  // agMultiColumnFilter at colDef-emission time.
  | 'streamSafeMultiColumnFilter'
  // Same idea, number-flavoured: agMultiColumnFilter with our
  // streamSafeNumber floating filter that parses operator syntax
  // (>100, <=50, 100-150, >0 and <50, =100 or =200, 1,2,3,4) into
  // AG-Grid number-filter models. CSV of bare numbers routes to the
  // set sub-filter when present; everything else to the number
  // sub-filter as a single or compound condition model.
  | 'streamSafeMultiNumberColumnFilter';

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

// ─── Cell-editor config ────────────────────────────────────────────────────

/**
 * AG-Grid built-in cell editors we expose in the column-settings UI.
 * Custom registered editors can still ride through `cellEditorName` on
 * the base assignment — this enum just covers the ones the structured
 * editor knows how to author params for.
 */
export type CellEditorKind =
  | 'agTextCellEditor'
  | 'agNumberCellEditor'
  | 'agSelectCellEditor'
  | 'agRichSelectCellEditor'
  | 'agLargeTextCellEditor'
  | 'agDateCellEditor'
  | 'agCheckboxCellEditor';

export interface ColumnCellEditorConfig {
  kind: CellEditorKind;
  /**
   * Static value list for `agSelectCellEditor` / `agRichSelectCellEditor`.
   * Ignored when `valuesSource` is set (dynamic source wins).
   */
  values?: Array<string | number>;
  /**
   * Dynamic values reference. Format: `{{providerName.key}}`. Resolved at
   * EDIT TIME via `platform.resources.appData()` — the transform plants
   * a function getter on `cellEditorParams.values`, AG-Grid invokes it
   * each time the editor opens, so AppData mutations are reflected
   * without re-emitting colDefs. The resolved value is coerced to an
   * array of strings (numbers are stringified, single scalars become a
   * one-element array, anything else becomes empty).
   */
  valuesSource?: string;
  /**
   * Pass-through editor-specific params (max length, min/max, etc.).
   * Merged into the emitted `cellEditorParams`. Editor-specific schema
   * is enforced by the editor UI, not the type — keeps the schema lean.
   */
  params?: Record<string, unknown>;
}

// ─── Column assignment (narrowed) ──────────────────────────────────────────

export type ColumnAssignment = Omit<BaseAssignment, 'filter' | 'rowGrouping'> & {
  filter?: ColumnFilterConfig;
  rowGrouping?: RowGroupingConfig;
  /**
   * Structured cell-editor configuration. When set, the transform
   * resolves it into `cellEditor` + `cellEditorParams` on the colDef
   * (overriding any template-resolved values). When unset, the column
   * inherits whatever the column-templates resolver produced — the raw
   * `cellEditorName` / `cellEditorParams` pass-through path is still
   * honoured for non-structured callers.
   */
  cellEditor?: ColumnCellEditorConfig;
};

// ─── Module state ──────────────────────────────────────────────────────────

export interface ColumnCustomizationState {
  /** colId → assignment. Missing key = no overrides for that column. */
  assignments: Record<string, ColumnAssignment>;
}

export const INITIAL_COLUMN_CUSTOMIZATION: ColumnCustomizationState = {
  assignments: {},
};
