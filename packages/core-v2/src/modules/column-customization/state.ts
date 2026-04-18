/**
 * Per-column inline override. Every field is optional — only fields the user
 * has actually changed are stored, so a fresh column has `{ colId }` only.
 *
 * v2.1 schema (schemaVersion: 2) extends v2.0 with optional appearance,
 * formatter, and template-reference fields. All new fields are optional and
 * default to undefined, so existing v2.0 snapshots roundtrip unchanged.
 */
export interface ColumnAssignment {
  readonly colId: string;
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;

  // ─── New in schemaVersion 2 ──────────────────────────────────────────────
  // Per-column appearance + formatting. All optional; absent = no override.
  // Wired into AG-Grid by the transformers in `index.ts` via the adapters in
  // `./adapters/`. `templateIds` is stored only — column-templates resolution
  // ships in a future module port.
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;
  valueFormatterTemplate?: ValueFormatterTemplate;
  templateIds?: string[];                         // order = application order; later wins

  // ─── New in schemaVersion 3 (sub-project #2) ─────────────────────────────
  // Direct editor / renderer overrides. Resolved by AG-Grid's component
  // registry by name — consumers are responsible for registering components
  // via `GridOptions.components`. `cellEditorParams` is treated as opaque
  // and replaced wholesale on template merge (no deep merge).
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;

  // ─── New in schemaVersion 4 ──────────────────────────────────────────────
  // Rich per-column filter config. When present, takes precedence over the
  // legacy `filterable` boolean. The transform in `./index.ts` composes the
  // AG-Grid `filter` / `filterParams` / `floatingFilter` from this object.
  // All fields optional; absent = inherit defaults.
  filter?: ColumnFilterConfig;

  // ─── New in schemaVersion 5 ──────────────────────────────────────────────
  // Row-grouping + aggregation + pivot knobs. All optional. Applied to the
  // ColDef in `./index.ts` via `applyRowGroupingConfigToColDef`. Custom
  // aggregations compile an expression through the core ExpressionEngine,
  // same engine that powers Calculated Columns + Conditional Styling, so
  // `SUM([value]) * 1.1` is a legal aggregation formula.
  rowGrouping?: RowGroupingConfig;
}

// ─── Filter config ──────────────────────────────────────────────────────────
//
// We allow the user to pick any AG-Grid filter by its registered name. Common
// values: agTextColumnFilter / agNumberColumnFilter / agDateColumnFilter
// (Community); agSetColumnFilter / agMultiColumnFilter (Enterprise). `false`
// explicitly disables filtering on the column (overrides `filterable`).

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
  filter: FilterKind;                               // sub-filter kind
  display?: 'inline' | 'subMenu' | 'accordion';     // AG-Grid display mode
  title?: string;                                   // label in the multi-filter menu
}

// ─── Row-grouping / aggregation config ─────────────────────────────────────

/**
 * Built-in AG-Grid aggFunc names. Add `'custom'` to engage the expression-
 * driven path (see `RowGroupingConfig.customAggExpression`).
 */
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
  // ─── Tool-panel interactivity ─────────────────────────────
  /** Show this column as a drop target in the Row Groups panel. */
  enableRowGroup?: boolean;
  /** Show this column as a drop target in the Values panel (for aggregations). */
  enableValue?: boolean;
  /** Show this column as a drop target in the Pivots panel. */
  enablePivot?: boolean;

  // ─── Initial state ─────────────────────────────────────────
  /** Start the grid with this column actively row-grouped. */
  rowGroup?: boolean;
  /** 0-based ordering when multiple columns are grouped. */
  rowGroupIndex?: number;
  /** Start the grid with this column pivoted. */
  pivot?: boolean;
  pivotIndex?: number;

  // ─── Aggregation ─────────────────────────────────────────
  /**
   * AG-Grid aggFunc. Built-in strings ('sum' etc.) map directly to AG-Grid's
   * aggregation registry. `'custom'` engages the expression path.
   */
  aggFunc?: AggFuncName;

  /**
   * User-defined aggregation formula — compiled by the core expression
   * engine. The aggregate values array is exposed as the column reference
   * `[value]`, so a formula like `SUM([value]) * 1.1` sums the aggregate
   * values then applies a 10% multiplier. Only read when `aggFunc === 'custom'`.
   */
  customAggExpression?: string;

  /**
   * Subset of aggFunc names the user is allowed to pick from the tool panel.
   * When unset, AG-Grid uses its internal default.
   */
  allowedAggFuncs?: string[];
}

