/**
 * Shared colDef-level types. These shapes are referenced by several modules
 * (column-templates, column-customization, conditional-styling, column-groups)
 * and by the rendering adapters under `./adapters/`. Keeping them in one
 * place stops the circular dependency v2 had where column-templates
 * imported from column-customization.
 */

// ─── Borders ────────────────────────────────────────────────────────────────

export interface BorderSpec {
  /** Pixel width. */
  width: number;
  /** Any CSS colour (hex, named, rgb[a]). */
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

// ─── Style overrides ────────────────────────────────────────────────────────
//
// Structured, editor-facing shape — `adapters/cellStyleToAgStyle.ts` flattens
// these into the CSS object AG-Grid consumes via `cellStyle` / `headerStyle`.
// Every field is optional so a fresh override equals `{}`.

export interface CellStyleOverrides {
  typography?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** px */
    fontSize?: number;
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

// ─── Value formatter template ──────────────────────────────────────────────
//
// Discriminated union covering four formatter sources:
//
//   - `preset`       — CSP-safe presets backed by Intl.*
//   - `expression`   — legacy `new Function(...)` escape hatch (CSP-unsafe;
//                      adapter falls back to identity under strict CSP)
//   - `excelFormat`  — Excel format strings parsed by SheetJS `ssf` (CSP-safe)
//   - `tick`         — fixed-income 32nds/64ths/128ths/256ths bond-price
//                      formatter (US Treasuries etc.)

export type PresetId = 'currency' | 'percent' | 'number' | 'date' | 'duration';

export type TickToken = 'TICK32' | 'TICK32_PLUS' | 'TICK64' | 'TICK128' | 'TICK256';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string }
  | { kind: 'excelFormat'; format: string }
  | { kind: 'tick'; tick: TickToken };

// ─── Data-type vocabulary ──────────────────────────────────────────────────

/**
 * The four broad buckets AG-Grid's `cellDataType` covers, as used by
 * column-templates' `typeDefaults`. Custom types (`object` etc.) are
 * deliberately excluded — typeDefaults are for "every numeric column
 * right-aligns" style rules.
 */
export type ColumnDataType = 'numeric' | 'date' | 'string' | 'boolean';

// ─── Column assignment ──────────────────────────────────────────────────────
//
// Per-column override. Lives here (rather than in column-customization) so
// column-templates can describe what it merges into without a circular dep.
// Modules that need richer shapes (filter config, row-grouping config) keep
// them declared where they land — we expose them here as `unknown` because
// resolveTemplates treats them as opaque wholesale-replace slots anyway.

export interface ColumnAssignment {
  readonly colId: string;

  // Identity
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;

  // Behaviour flags
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;

  // Appearance + formatting (merged per-field by column-templates)
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;
  valueFormatterTemplate?: ValueFormatterTemplate;

  // Template references — later wins on resolve.
  templateIds?: string[];

  // Direct editor / renderer overrides.
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;

  // Rich filter config + row-grouping config — treated as opaque by the
  // template resolver (wholesale-replace, no deep merge). The concrete
  // shapes live in column-customization's own state.ts.
  filter?: unknown;
  rowGrouping?: unknown;
}
