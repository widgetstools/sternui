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
// Hybrid discriminated union: `kind: 'preset'` covers the FormattingToolbar's
// menu (CSP-safe, validates at edit time); `kind: 'expression'` is the v1
// escape hatch for users who need full Intl.NumberFormat / arbitrary fns.
//
// `kind: 'expression'` compiles via `new Function(...)` — CSP-unsafe by design.
// Under strict CSP it falls back to identity formatter (see adapter for details).

export type PresetId = 'currency' | 'percent' | 'number' | 'date' | 'duration';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string };

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