export interface ColumnFilterConfig {
  /**
   * Master toggle. When `false`, filtering is disabled on this column
   * regardless of `kind` / `floatingFilter`. Takes precedence over the
   * top-level `filterable` boolean.
   */
  enabled?: boolean;
  /** Filter registration name. Required when `enabled` is true. */
  kind?: FilterKind;
  /** Whether to render the floating-filter row cell for this column. */
  floatingFilter?: boolean;
  /** Debounce (ms) before the filter fires, for text/number/date filters. */
  debounceMs?: number;
  /** Apply button closes the popup when true. */
  closeOnApply?: boolean;
  /** Subset of AG-Grid filter buttons to render in the popup. */
  buttons?: Array<'apply' | 'clear' | 'reset' | 'cancel'>;
  /** Extra options when `kind === 'agSetColumnFilter'`. */
  setFilterOptions?: SetFilterOptions;
  /** Ordered list of sub-filters when `kind === 'agMultiColumnFilter'`. */
  multiFilters?: MultiFilterEntry[];
}

export interface ColumnCustomizationState {
  /** colId → assignment. Missing key = no overrides for that column. */
  assignments: Record<string, ColumnAssignment>;
}

export const INITIAL_COLUMN_CUSTOMIZATION: ColumnCustomizationState = {
  assignments: {},
};

// ─── Style override shapes (used by FormattingToolbar in v2.1) ──────────────
//
// Structured discriminated shapes — closed set matching the FormattingToolbar's
// editor controls. The flattener in `adapters/cellStyleToAgStyle.ts` converts
// these into a CSS object AG-Grid consumes via `colDef.cellStyle` / `headerStyle`.

export interface BorderSpec {
  width: number;                                  // px
  color: string;                                  // hex / css color
  style: 'solid' | 'dashed' | 'dotted';
}

export interface CellStyleOverrides {
  typography?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;                            // px
  };
  colors?: {
    text?: string;
    background?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
  };
  borders?: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };
}

// ─── Value-formatter template ───────────────────────────────────────────────
//
// Discriminated union covering three formatter sources:
//   - `kind: 'preset'`      — FormattingToolbar's menu of CSP-safe presets
//                             (currency / percent / number / date / duration),
//                             backed by `Intl.NumberFormat` and friends.
//   - `kind: 'expression'`  — v1 escape hatch compiling user expressions via
//                             `new Function(...)`. CSP-unsafe by design; under
//                             strict CSP it falls back to identity (see adapter).
//   - `kind: 'excelFormat'` — Excel format-string syntax like `#,##0.00`,
//                             `$#,##0;(#,##0)`, `[Red]#,##0`, `yyyy-mm-dd`.
//                             Parsed by `ssf` (SheetJS format). Full Excel
//                             parity including conditional sections, colors,
//                             date codes, parens-for-negative. CSP-safe.
//   - `kind: 'tick'`        — Fixed-income bond price convention where a
//                             decimal number is split into an integer "handle"
//                             plus a fractional "tick" in 32nds (or 64ths /
//                             128ths / 256ths). Common for US Treasuries
//                             and Treasury futures. See `tickFormatter.ts`
//                             for the exact rounding rules per token.

export type PresetId = 'currency' | 'percent' | 'number' | 'date' | 'duration';

/**
 * Fixed-income tick-format token. Bond prices like 101.50 display as
 * "101-16" (101 + 16/32). Sub-tick precision tokens split each 32nd
 * further; see `tickFormatter.ts` for the render rules per token.
 */
export type TickToken = 'TICK32' | 'TICK32_PLUS' | 'TICK64' | 'TICK128' | 'TICK256';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string }
  | { kind: 'excelFormat'; format: string }
  | { kind: 'tick'; tick: TickToken };

// ─── Migration from v1 ──────────────────────────────────────────────────────
//
// v1 stored `state.overrides[colId] = { headerName, headerStyle, ... }`. v2
// moved cell/header style fields out (will live in conditional-styling and a
// future formatting module) and renamed `overrides` → `assignments`. We strip
// any v1 fields v2 doesn't know about so the reduced state is clean.

export interface LegacyOverride {
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  // These existed in v1 but are out-of-scope in v2.0 — silently dropped.
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
